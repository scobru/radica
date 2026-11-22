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
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Radica web, served by the Freenet node on this phone. Android has no Freenet of its own: the node comes from
 * Freenet Android Node (HostFat, unofficial). Until it answers, a page says what is missing and how to fix it, and
 * the app keeps checking, so it opens Radica by itself once the node is up.
 */
public class MainActivity extends Activity {
    private static final String NODE = "http://127.0.0.1:7509";
    private static final String RADICA_KEY = "Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw";
    private static final String VISO_KEY = "GzHy3jnEtj26EoGqMsBpoawcY378hK9kp91rTcNYiAac";
    private static final String RADICA_PREFIX_LOOPBACK = "http://127.0.0.1:7509/v1/contract/web/" + RADICA_KEY + "/";
    private static final String RADICA_PREFIX_LOCALHOST = "http://localhost:7509/v1/contract/web/" + RADICA_KEY + "/";
    private static final String VISO_PREFIX_LOOPBACK = "http://127.0.0.1:7509/v1/contract/web/" + VISO_KEY + "/";
    private static final String VISO_PREFIX_LOCALHOST = "http://localhost:7509/v1/contract/web/" + VISO_KEY + "/";
    private static final String RADICA = RADICA_PREFIX_LOOPBACK;
    private static final int MAX_STORAGE_BYTES = 8 * 1024 * 1024;
    private static final String NODE_APP = "org.freenet.androidnode";
    private static final String NODE_APP_RELEASES = "https://github.com/HostFat/freenet-android-node/releases/latest";
    private static final int PICK_FILES = 1;
    private static final int MIC = 2;

    private enum Node { CHECKING, MISSING, STOPPED }

    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView web;
    private volatile String currentTopUrl = "";
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
                        currentTopUrl = RADICA;
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
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(true);
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.addJavascriptInterface(new NativeStorage(), "__radicaNative");
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

    private boolean isMessengerApp() {
        return getPackageName().endsWith(".messenger");
    }

    private String appTitle() {
        return isMessengerApp() ? "Radica Messenger" : "Radica";
    }

    private void show(Node node) {
        if (node == shown) return;
        shown = node;
        String title = appTitle();
        String body;
        switch (node) {
            case MISSING:
                body = "<p>" + title + " needs a Freenet node on this phone, and none is running.</p>"
                        + "<ol><li>Install <b>Freenet Android Node</b> (a community app by HostFat, not official): "
                        + "download the <code>.apk</code> from its latest release and allow the install.</li>"
                        + "<li>Open it and press <b>Start network node</b>.</li>"
                        + "<li>Come back here: " + title + " opens by itself.</li></ol>"
                        + "<a class=b href=\"radica://install\">Get Freenet Android Node</a>"
                        + "<a class=l href=\"radica://retry\">Check again</a>";
                break;
            case STOPPED:
                body = "<p>Freenet Android Node is installed, but its node is not running.</p>"
                        + "<p>Open it and press <b>Start network node</b>, then come back: " + title + " opens by itself.</p>"
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
                + "<main><h1>" + title + "</h1>" + body + "</main>";
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

    private static boolean isRadicaUrl(String url) {
        if (url == null) return false;
        return url.startsWith(RADICA_PREFIX_LOOPBACK) || url.startsWith(RADICA_PREFIX_LOCALHOST);
    }

    private static boolean isVisoUrl(String url) {
        if (url == null) return false;
        return url.startsWith(VISO_PREFIX_LOOPBACK) || url.startsWith(VISO_PREFIX_LOCALHOST);
    }

    private static boolean isAllowedInAppUrl(String url) {
        return isRadicaUrl(url) || isVisoUrl(url);
    }

    private boolean isAllowedSubframeUrl(String url) {
        return (isRadicaUrl(currentTopUrl) && isRadicaUrl(url))
                || (isVisoUrl(currentTopUrl) && isVisoUrl(url));
    }

    private static boolean isSafeExternalUrl(String url) {
        if (url == null || url.isEmpty()) return false;
        for (int i = 0; i < url.length(); i++) {
            char c = url.charAt(i);
            if (c <= 0x1F || c == 0x7F) return false;
        }
        return url.startsWith("https://") || url.startsWith("http://") || url.startsWith("spore:radio:");
    }

    private static boolean isSubframeDocumentRequest(WebResourceRequest req) {
        if (req.isForMainFrame()) return false;
        Map<String, String> headers = req.getRequestHeaders();
        if (headers == null) return false;
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            String k = entry.getKey();
            String v = entry.getValue();
            if (k == null || v == null) continue;
            if (k.equalsIgnoreCase("Sec-Fetch-Dest")) {
                String lower = v.trim().toLowerCase();
                if (lower.equals("iframe") || lower.equals("frame") || lower.equals("fencedframe")) return true;
            } else if (k.equalsIgnoreCase("Accept") && v.toLowerCase().contains("text/html")) {
                return true;
            }
        }
        return false;
    }

    /** Radica runs in a sandboxed iframe the node's shell serves (no `allow-same-origin`): `window.localStorage`
     *  throws there, and storage.ts's fallback (`window.name` + URL hash) is lost whenever this app is closed and
     *  reopened (a new Activity means a new WebView, so a fresh, empty `window.name`). addJavascriptInterface
     *  objects are reachable from every frame of the WebView, sandboxed iframes included, so this gives
     *  storage.ts a real, file-backed (SharedPreferences) alternative that survives that — strictly gated to Radica. */
    private class NativeStorage {
        @JavascriptInterface
        public String getAppMode() {
            if (!isRadicaUrl(currentTopUrl)) return "full";
            return isMessengerApp() ? "messenger" : "full";
        }

        @JavascriptInterface
        public void openExternal(String url) {
            if (!isAllowedInAppUrl(currentTopUrl) || !isSafeExternalUrl(url)) return;
            main.post(() -> openOutside(Uri.parse(url)));
        }

        @JavascriptInterface
        public String getAll() {
            if (!isRadicaUrl(currentTopUrl)) return null;
            return getSharedPreferences("radica_storage", MODE_PRIVATE).getString("blob", null);
        }

        @JavascriptInterface
        public void setAll(String json) {
            if (!isRadicaUrl(currentTopUrl)) return;
            if (json == null || json.length() > MAX_STORAGE_BYTES) return;
            getSharedPreferences("radica_storage", MODE_PRIVATE).edit().putString("blob", json).apply();
        }
    }

    private class Client extends WebViewClient {
        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            if (url != null && !"radica://status".equals(url)) currentTopUrl = url;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri uri = req.getUrl();
            String url = uri != null ? uri.toString() : "";
            if (isSubframeDocumentRequest(req) && !isAllowedSubframeUrl(url)) {
                if (isAllowedInAppUrl(url)) {
                    main.post(() -> {
                        currentTopUrl = url;
                        web.loadUrl(url);
                    });
                }
                return new WebResourceResponse(
                        "text/plain",
                        "utf-8",
                        403,
                        "Forbidden",
                        java.util.Collections.emptyMap(),
                        new ByteArrayInputStream("Forbidden subframe navigation".getBytes(StandardCharsets.UTF_8))
                );
            }
            return super.shouldInterceptRequest(view, req);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri uri = req.getUrl();
            String url = uri != null ? uri.toString() : "";
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
            if (isAllowedInAppUrl(url)) {
                if (!req.isForMainFrame() && !isAllowedSubframeUrl(url)) {
                    currentTopUrl = url;
                    web.loadUrl(url);
                    return true;
                }
                if (req.isForMainFrame()) {
                    currentTopUrl = url;
                }
                return false; // Only Radica and Viso (for SSO bounce) stay in this WebView
            }
            // Other Freenet contracts and external sites open in the system browser; anything else (intent:, file:, ...) is refused
            if (isSafeExternalUrl(url)) openOutside(uri);
            return true;
        }
    }

    private class Chrome extends WebChromeClient {
        /** `window.open`: a throwaway view catches where it goes and hands it to the browser, so the page stays. */
        @Override
        public boolean onCreateWindow(WebView view, boolean dialog, boolean userGesture, Message result) {
            WebView popup = new WebView(MainActivity.this);
            popup.setWebViewClient(new WebViewClient() {
                private boolean handled = false;

                private void handlePopupUrl(WebView v, String url) {
                    if (handled) return;
                    handled = true;
                    if (isAllowedInAppUrl(url)) {
                        currentTopUrl = url;
                        web.loadUrl(url);
                    } else if (isSafeExternalUrl(url)) {
                        openOutside(Uri.parse(url));
                    }
                    v.stopLoading();
                    v.destroy();
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                    Uri uri = req.getUrl();
                    handlePopupUrl(v, uri != null ? uri.toString() : "");
                    return true;
                }

                @Override
                public void onPageStarted(WebView v, String url, android.graphics.Bitmap favicon) {
                    handlePopupUrl(v, url != null ? url : "");
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

        /** Voice notes: the microphone, for Radica only. */
        @Override
        public void onPermissionRequest(PermissionRequest req) {
            boolean mic = java.util.Arrays.asList(req.getResources()).contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE);
            if (!mic || !isRadicaUrl(currentTopUrl)) {
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
