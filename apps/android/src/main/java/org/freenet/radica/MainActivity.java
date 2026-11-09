package org.freenet.radica;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.FrameLayout;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Radica web, served by the Freenet node on this phone. Android has no Freenet of its own: the node comes from
 * Freenet Android Node (HostFat, unofficial). Until it answers, a page says what is missing and how to fix it, and
 * the app keeps checking, so it opens Radica by itself once the node is up.
 */
public class MainActivity extends Activity {
    private static final String NODE = "http://127.0.0.1:7509";
    private static final String RADICA = NODE + "/v1/contract/web/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/";
    private static final String NODE_APP = "org.freenet.androidnode";
    private static final String NODE_APP_RELEASES = "https://github.com/HostFat/freenet-android-node/releases/latest";
    private static final int PICK_FILES = 1;
    private static final int MIC = 2;

    private enum Node { CHECKING, MISSING, STOPPED }

    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView web;
    private boolean opened;
    private Node shown;
    private ValueCallback<Uri[]> pendingFiles;
    private PermissionRequest pendingMic;

    private final Runnable check = new Runnable() {
        @Override
        public void run() {
            if (opened) return;
            new Thread(() -> {
                boolean up = nodeAnswers();
                main.post(() -> {
                    if (opened) return;
                    if (up) {
                        opened = true;
                        web.loadUrl(RADICA);
                    } else {
                        show(nodeAppInstalled() ? Node.STOPPED : Node.MISSING);
                        main.postDelayed(check, 3000);
                    }
                });
            }).start();
        }
    };

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(true);
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        setContentView(fitted(web));
        if (saved != null && web.restoreState(saved) != null) {
            opened = true;
        } else {
            show(Node.CHECKING);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        // back from Freenet Android Node: look again at once
        main.removeCallbacks(check);
        main.post(check);
    }

    @Override
    protected void onPause() {
        super.onPause();
        main.removeCallbacks(check);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (opened) web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (opened && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    /**
     * Android 15 draws apps under the status bar, the navigation bar and the keyboard: keep Radica clear of them, on
     * the page's own background, with the bars' icons readable on it.
     */
    private FrameLayout fitted(WebView view) {
        FrameLayout root = new FrameLayout(this);
        root.addView(view);
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        root.setBackgroundColor(night ? 0xFF141310 : 0xFFF6F3EA);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            // before Android 15 the bars keep the theme's colour unless cleared; the background shows through
            getWindow().setStatusBarColor(0);
            getWindow().setNavigationBarColor(0);
            int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                    | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            WindowInsetsController bars = getWindow().getInsetsController();
            if (bars != null) bars.setSystemBarsAppearance(night ? 0 : light, light);
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime()
                        | WindowInsets.Type.displayCutout());
                v.setPadding(i.left, i.top, i.right, i.bottom);
                return WindowInsets.CONSUMED;
            });
        }
        return root;
    }

    /** The node's client API answers with its version once its HTTP server is up. */
    private static boolean nodeAnswers() {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(NODE + "/v1/version").openConnection();
            c.setConnectTimeout(1500);
            c.setReadTimeout(1500);
            try (InputStream in = c.getInputStream()) {
                byte[] buf = new byte[4096];
                int n = in.read(buf); // the answer is a short JSON object
                return c.getResponseCode() == 200 && n > 0 && new String(buf, 0, n).contains("\"version\"");
            } finally {
                c.disconnect();
            }
        } catch (Exception e) {
            return false;
        }
    }

    private boolean nodeAppInstalled() {
        return getPackageManager().getLaunchIntentForPackage(NODE_APP) != null;
    }

    private void show(Node node) {
        if (node == shown) return;
        shown = node;
        String body;
        switch (node) {
            case MISSING:
                body = "<p>Radica needs a Freenet node on this phone, and none is running.</p>"
                        + "<ol><li>Install <b>Freenet Android Node</b> (a community app by HostFat, not official): "
                        + "download the <code>.apk</code> from its latest release and allow the install.</li>"
                        + "<li>Open it and press <b>Start network node</b>.</li>"
                        + "<li>Come back here: Radica opens by itself.</li></ol>"
                        + "<a class=b href=\"radica://install\">Get Freenet Android Node</a>"
                        + "<a class=l href=\"radica://retry\">Check again</a>";
                break;
            case STOPPED:
                body = "<p>Freenet Android Node is installed, but its node is not running.</p>"
                        + "<p>Open it and press <b>Start network node</b>, then come back: Radica opens by itself.</p>"
                        + "<a class=b href=\"radica://node\">Open Freenet Android Node</a>"
                        + "<a class=l href=\"radica://retry\">Check again</a>";
                break;
            default:
                body = "<p>Looking for your Freenet node…</p>";
        }
        String html = "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
                + "<style>:root{color-scheme:light dark;--bg:#f6f3ea;--fg:#2b2a26;--muted:#77736a;--accent:#3d6b2a}"
                + "@media (prefers-color-scheme:dark){:root{--bg:#141310;--fg:#ecead8;--muted:#9a978a;--accent:#7fae5c}}"
                + "body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);"
                + "font:16px system-ui,sans-serif}main{max-width:28rem;padding:24px 16px}"
                + "h1{font:600 30px Georgia,serif;margin:0 0 16px;text-align:center}p,li{line-height:1.5}ol{padding-left:20px}"
                + "code{font-size:14px}a{display:block;text-align:center;margin-top:16px;text-decoration:none}"
                + "a.b{border-radius:999px;padding:12px 20px;background:var(--accent);color:#fff}a.l{color:var(--muted)}</style>"
                + "<main><h1>Radica</h1>" + body + "</main>";
        web.loadDataWithBaseURL("radica://status", html, "text/html", "utf-8", null);
    }

    private void openOutside(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            // no browser: nothing to do
        }
    }

    private static boolean isNodePage(Uri uri) {
        return "http".equals(uri.getScheme()) && ("127.0.0.1".equals(uri.getHost()) || "localhost".equals(uri.getHost()))
                && uri.getPort() == 7509;
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri uri = req.getUrl();
            if ("radica".equals(uri.getScheme())) {
                switch (String.valueOf(uri.getHost())) {
                    case "install":
                        openOutside(Uri.parse(NODE_APP_RELEASES));
                        break;
                    case "node":
                        Intent launch = getPackageManager().getLaunchIntentForPackage(NODE_APP);
                        if (launch != null) startActivity(launch);
                        break;
                    default:
                        shown = null;
                        main.removeCallbacks(check);
                        main.post(check);
                }
                return true;
            }
            if (isNodePage(uri)) return false; // Radica and other apps on this node stay here
            // other sites go to the browser; anything else (intent:, file:, …) is refused
            if ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) openOutside(uri);
            return true;
        }
    }

    private class Chrome extends WebChromeClient {
        /** `window.open`: a throwaway view catches where it goes and hands it to the browser, so the page stays. */
        @Override
        public boolean onCreateWindow(WebView view, boolean dialog, boolean userGesture, Message result) {
            WebView popup = new WebView(MainActivity.this);
            popup.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                    Uri uri = req.getUrl();
                    if (isNodePage(uri)) web.loadUrl(uri.toString());
                    else if ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) openOutside(uri);
                    v.destroy();
                    return true;
                }
            });
            ((WebView.WebViewTransport) result.obj).setWebView(popup);
            result.sendToTarget();
            return true;
        }

        /** Attachments: the system picker. */
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (pendingFiles != null) pendingFiles.onReceiveValue(null);
            pendingFiles = callback;
            try {
                startActivityForResult(params.createIntent(), PICK_FILES);
            } catch (ActivityNotFoundException e) {
                pendingFiles = null;
                return false;
            }
            return true;
        }

        /** Voice notes: the microphone, for pages on the node only. */
        @Override
        public void onPermissionRequest(PermissionRequest req) {
            boolean mic = java.util.Arrays.asList(req.getResources()).contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE);
            if (!mic || !isNodePage(req.getOrigin())) {
                req.deny();
            } else if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                req.grant(new String[] {PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            } else {
                pendingMic = req;
                requestPermissions(new String[] {Manifest.permission.RECORD_AUDIO}, MIC);
            }
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILES && pendingFiles != null) {
            pendingFiles.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            pendingFiles = null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        if (request == MIC && pendingMic != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
                pendingMic.grant(new String[] {PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            } else {
                pendingMic.deny();
            }
            pendingMic = null;
        }
    }
}
