package com.zhaxi.webview;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
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

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {

    private WebView webView;
    private SwipeRefreshLayout swipe;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int REQ_FILE = 9001;
    private static final String URL = "https://batianxieshen1.github.io/zhaxi-sub/";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

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

        // JS 桥：网页导出文件（Blob 下载在 WebView 中不生效）→ 原生保存到下载目录
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

            // 文件选择器（网页「导入」按钮）：WebView 默认不响应 input[type=file]
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

    /** JS 桥：网页导出 → 保存到手机下载目录 */
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
                    // Android 10+：直接写 MediaStore.Downloads，无需任何权限，MIUI 兼容性最好
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
                    // 旧安卓：DownloadManager 复制到公共下载目录
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
    }
}
