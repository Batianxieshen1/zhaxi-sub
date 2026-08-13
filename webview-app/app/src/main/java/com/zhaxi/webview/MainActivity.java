package com.zhaxi.webview;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.DownloadManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Calendar;

public class MainActivity extends Activity {

    private WebView webView;
    private SwipeRefreshLayout swipe;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int REQ_FILE = 9001;
    private static final int REQ_NOTIFY = 9002;
    private static final String URL = "https://batianxieshen1.github.io/zhaxi-sub/";
    public static final String CHANNEL_ID = "renewal";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        createNotificationChannel();
        requestNotificationPermission();

        webView = new WebView(this);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);      // localStorage（应用数据）
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMediaPlaybackRequiresUserGesture(false);

        webView.setBackgroundColor(Color.WHITE);
        webView.setWebViewClient(new WebViewClient());

        // JS 桥：网页导出文件 + 调度续费通知
        webView.addJavascriptInterface(new NativeBridge(this), "nativeBridge");

        // 常规链接下载（备用）
        webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            try {
                DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(req);
            } catch (Exception ignored) { }
        });

        // 下拉刷新容器
        swipe = new SwipeRefreshLayout(this);
        swipe.addView(webView);
        swipe.setColorSchemeColors(Color.parseColor("#007AFF"));
        swipe.setOnRefreshListener(() -> webView.reload());

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                swipe.setRefreshing(newProgress < 100);
            }

            // 文件选择器（网页「导入」按钮）
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
                filePathCallback = callback;
                try {
                    Intent i = params.createIntent();
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(Intent.createChooser(i, "选择备份文件"), REQ_FILE);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        setContentView(swipe);

        hideSystemUi();
        webView.loadUrl(URL);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "续费提醒", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("订阅续费到期提醒");
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(ch);
        }
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE && filePathCallback != null) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    results = new Uri[data.getClipData().getItemCount()];
                    for (int i = 0; i < results.length; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUi();
    }

    /** JS 桥：网页导出 + 续费通知调度 */
    static class NativeBridge {
        private final Activity activity;

        NativeBridge(Activity a) {
            activity = a;
        }

        @JavascriptInterface
        public void saveFile(String base64, String fileName, String mime) {
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                String safeName = fileName == null || fileName.isEmpty() ? "download.bin" : fileName;
                String safeMime = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                    values.put(MediaStore.Downloads.MIME_TYPE, safeMime);
                    values.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri uri = activity.getContentResolver()
                            .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) throw new Exception("无法创建下载文件");
                    try (OutputStream os = activity.getContentResolver().openOutputStream(uri)) {
                        if (os == null) throw new Exception("无法打开输出流");
                        os.write(data);
                    }
                    values.clear();
                    values.put(MediaStore.Downloads.IS_PENDING, 0);
                    activity.getContentResolver().update(uri, values, null, null);
                } else {
                    File tmp = new File(activity.getCacheDir(), safeName);
                    try (FileOutputStream fos = new FileOutputStream(tmp)) {
                        fos.write(data);
                    }
                    DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
                    DownloadManager.Request req = new DownloadManager.Request(Uri.fromFile(tmp))
                            .setMimeType(safeMime)
                            .setTitle(safeName)
                            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    req.setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, safeName);
                    dm.enqueue(req);
                }
                activity.runOnUiThread(() -> Toast.makeText(activity,
                        "已保存：下载目录/" + safeName, Toast.LENGTH_LONG).show());
            } catch (Exception e) {
                final String msg = e.getMessage();
                activity.runOnUiThread(() -> Toast.makeText(activity,
                        "保存失败：" + msg, Toast.LENGTH_LONG).show());
            }
        }

        /** 网页把未来 30 天的扣款事件传来 → 原生调度"到期前一天 9 点"提醒 */
        @JavascriptInterface
        public void scheduleNotifications(String json) {
            try {
                JSONArray arr = new JSONArray(json);
                AlarmManager am = (AlarmManager) activity.getSystemService(Context.ALARM_SERVICE);
                // 先取消旧的调度（requestCode 0..99）
                for (int i = 0; i < 100; i++) {
                    Intent cancelIntent = new Intent(activity, NotificationReceiver.class);
                    PendingIntent pi = PendingIntent.getBroadcast(activity, i, cancelIntent,
                            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_NO_CREATE);
                    if (pi != null) {
                        am.cancel(pi);
                        pi.cancel();
                    }
                }
                int n = Math.min(arr.length(), 100);
                for (int i = 0; i < n; i++) {
                    JSONObject o = arr.getJSONObject(i);
                    String name = o.optString("name", "订阅");
                    String amount = o.optString("amount", "");
                    long dueTime = o.optLong("date", 0);
                    if (dueTime <= 0) continue;
                    // 到期前一天早上 9 点提醒
                    Calendar c = Calendar.getInstance();
                    c.setTimeInMillis(dueTime);
                    c.add(Calendar.DAY_OF_MONTH, -1);
                    c.set(Calendar.HOUR_OF_DAY, 9);
                    c.set(Calendar.MINUTE, 0);
                    c.set(Calendar.SECOND, 0);
                    long at = c.getTimeInMillis();
                    if (at <= System.currentTimeMillis()) continue; // 已过提醒时间
                    Intent intent = new Intent(activity, NotificationReceiver.class);
                    intent.putExtra("name", name);
                    intent.putExtra("amount", amount);
                    PendingIntent pi = PendingIntent.getBroadcast(activity, i, intent,
                            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                    // set()：免精确闹钟权限；对"提前一天提醒"场景足够
                    am.set(AlarmManager.RTC_WAKEUP, at, pi);
                }
            } catch (Exception ignored) { }
        }
    }

    /** 闹钟到点：发系统通知 */
    public static class NotificationReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            String name = intent.getStringExtra("name");
            String amount = intent.getStringExtra("amount");
            if (name == null) name = "订阅续费";
            android.app.Notification.Builder b = Build.VERSION.SDK_INT >= 26
                    ? new android.app.Notification.Builder(context, CHANNEL_ID)
                    : new android.app.Notification.Builder(context);
            android.app.Notification n = b
                    .setSmallIcon(R.drawable.ic_notify)
                    .setContentTitle("「" + name + "」明天续费")
                    .setContentText(amount == null || amount.isEmpty() ? "查看订阅详情" : amount + " · 到期前一天提醒")
                    .setAutoCancel(true)
                    .build();
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            nm.notify((int) (System.currentTimeMillis() % Integer.MAX_VALUE), n);
        }
    }
}
