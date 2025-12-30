package com.chatbooktemp.sms;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class MmsWapPushReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    // No-op: required only to make the app eligible to be set as default SMS app on some devices.
  }
}
