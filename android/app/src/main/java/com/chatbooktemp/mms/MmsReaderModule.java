package com.chatbooktemp.mms;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Telephony;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

/**
 * Android native module to read MMS attachments (images/audio) for 1-to-1 conversations.
 *
 * Notes:
 * - We resolve the thread_id primarily from the SMS table by address. This matches the current JS
 *   conversation model (id = normalized number).
 * - Fallback resolution tries to find a MMS message for that address.
 */
public class MmsReaderModule extends ReactContextBaseJavaModule {
  private final ReactApplicationContext reactContext;
  private static final String TAG = "MmsReader";

  public MmsReaderModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
  }

  @NonNull
  @Override
  public String getName() {
    return "MmsReader";
  }

  @ReactMethod
  public void debugMmsDatabase(Promise promise) {
    try {
      ContentResolver cr = reactContext.getContentResolver();
      WritableMap result = Arguments.createMap();

      // 1. Count all MMS messages
      Cursor mmsCursor = cr.query(Uri.parse("content://mms"), new String[]{"_id", "thread_id", "date", "msg_box"}, null, null, null);
      int mmsCount = mmsCursor != null ? mmsCursor.getCount() : 0;
      result.putInt("totalMmsCount", mmsCount);
      Log.d(TAG, "DEBUG: Total MMS in database = " + mmsCount);

      WritableArray mmsDetails = Arguments.createArray();
      if (mmsCursor != null && mmsCursor.moveToFirst()) {
        int idIdx = mmsCursor.getColumnIndex("_id");
        int threadIdx = mmsCursor.getColumnIndex("thread_id");
        int dateIdx = mmsCursor.getColumnIndex("date");
        int boxIdx = mmsCursor.getColumnIndex("msg_box");
        int count = 0;
        do {
          if (count < 20) { // Log first 20 MMS
            WritableMap m = Arguments.createMap();
            m.putString("mmsId", mmsCursor.getString(idIdx));
            m.putInt("threadId", mmsCursor.getInt(threadIdx));
            m.putDouble("date", (double) mmsCursor.getLong(dateIdx));
            m.putInt("msgBox", mmsCursor.getInt(boxIdx));
            mmsDetails.pushMap(m);
            Log.d(TAG, "DEBUG MMS: id=" + mmsCursor.getString(idIdx) + " thread=" + mmsCursor.getInt(threadIdx) + " date=" + mmsCursor.getLong(dateIdx));
          }
          count++;
        } while (mmsCursor.moveToNext());
        mmsCursor.close();
      }
      result.putArray("mmsDetails", mmsDetails);

      // 3. Count all MMS parts
      Cursor partsCursor = null;
      try {
          partsCursor = cr.query(Uri.parse("content://mms/part"), null, null, null, null);
          int partsCount = partsCursor != null ? partsCursor.getCount() : 0;
          result.putInt("totalPartsCount", partsCount);
          Log.d(TAG, "DEBUG: Total MMS parts in database = " + partsCount);

          if (partsCursor != null) {
              String[] columnNames = partsCursor.getColumnNames();
              WritableArray cols = Arguments.createArray();
              for (String col : columnNames) cols.pushString(col);
              result.putArray("partsColumns", cols);
              Log.d(TAG, "DEBUG: Parts columns: " + java.util.Arrays.toString(columnNames));
          }
      } finally {
          if (partsCursor != null) partsCursor.close();
      }

      // 3. Check if app is default SMS
      String pkg = reactContext.getPackageName();
      String defaultPkg = Telephony.Sms.getDefaultSmsPackage(reactContext);
      result.putString("currentPackage", pkg);
      result.putString("defaultSmsPackage", defaultPkg);
      result.putBoolean("isDefaultSms", pkg != null && pkg.equals(defaultPkg));
      Log.d(TAG, "DEBUG: currentPkg=" + pkg + " defaultSmsPkg=" + defaultPkg);

      promise.resolve(result);
    } catch (Exception e) {
      Log.e(TAG, "debugMmsDatabase error", e);
      promise.reject("E_DEBUG", e.getMessage(), e);
    }
  }

  @ReactMethod
  public void isDefaultSmsApp(Promise promise) {
    try {
      String pkg = reactContext.getPackageName();
      String defaultPkg = Telephony.Sms.getDefaultSmsPackage(reactContext);
      promise.resolve(pkg != null && pkg.equals(defaultPkg));
    } catch (Exception e) {
      promise.reject("E_DEFAULT_SMS_CHECK", e.getMessage(), e);
    }
  }

  @ReactMethod
  public void requestDefaultSmsApp(Promise promise) {
    try {
      String pkg = reactContext.getPackageName();
      Intent intent = new Intent(Telephony.Sms.Intents.ACTION_CHANGE_DEFAULT);
      intent.putExtra(Telephony.Sms.Intents.EXTRA_PACKAGE_NAME, pkg);
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      reactContext.startActivity(intent);
      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("E_DEFAULT_SMS_REQUEST", e.getMessage(), e);
    }
  }

  @ReactMethod
  public void copyContentUriToCache(String contentUriString, Promise promise) {
    InputStream in = null;
    FileOutputStream out = null;
    try {
      if (contentUriString == null || contentUriString.trim().isEmpty()) {
        promise.reject("E_INVALID_URI", "contentUri is required");
        return;
      }

      Uri contentUri = Uri.parse(contentUriString);
      ContentResolver cr = reactContext.getContentResolver();

      String mimeType = null;
      try {
        mimeType = cr.getType(contentUri);
      } catch (Exception ignored) {
        mimeType = null;
      }

      String ext = "bin";
      if (mimeType != null) {
        if (mimeType.startsWith("image/")) {
          ext = mimeType.substring("image/".length());
        } else if (mimeType.startsWith("audio/")) {
          ext = mimeType.substring("audio/".length());
        }
        if (ext == null || ext.trim().isEmpty()) ext = "bin";
        // Normalize common mime-derived extensions
        if ("jpeg".equalsIgnoreCase(ext)) ext = "jpg";
      }

      File cacheDir = reactContext.getCacheDir();
      File outFile = File.createTempFile("mms_", "." + ext, cacheDir);

      in = cr.openInputStream(contentUri);
      if (in == null) {
        promise.reject("E_OPEN_STREAM", "Unable to open input stream for uri");
        return;
      }

      out = new FileOutputStream(outFile);
      byte[] buffer = new byte[8192];
      int read;
      long total = 0;
      while ((read = in.read(buffer)) != -1) {
        out.write(buffer, 0, read);
        total += read;
      }
      out.flush();

      WritableMap result = Arguments.createMap();
      result.putString("fileUri", Uri.fromFile(outFile).toString());
      result.putString("mimeType", mimeType);
      result.putDouble("size", (double) total);

      promise.resolve(result);
    } catch (Exception e) {
      Log.e(TAG, "copyContentUriToCache error", e);
      promise.reject("E_COPY_URI", e.getMessage(), e);
    } finally {
      try {
        if (in != null) in.close();
      } catch (Exception ignored) {}
      try {
        if (out != null) out.close();
      } catch (Exception ignored) {}
    }
  }

  @ReactMethod
  public void getMmsMedia(String address, double dateFromMs, double dateToMs, Promise promise) {
    try {
      if (address == null || address.trim().isEmpty()) {
        promise.reject("E_INVALID_ADDRESS", "Address is required");
        return;
      }

      Log.d(TAG, "getMmsMedia address=" + address + " fromMs=" + (long) dateFromMs + " toMs=" + (long) dateToMs);

      long threadId = resolveThreadIdForAddress(address);
      Log.d(TAG, "Resolved threadId=" + threadId + " for address=" + address);
      if (threadId <= 0) {
        // No thread found -> return empty list (no crash)
        promise.resolve(Arguments.createArray());
        return;
      }

      long fromSeconds = (long) Math.floor(dateFromMs / 1000.0);
      long toSeconds = (long) Math.floor(dateToMs / 1000.0);

      WritableArray result = Arguments.createArray();

      ContentResolver cr = reactContext.getContentResolver();
      Uri mmsUri = Uri.parse("content://mms");

      String[] projection = new String[] {"_id", "date", "msg_box", "thread_id"};
      String selection = "thread_id=? AND date>=? AND date<=?";
      String[] selArgs = new String[] {String.valueOf(threadId), String.valueOf(fromSeconds), String.valueOf(toSeconds)};

      Cursor cursor = null;
      try {
        cursor = cr.query(mmsUri, projection, selection, selArgs, "date ASC");
        if (cursor == null) {
          promise.resolve(result);
          return;
        }

        Log.d(TAG, "MMS rows found=" + cursor.getCount() + " for threadId=" + threadId);

        int idIdx = cursor.getColumnIndex("_id");
        int dateIdx = cursor.getColumnIndex("date");
        int msgBoxIdx = cursor.getColumnIndex("msg_box");

        while (cursor.moveToNext()) {
          String mmsId = cursor.getString(idIdx);
          long dateSeconds = cursor.getLong(dateIdx);
          int msgBox = cursor.getInt(msgBoxIdx);

          WritableMap mmsItem = Arguments.createMap();
          mmsItem.putString("mmsId", mmsId);
          mmsItem.putDouble("timestamp", dateSeconds * 1000.0);
          mmsItem.putString("direction", msgBox == 1 ? "received" : "sent");

          WritableArray parts = readMmsParts(mmsId);
          if (parts != null) {
            Log.d(TAG, "mmsId=" + mmsId + " parts=" + parts.size());
          }
          if (parts.size() > 0) {
            mmsItem.putArray("parts", parts);
            result.pushMap(mmsItem);
          }
        }
      } finally {
        if (cursor != null) cursor.close();
      }

      promise.resolve(result);
    } catch (Exception e) {
      promise.reject("E_MMS_READ", e.getMessage(), e);
    }
  }

  private long resolveThreadIdForAddress(String address) {
    if (address == null || address.trim().isEmpty()) return -1;
    
    // 1) Try standard Android API first (most reliable)
    try {
        long threadId = Telephony.Threads.getOrCreateThreadId(reactContext, address);
        if (threadId > 0) {
            Log.d(TAG, "getOrCreateThreadId found: " + threadId + " for " + address);
            return threadId;
        }
    } catch (Exception e) {
        Log.d(TAG, "getOrCreateThreadId failed: " + e.getMessage());
    }

    // 2) Fallback to SMS table search
    long threadId = resolveThreadIdFromSms(address);
    if (threadId > 0) return threadId;

    // 3) Fallback to MMS address table search
    return resolveThreadIdFromMmsAddr(address);
  }

  private long resolveThreadIdFromSms(String address) {
    ContentResolver cr = reactContext.getContentResolver();
    Uri smsUri = Uri.parse("content://sms");

    Cursor cursor = null;
    try {
      // 1) Exact match first
      cursor = cr.query(
          smsUri,
          new String[] {"thread_id"},
          "address=?",
          new String[] {address},
          "date DESC"
      );

      if (cursor != null && cursor.moveToFirst()) {
        int idx = cursor.getColumnIndex("thread_id");
        if (idx >= 0) return cursor.getLong(idx);
      }

      // 2) Fallback: match by last digits (handles +33 / spaces / separators)
      String digits = normalizeDigits(address);
      if (digits.isEmpty()) return -1;

      String tail = digits.length() <= 8 ? digits : digits.substring(digits.length() - 8);
      if (cursor != null) cursor.close();
      cursor = cr.query(
          smsUri,
          new String[] {"thread_id", "address"},
          "address LIKE ?",
          new String[] {"%" + tail},
          "date DESC"
      );
      if (cursor != null && cursor.moveToFirst()) {
        int idx = cursor.getColumnIndex("thread_id");
        if (idx >= 0) return cursor.getLong(idx);
      }

      return -1;
    } catch (Exception ignored) {
      return -1;
    } finally {
      if (cursor != null) cursor.close();
    }
  }

  private long resolveThreadIdFromMmsAddr(String address) {
    ContentResolver cr = reactContext.getContentResolver();
    Uri addrUri = Uri.parse("content://mms/addr");

    Cursor cursor = null;
    try {
      // type=137 indicates FROM (sender). For sent messages, the address table can vary, so we keep it broad.
      cursor = cr.query(
        addrUri,
        new String[] {"msg_id"},
        "address=?",
        new String[] {address},
        "msg_id DESC"
      );

      String msgId = null;
      if (cursor != null && cursor.moveToFirst()) {
        int msgIdIdx = cursor.getColumnIndex("msg_id");
        if (msgIdIdx >= 0) msgId = cursor.getString(msgIdIdx);
      }

      if (msgId == null) {
        // Fallback match by last digits
        String digits = normalizeDigits(address);
        if (digits.isEmpty()) return -1;
        String tail = digits.length() <= 8 ? digits : digits.substring(digits.length() - 8);
        if (cursor != null) cursor.close();
        cursor = cr.query(
            addrUri,
            new String[] {"msg_id", "address"},
            "address LIKE ?",
            new String[] {"%" + tail},
            "msg_id DESC"
        );
        if (cursor != null && cursor.moveToFirst()) {
          int msgIdIdx = cursor.getColumnIndex("msg_id");
          if (msgIdIdx >= 0) msgId = cursor.getString(msgIdIdx);
        }
      }

      if (msgId == null) return -1;

      Uri mmsUri = Uri.parse("content://mms");
      Cursor mmsCursor = null;
      try {
        mmsCursor = cr.query(
          mmsUri,
          new String[] {"thread_id"},
          "_id=?",
          new String[] {msgId},
          null
        );
        if (mmsCursor != null && mmsCursor.moveToFirst()) {
          int idx = mmsCursor.getColumnIndex("thread_id");
          if (idx >= 0) {
            return mmsCursor.getLong(idx);
          }
        }
        return -1;
      } finally {
        if (mmsCursor != null) mmsCursor.close();
      }
    } catch (Exception ignored) {
      return -1;
    } finally {
      if (cursor != null) cursor.close();
    }
  }

  private String normalizeDigits(String input) {
    if (input == null) return "";
    return input.replaceAll("[^0-9]", "");
  }

  private WritableArray readMmsParts(String mmsId) {
    WritableArray parts = Arguments.createArray();
    ContentResolver cr = reactContext.getContentResolver();
    Uri partUri = Uri.parse("content://mms/part");
    
    // Minimal projection that is most likely to be supported on all devices
    String[] projection = new String[] {"_id", "mid", "ct", "_data", "text"};
    
    Cursor cursor = null;
    try {
      // 1. Try standard query with selection
      cursor = cr.query(partUri, projection, "mid=?", new String[] {mmsId}, null);
      
      // 2. Fallback: try direct URI if standard query fails
      if (cursor == null || cursor.getCount() == 0) {
        if (cursor != null) cursor.close();
        Uri directUri = Uri.parse("content://mms/" + mmsId + "/part");
        cursor = cr.query(directUri, projection, null, null, null);
      }
      
      // 3. Last resort: full scan (slow but works when selection is blocked)
      if (cursor == null || cursor.getCount() == 0) {
        if (cursor != null) cursor.close();
        Log.d(TAG, "readMmsParts fallback to full scan for mid=" + mmsId);
        cursor = cr.query(partUri, projection, null, null, null);
        if (cursor != null) {
            int midIdx = cursor.getColumnIndex("mid");
            int idIdx = cursor.getColumnIndex("_id");
            int ctIdx = cursor.getColumnIndex("ct");
            int dataIdx = cursor.getColumnIndex("_data");
            int textIdx = cursor.getColumnIndex("text");
            
            WritableArray matchedParts = Arguments.createArray();
            int count = 0;
            while (cursor.moveToNext()) {
                String mid = cursor.getString(midIdx);
                if (mmsId.equals(mid)) {
                    String partId = cursor.getString(idIdx);
                    String ct = cursor.getString(ctIdx);
                    String data = dataIdx >= 0 ? cursor.getString(dataIdx) : null;
                    String text = textIdx >= 0 ? cursor.getString(textIdx) : null;
                    
                    if (isMediaPart(ct, data)) {
                        WritableMap p = Arguments.createMap();
                        p.putString("partId", partId);
                        p.putString("mimeType", ct);
                        p.putString("uri", "content://mms/part/" + partId);
                        p.putString("data", data);
                        matchedParts.pushMap(p);
                    }
                }
                count++;
            }
            Log.d(TAG, "readMmsParts full scan done. scanned=" + count + " matched=" + matchedParts.size());
            return matchedParts;
        }
      }

      if (cursor == null) return parts;

      int idIdx = cursor.getColumnIndex("_id");
      int ctIdx = cursor.getColumnIndex("ct");
      int dataIdx = cursor.getColumnIndex("_data");
      
      while (cursor.moveToNext()) {
        String partId = cursor.getString(idIdx);
        String ct = cursor.getString(ctIdx);
        String data = dataIdx >= 0 ? cursor.getString(dataIdx) : null;
        
        if (isMediaPart(ct, data)) {
            WritableMap p = Arguments.createMap();
            p.putString("partId", partId);
            p.putString("mimeType", ct);
            p.putString("uri", "content://mms/part/" + partId);
            p.putString("data", data);
            parts.pushMap(p);
        }
      }
    } catch (Exception e) {
      Log.e(TAG, "Error reading MMS parts for " + mmsId, e);
    } finally {
      if (cursor != null) cursor.close();
    }
    return parts;
  }

  private boolean isMediaPart(String ct, String data) {
    if (ct == null) return false;
    if (ct.startsWith("image/") || ct.startsWith("audio/")) return true;
    
    // Check extension in data path if ct is generic
    if (data != null) {
        String dp = data.toLowerCase();
        if (dp.endsWith(".jpg") || dp.endsWith(".jpeg") || dp.endsWith(".png") || dp.endsWith(".gif") || dp.endsWith(".webp")) return true;
        if (dp.endsWith(".mp3") || dp.endsWith(".m4a") || dp.endsWith(".aac") || dp.endsWith(".amr") || dp.endsWith(".wav") || dp.endsWith(".ogg")) return true;
    }
    return false;
  }
}
