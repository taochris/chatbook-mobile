package com.chatbooktemp.sms;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;

public class RespondViaMessageService extends Service {
  @Override
  public IBinder onBind(Intent intent) {
    // No-op: required only to make the app eligible to be set as default SMS app on some devices.
    return null;
  }
}
