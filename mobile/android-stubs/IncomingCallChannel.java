package qa.e3.fec.callcenter;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

/**
 * Create the high-importance channel used by Call Center FCM offers.
 * Call from MainActivity.onCreate after Capacitor init:
 *
 *   IncomingCallChannel.ensure(this);
 *
 * Channel id MUST stay "incoming_calls" (server android.notification.channelId).
 */
public final class IncomingCallChannel {
  public static final String ID = "incoming_calls";

  private IncomingCallChannel() {}

  public static void ensure(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm =
        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null) return;
    NotificationChannel existing = nm.getNotificationChannel(ID);
    if (existing != null) return;
    NotificationChannel channel =
        new NotificationChannel(ID, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("FEC Call Center queue offers");
    channel.enableVibration(true);
    channel.setBypassDnd(true);
    nm.createNotificationChannel(channel);
  }
}
