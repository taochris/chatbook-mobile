package com.chatbooktemp.smsreader;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.util.Log;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

public class SmsReaderModule extends ReactContextBaseJavaModule {

    private static final String TAG = "SmsReaderModule";

    SmsReaderModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return "SmsReader";
    }

    @ReactMethod
    public void getMessagesByAddress(String address, int limit, Promise promise) {
        if (address == null || address.isEmpty()) {
            promise.reject("INVALID_ADDRESS", "Address cannot be empty");
            return;
        }

        // Nettoyer le numéro pour la recherche (garder les 9 derniers chiffres pour matcher les formats +33/06)
        String cleanAddress = address.replaceAll("[^0-9]", "");
        String searchPattern = cleanAddress;
        if (cleanAddress.length() > 9) {
            searchPattern = cleanAddress.substring(cleanAddress.length() - 9);
        }

        Log.d(TAG, "Fetching SMS+MMS for address: " + address + " (pattern: " + searchPattern + ") limit=" + limit);

        WritableArray allMessages = Arguments.createArray();
        ContentResolver cr = getReactApplicationContext().getContentResolver();
        
        // 1. Charger les SMS classiques
        Uri smsUri = Uri.parse("content://sms");
        String smsSelection = "address LIKE ?";
        String[] smsSelectionArgs = new String[]{"%" + searchPattern};
        String smsSortOrder = "date DESC";
        
        if (limit > 0) {
            smsSortOrder += " LIMIT " + limit;
        }

        try (Cursor cursor = cr.query(smsUri, null, smsSelection, smsSelectionArgs, smsSortOrder)) {
            if (cursor != null && cursor.moveToFirst()) {
                int indexId = cursor.getColumnIndex("_id");
                int indexThreadId = cursor.getColumnIndex("thread_id");
                int indexAddress = cursor.getColumnIndex("address");
                int indexBody = cursor.getColumnIndex("body");
                int indexDate = cursor.getColumnIndex("date");
                int indexType = cursor.getColumnIndex("type");
                int indexRead = cursor.getColumnIndex("read");

                do {
                    WritableMap message = Arguments.createMap();
                    message.putString("_id", "sms_" + cursor.getString(indexId));
                    message.putString("thread_id", cursor.getString(indexThreadId));
                    message.putString("address", cursor.getString(indexAddress));
                    message.putString("body", cursor.getString(indexBody));
                    message.putDouble("date", cursor.getLong(indexDate)); // déjà en ms
                    message.putInt("type", cursor.getInt(indexType));
                    message.putInt("read", cursor.getInt(indexRead));
                    message.putBoolean("isMms", false);
                    
                    allMessages.pushMap(message);
                } while (cursor.moveToNext());
            }
            Log.d(TAG, "Found " + allMessages.size() + " SMS");
        } catch (Exception e) {
            Log.e(TAG, "Error reading SMS", e);
        }

        // 2. Récupérer le thread_id du contact depuis les SMS
        String threadId = null;
        try (Cursor threadCursor = cr.query(smsUri, new String[]{"thread_id"}, smsSelection, smsSelectionArgs, "date DESC LIMIT 1")) {
            if (threadCursor != null && threadCursor.moveToFirst()) {
                threadId = threadCursor.getString(0);
                Log.d(TAG, "Thread ID for contact: " + threadId);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error getting thread_id", e);
        }

        // 3. Charger les MMS texte du même thread_id
        if (threadId != null) {
            try {
                Uri mmsUri = Uri.parse("content://mms");
                String mmsSelection = "thread_id = ?";
                String[] mmsSelectionArgs = new String[]{threadId};
                String mmsSortOrder = "date DESC";
                
                if (limit > 0) {
                    mmsSortOrder += " LIMIT " + limit;
                }

                int mmsCount = 0;
                try (Cursor mmsCursor = cr.query(mmsUri, null, mmsSelection, mmsSelectionArgs, mmsSortOrder)) {
                    if (mmsCursor != null && mmsCursor.moveToFirst()) {
                        int indexMmsId = mmsCursor.getColumnIndex("_id");
                        int indexThreadId = mmsCursor.getColumnIndex("thread_id");
                        int indexDate = mmsCursor.getColumnIndex("date");
                        int indexMsgBox = mmsCursor.getColumnIndex("msg_box");
                        int indexRead = mmsCursor.getColumnIndex("read");

                        do {
                            String mmsId = mmsCursor.getString(indexMmsId);
                            long dateSeconds = mmsCursor.getLong(indexDate);
                            long dateMs = dateSeconds * 1000; // MMS date en secondes → ms
                            
                            // Extraire le texte du MMS depuis la table part
                            String mmsText = extractMmsText(cr, mmsId);
                            
                            // Seulement ajouter si le MMS contient du texte
                            if (mmsText != null && !mmsText.isEmpty()) {
                                WritableMap message = Arguments.createMap();
                                message.putString("_id", "mms_" + mmsId);
                                message.putString("thread_id", mmsCursor.getString(indexThreadId));
                                message.putString("address", address); // utiliser l'adresse recherchée
                                message.putString("body", mmsText);
                                message.putDouble("date", dateMs);
                                message.putInt("type", mmsCursor.getInt(indexMsgBox)); // 1=received, 2=sent
                                message.putInt("read", mmsCursor.getInt(indexRead));
                                message.putBoolean("isMms", true);
                                
                                allMessages.pushMap(message);
                                mmsCount++;
                            }
                        } while (mmsCursor.moveToNext());
                    }
                    Log.d(TAG, "Found " + mmsCount + " MMS with text");
                }
            } catch (Exception e) {
                Log.e(TAG, "Error reading MMS", e);
            }
        }
        
        Log.d(TAG, "Total SMS+MMS: " + allMessages.size());

        promise.resolve(allMessages);
    }

    private String extractMmsText(ContentResolver cr, String mmsId) {
        Uri partUri = Uri.parse("content://mms/part");
        String selection = "mid = ?";
        String[] selectionArgs = new String[]{mmsId};
        StringBuilder text = new StringBuilder();

        try (Cursor cursor = cr.query(partUri, null, selection, selectionArgs, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int indexText = cursor.getColumnIndex("text");
                int indexCt = cursor.getColumnIndex("ct");

                do {
                    String contentType = cursor.getString(indexCt);
                    // Seulement extraire le texte (pas les images/audio)
                    if (contentType != null && contentType.startsWith("text/")) {
                        String partText = cursor.getString(indexText);
                        if (partText != null) {
                            if (text.length() > 0) text.append(" ");
                            text.append(partText);
                        }
                    }
                } while (cursor.moveToNext());
            }
        } catch (Exception e) {
            Log.e(TAG, "Error extracting MMS text for id " + mmsId, e);
        }

        return text.toString();
    }
    
    @ReactMethod
    public void getAllMessagesByAddress(String address, Promise promise) {
        // Alias pour récupérer tout (limit = 0)
        getMessagesByAddress(address, 0, promise);
    }
}
