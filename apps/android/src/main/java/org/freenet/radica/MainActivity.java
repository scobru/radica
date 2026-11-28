package org.freenet.radica;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Insets;
import android.media.MediaRecorder;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.provider.MediaStore;
import android.util.Base64;
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
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.GZIPInputStream;
import org.json.JSONObject;

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
    private static final String STORAGE_FILE = "radica_storage.json";
    private final Object storageLock = new Object();
    private final java.util.concurrent.ExecutorService storageExecutor =
            java.util.concurrent.Executors.newSingleThreadExecutor();
    private final java.util.concurrent.atomic.AtomicLong storageWriteSeq =
            new java.util.concurrent.atomic.AtomicLong(0L);
    private volatile String cachedStorageBlob;
    /** Radica web shipped in the APK (build.gradle.kts copies ui/dist into assets/radica-ui), opened when no node
     *  answers so the chat still works over the local network. https: WebCrypto needs a secure context. */
    private static final String BUNDLED = "https://radica.local/";
    private static final String NODE_APP = "org.freenet.androidnode";
    private static final String NODE_APP_RELEASES = "https://github.com/HostFat/freenet-android-node/releases/latest";
    private static final int PICK_FILES = 1;
    private static final int MIC = 2;
    private static final int MIC_NATIVE = 4;
    private static final int CAMERA_CHOOSER = 5;
    private static final int MAX_NATIVE_AUDIO_BYTES = 4 * 1024 * 1024;

    private enum Node { CHECKING, MISSING, STOPPED }

    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView web;
    private volatile String currentTopUrl = "";
    private boolean opened;
    private Node shown;
    private ValueCallback<Uri[]> pendingFiles;
    private Intent pendingCameraChooserIntent;
    private Intent pendingFallbackFileIntent;
    private PermissionRequest pendingMic;
    private String[] pendingMediaResources;
    private MediaRecorder nativeRecorder;
    /** LAN mesh (CONTEXT.md, ui/src/lanMesh.ts): UDP broadcasts of the page's signed chat packets. */
    private static final int MESH_PORT = 47509;
    private static final int MESH_MAX_BYTES = 60000;
    private volatile DatagramSocket mesh;
    private WifiManager.MulticastLock meshLock;
    private File nativeVoiceFile;
    private long nativeVoiceStartedAt = 0L;
    private int nativeVoiceMaxSec = 10;
    private int pendingNativeVoiceMaxSec = 0;

    private final Runnable nativeVoiceTick = new Runnable() {
        @Override
        public void run() {
            if (nativeRecorder == null) return;
            double elapsedSec = Math.max(0.0, (System.currentTimeMillis() - nativeVoiceStartedAt) / 1000.0);
            int amp = 0;
            try {
                amp = nativeRecorder.getMaxAmplitude();
            } catch (Exception ignored) {}
            double scaled = Math.min(1.0, (amp / 18000.0) * 1.4);
            int level = Math.max(2, Math.min(15, (int) Math.round(scaled * 13.0) + 2));
            long approxBytes = Math.round(elapsedSec * 3000.0);
            dispatchNativeVoiceEvent(String.format(
                    java.util.Locale.US,
                    "{\"type\":\"radica_native_voice\",\"event\":\"tick\",\"elapsedSec\":%.2f,\"level\":%d,\"approxBytes\":%d,\"maxSec\":%d}",
                    elapsedSec, level, approxBytes, nativeVoiceMaxSec
            ));
            if (elapsedSec >= nativeVoiceMaxSec) {
                finishNativeVoiceRecording(false);
            } else {
                main.postDelayed(this, 120);
            }
        }
    };

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
                        String startUrl = radicaWebUrl();
                        currentTopUrl = startUrl;
                        web.loadUrl(startUrl);
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
        web.addJavascriptInterface(new NativeStorage(isMessengerApp()), "__radicaNative");
        setContentView(fitted(web));
        startMesh();
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
        if (nativeRecorder != null) finishNativeVoiceRecording(true);
    }

    @Override
    protected void onDestroy() {
        if (nativeRecorder != null) finishNativeVoiceRecording(true);
        stopMesh();
        storageExecutor.shutdown();
        super.onDestroy();
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
        if (BuildConfig.IS_MESSENGER) return true;
        try {
            int resId = getResources().getIdentifier("app_mode", "string", "org.freenet.radica");
            if (resId != 0 && "messenger".equalsIgnoreCase(getString(resId))) return true;
        } catch (Exception ignored) {}
        try {
            int resId2 = getResources().getIdentifier("app_mode", "string", getPackageName());
            if (resId2 != 0 && "messenger".equalsIgnoreCase(getString(resId2))) return true;
        } catch (Exception ignored) {}
        String pkg = getPackageName();
        return pkg != null && (pkg.endsWith(".messenger") || pkg.contains("messenger"));
    }

    private String radicaWebUrl() {
        return isMessengerApp() ? (RADICA + "?app=messenger#mode=messenger") : RADICA;
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
                        + "<a class=l href=\"radica://retry\">Check again</a>"
                        + offlineLink();
                break;
            case STOPPED:
                body = "<p>Freenet Android Node is installed, but its node is not running.</p>"
                        + "<p>Open it and press <b>Start network node</b>, then come back: " + title + " opens by itself.</p>"
                        + "<a class=b href=\"radica://node\">Open Freenet Android Node</a>"
                        + "<a class=l href=\"radica://retry\">Check again</a>"
                        + offlineLink();
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

    private boolean hasBundledUi() {
        try (InputStream in = getAssets().open("radica-ui/index.html")) {
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private String offlineLink() {
        return hasBundledUi()
                ? "<a class=l href=\"radica://offline\">Open without Freenet (chat with people on this Wi-Fi only)</a>"
                : "";
    }

    /** A file of the Radica web in the APK, for a request under BUNDLED. */
    private WebResourceResponse bundledAsset(Uri uri) {
        String path = uri.getPath() == null || uri.getPath().equals("/") ? "index.html" : uri.getPath().substring(1);
        if (path.contains("..")) return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
        try {
            return new WebResourceResponse(mimeOf(path), null, getAssets().open("radica-ui/" + path));
        } catch (Exception e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
        }
    }

    private static String mimeOf(String path) {
        String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase(java.util.Locale.ROOT);
        switch (ext) {
            case "html": return "text/html";
            case "js": case "mjs": return "text/javascript";
            case "css": return "text/css";
            case "json": case "webmanifest": return "application/json";
            case "wasm": return "application/wasm";
            case "svg": return "image/svg+xml";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "gif": return "image/gif";
            case "webp": return "image/webp";
            case "mp3": return "audio/mpeg";
            case "ogg": return "audio/ogg";
            case "wav": return "audio/wav";
            case "woff2": return "font/woff2";
            default: return "application/octet-stream";
        }
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
        if (url.startsWith(BUNDLED)) return true;
        String base1 = "http://127.0.0.1:7509/v1/contract/web/" + RADICA_KEY;
        String base2 = "http://localhost:7509/v1/contract/web/" + RADICA_KEY;
        return url.startsWith(base1 + "/") || url.equals(base1) || url.startsWith(base1 + "?") || url.startsWith(base1 + "#")
                || url.startsWith(base2 + "/") || url.equals(base2) || url.startsWith(base2 + "?") || url.startsWith(base2 + "#");
    }

    private static boolean isVisoUrl(String url) {
        if (url == null) return false;
        String base1 = "http://127.0.0.1:7509/v1/contract/web/" + VISO_KEY;
        String base2 = "http://localhost:7509/v1/contract/web/" + VISO_KEY;
        return url.startsWith(base1 + "/") || url.equals(base1) || url.startsWith(base1 + "?") || url.startsWith(base1 + "#")
                || url.startsWith(base2 + "/") || url.equals(base2) || url.startsWith(base2 + "?") || url.startsWith(base2 + "#");
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

    private static boolean isLikelyHtmlUrl(String url) {
        if (url == null || url.isEmpty()) return false;
        String path = url.split("\\?")[0].split("#")[0].toLowerCase();
        if (path.endsWith(".js") || path.endsWith(".css") || path.endsWith(".png")
                || path.endsWith(".jpg") || path.endsWith(".jpeg") || path.endsWith(".gif")
                || path.endsWith(".svg") || path.endsWith(".webp") || path.endsWith(".ico")
                || path.endsWith(".wasm") || path.endsWith(".woff") || path.endsWith(".woff2")
                || path.endsWith(".ttf") || path.endsWith(".eot") || path.endsWith(".json")
                || path.endsWith(".map") || path.endsWith(".mp3") || path.endsWith(".mp4")
                || path.endsWith(".webm") || path.endsWith(".wav") || path.endsWith(".ogg")) {
            return false;
        }
        return true;
    }

    private static boolean isLikelyHtmlRequest(WebResourceRequest req, String url) {
        if (req.isForMainFrame()) return true;
        if (isSubframeDocumentRequest(req)) return true;
        String clean = url.split("\\?")[0].split("#")[0];
        if (clean.endsWith("/") || clean.endsWith(".html") || url.contains("__sandbox=1")) return true;
        Map<String, String> headers = req.getRequestHeaders();
        if (headers != null) {
            for (Map.Entry<String, String> e : headers.entrySet()) {
                if ("Accept".equalsIgnoreCase(e.getKey()) && e.getValue() != null && e.getValue().toLowerCase().contains("text/html")) {
                    return true;
                }
            }
        }
        return false;
    }

    private static byte[] readFully(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) != -1) {
            out.write(buf, 0, n);
        }
        return out.toByteArray();
    }

    private void dispatchNativeVoiceEvent(String jsonLiteral) {
        main.post(() -> {
            if (web == null) return;
            String js = "(function(d){try{window.postMessage(d,'*');var fs=document.getElementsByTagName('iframe');for(var i=0;i<fs.length;i++){try{fs[i].contentWindow.postMessage(d,'*');}catch(e){}}}catch(e){}})(" + jsonLiteral + ");";
            try {
                web.evaluateJavascript(js, null);
            } catch (Exception ignored) {}
        });
    }

    /** Listen for other Radica devices on the LAN; the page checks each packet, this only carries bytes. */
    private void startMesh() {
        try {
            WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
            if (wifi != null) {
                meshLock = wifi.createMulticastLock("radica-mesh");
                meshLock.setReferenceCounted(false);
                meshLock.acquire();
            }
        } catch (Exception ignored) {}
        new Thread(() -> {
            try {
                DatagramSocket s = new DatagramSocket(null);
                s.setReuseAddress(true);
                s.setBroadcast(true);
                s.bind(new InetSocketAddress(MESH_PORT));
                mesh = s;
                byte[] buf = new byte[65535];
                while (!s.isClosed()) {
                    DatagramPacket p = new DatagramPacket(buf, buf.length);
                    s.receive(p);
                    if (p.getLength() > MESH_MAX_BYTES || !isRadicaUrl(currentTopUrl)) continue;
                    String text = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8);
                    dispatchNativeVoiceEvent(new JSONObject().put("type", "radica_mesh").put("data", text).toString());
                }
            } catch (Exception ignored) {
                // port taken or socket closed: the app works on without the mesh
            }
        }, "radica-mesh").start();
    }

    private void stopMesh() {
        DatagramSocket s = mesh;
        mesh = null;
        if (s != null) s.close();
        if (meshLock != null && meshLock.isHeld()) meshLock.release();
    }

    private void beginNativeVoiceRecording(int maxSec) {
        if (nativeRecorder != null) finishNativeVoiceRecording(true);
        int clamped = Math.max(1, Math.min(60, maxSec));
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingNativeVoiceMaxSec = clamped;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MIC_NATIVE);
            return;
        }
        File outFile = new File(getCacheDir(), "radica_ptt.m4a");
        if (outFile.exists()) {
            outFile.delete();
        }
        MediaRecorder rec = new MediaRecorder();
        try {
            rec.setAudioSource(MediaRecorder.AudioSource.MIC);
            rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            rec.setAudioSamplingRate(24000);
            rec.setAudioEncodingBitRate(24000);
            rec.setAudioChannels(1);
            rec.setMaxDuration(clamped * 1000);
            rec.setOutputFile(outFile.getAbsolutePath());
            rec.prepare();
            rec.start();
            nativeRecorder = rec;
            nativeVoiceFile = outFile;
            nativeVoiceMaxSec = clamped;
            nativeVoiceStartedAt = System.currentTimeMillis();
            main.removeCallbacks(nativeVoiceTick);
            main.postDelayed(nativeVoiceTick, 120);
            dispatchNativeVoiceEvent("{\"type\":\"radica_native_voice\",\"event\":\"started\"}");
        } catch (Exception e) {
            try { rec.release(); } catch (Exception ignored) {}
            if (outFile.exists()) outFile.delete();
            String msg = String.valueOf(e.getMessage() != null ? e.getMessage() : e).replace("\\", "\\\\").replace("\"", "\\\"");
            dispatchNativeVoiceEvent("{\"type\":\"radica_native_voice\",\"event\":\"error\",\"message\":\"" + msg + "\"}");
        }
    }

    private void finishNativeVoiceRecording(boolean cancel) {
        main.removeCallbacks(nativeVoiceTick);
        MediaRecorder rec = nativeRecorder;
        File file = nativeVoiceFile;
        long started = nativeVoiceStartedAt;
        nativeRecorder = null;
        nativeVoiceFile = null;
        nativeVoiceStartedAt = 0L;
        if (rec == null) {
            if (cancel) dispatchNativeVoiceEvent("{\"type\":\"radica_native_voice\",\"event\":\"cancelled\"}");
            return;
        }
        try {
            rec.stop();
        } catch (Exception ignored) {}
        try {
            rec.release();
        } catch (Exception ignored) {}

        if (cancel || file == null || !file.exists()) {
            if (file != null && file.exists()) file.delete();
            dispatchNativeVoiceEvent("{\"type\":\"radica_native_voice\",\"event\":\"cancelled\"}");
            return;
        }

        double durationSec = Math.max(0.5, Math.round(((System.currentTimeMillis() - started) / 1000.0) * 10.0) / 10.0);
        try (FileInputStream fis = new FileInputStream(file);
             ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            int total = 0;
            while ((n = fis.read(buf)) != -1) {
                total += n;
                if (total > MAX_NATIVE_AUDIO_BYTES) {
                    throw new java.io.IOException("Voice recording exceeded size limit");
                }
                bos.write(buf, 0, n);
            }
            String b64 = Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
            dispatchNativeVoiceEvent(String.format(
                    java.util.Locale.US,
                    "{\"type\":\"radica_native_voice\",\"event\":\"done\",\"mime\":\"audio/mp4\",\"base64\":\"%s\",\"durationSec\":%.1f}",
                    b64, durationSec
            ));
        } catch (Exception e) {
            String msg = String.valueOf(e.getMessage() != null ? e.getMessage() : e).replace("\\", "\\\\").replace("\"", "\\\"");
            dispatchNativeVoiceEvent("{\"type\":\"radica_native_voice\",\"event\":\"error\",\"message\":\"" + msg + "\"}");
        } finally {
            file.delete();
        }
    }

    private WebResourceResponse tryInjectRadicaBridgeDocument(WebResourceRequest req, String urlStr) {
        if (req.getMethod() != null && !"GET".equalsIgnoreCase(req.getMethod())) return null;
        if (!isLikelyHtmlUrl(urlStr) || !isLikelyHtmlRequest(req, urlStr)) return null;
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(2500);
            conn.setReadTimeout(4000);
            conn.setInstanceFollowRedirects(true);
            Map<String, String> reqHeaders = req.getRequestHeaders();
            if (reqHeaders != null) {
                for (Map.Entry<String, String> entry : reqHeaders.entrySet()) {
                    String k = entry.getKey();
                    if (k != null && !"Accept-Encoding".equalsIgnoreCase(k)) {
                        conn.setRequestProperty(k, entry.getValue());
                    }
                }
            }
            conn.setRequestProperty("Accept-Encoding", "identity");
            conn.connect();
            int code = conn.getResponseCode();
            if (code != 200) return null;
            InputStream in = conn.getInputStream();
            String encoding = conn.getContentEncoding();
            if ("gzip".equalsIgnoreCase(encoding)) {
                in = new GZIPInputStream(in);
            }
            byte[] raw = readFully(in);
            String html = new String(raw, StandardCharsets.UTF_8);
            String lower = html.toLowerCase();
            if (!lower.contains("<html") && !lower.contains("<!doctype")) {
                return null;
            }
            String messengerPart = isMessengerApp()
                    ? "document.documentElement.setAttribute('data-app-mode','messenger');"
                    + "window.__radica_app_mode='messenger';"
                    + "window.__radicaNative.getAppMode=function(){return'messenger';};"
                    + "window.__radicaNative.isMessenger=function(){return true;};"
                    : "";
            String voicePart =
                    "if(typeof window.__radicaNative.canRecordVoice!=='function'){"
                    + "window.__radicaNative.canRecordVoice=function(){return true;};"
                    + "window.__radicaNative.startVoiceRec=function(m){try{window.parent.postMessage({type:'radica_native_voice_cmd',cmd:'start',maxSec:m},'*');}catch(e){}};"
                    + "window.__radicaNative.stopVoiceRec=function(){try{window.parent.postMessage({type:'radica_native_voice_cmd',cmd:'stop'},'*');}catch(e){}};"
                    + "window.__radicaNative.cancelVoiceRec=function(){try{window.parent.postMessage({type:'radica_native_voice_cmd',cmd:'cancel'},'*');}catch(e){}};"
                    + "}"
                    + "if(typeof window.__radicaNative.meshSend!=='function'){"
                    + "window.__radicaNative.meshSend=function(j){try{window.parent.postMessage({type:'radica_native_voice_cmd',cmd:'mesh',data:String(j)},'*');}catch(e){}};"
                    + "}";
            String script = "<script>" +
                    "try{" +
                    "window.__radicaNative=window.__radicaNative||{};" +
                    messengerPart +
                    voicePart +
                    "}catch(e){}" +
                    "</script>";
            String modified;
            if (html.contains("<head>")) {
                modified = html.replaceFirst("<head>", "<head>" + script);
            } else if (html.contains("<html")) {
                modified = html.replaceFirst("(<html[^>]*>)", "$1" + script);
            } else {
                modified = script + html;
            }
            if (isMessengerApp() && modified.contains("<html") && !modified.contains("data-app-mode=")) {
                modified = modified.replaceFirst("(<html[^>]*)(>)", "$1 data-app-mode=\"messenger\"$2");
            }
            byte[] outBytes = modified.getBytes(StandardCharsets.UTF_8);
            Map<String, String> responseHeaders = new HashMap<>();
            Map<String, List<String>> fields = conn.getHeaderFields();
            if (fields != null) {
                for (Map.Entry<String, List<String>> e : fields.entrySet()) {
                    String k = e.getKey();
                    if (k != null && e.getValue() != null && !e.getValue().isEmpty()) {
                        if (!"content-length".equalsIgnoreCase(k) && !"content-encoding".equalsIgnoreCase(k)) {
                            responseHeaders.put(k, e.getValue().get(0));
                        }
                    }
                }
            }
            responseHeaders.put("content-type", "text/html; charset=utf-8");
            return new WebResourceResponse(
                    "text/html",
                    "utf-8",
                    200,
                    "OK",
                    responseHeaders,
                    new ByteArrayInputStream(outBytes)
            );
        } catch (Exception ignored) {
            return null;
        } finally {
            if (conn != null) {
                try { conn.disconnect(); } catch (Exception ignored) {}
            }
        }
    }

    private String readUtf8StorageFile(File file) {
        if (!file.isFile() || file.length() > MAX_STORAGE_BYTES) return null;
        try (FileInputStream in = new FileInputStream(file);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[16384];
            int total = 0;
            int n;
            while ((n = in.read(buf)) != -1) {
                total += n;
                if (total > MAX_STORAGE_BYTES) return null;
                out.write(buf, 0, n);
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            return null;
        }
    }

    private boolean writeStorageFileAtomic(String json) {
        File dir = getFilesDir();
        if (dir == null) return false;
        File target = new File(dir, STORAGE_FILE);
        File tmp = new File(dir, STORAGE_FILE + ".tmp");
        try {
            byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > MAX_STORAGE_BYTES) return false;
            try (java.io.FileOutputStream out = new java.io.FileOutputStream(tmp)) {
                out.write(bytes);
                out.getFD().sync();
            }
            if (!tmp.renameTo(target)) {
                if (target.exists() && target.delete() && tmp.renameTo(target)) {
                    return true;
                }
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
                return false;
            }
            return true;
        } catch (Exception ignored) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            return false;
        }
    }

    /** Radica runs in a sandboxed iframe the node's shell serves (no `allow-same-origin`): `window.localStorage`
     *  throws there, and storage.ts's fallback (`window.name` + URL hash) is lost whenever this app is closed and
     *  reopened (a new Activity means a new WebView, so a fresh, empty `window.name`). addJavascriptInterface
     *  objects are reachable from every frame of the WebView, sandboxed iframes included, so this gives
     *  storage.ts a real, file-backed (`radica_storage.json`) alternative that survives that — strictly gated to Radica. */
    public class NativeStorage {
        private final boolean isMessenger;

        public NativeStorage(boolean isMessenger) {
            this.isMessenger = isMessenger;
        }

        @JavascriptInterface
        public String getAppMode() {
            return isMessenger ? "messenger" : "full";
        }

        /** The installed app's version (not the web page's): what the update check compares with GitHub's latest. */
        @JavascriptInterface
        public String getAppVersion() {
            return BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public boolean isMessenger() {
            return isMessenger;
        }

        @JavascriptInterface
        public void openExternal(String url) {
            if (!isAllowedInAppUrl(currentTopUrl) || !isSafeExternalUrl(url)) return;
            main.post(() -> openOutside(Uri.parse(url)));
        }

        @JavascriptInterface
        public String getAll() {
            if (!isRadicaUrl(currentTopUrl)) return null;
            String cached = cachedStorageBlob;
            if (cached != null) return cached;
            synchronized (storageLock) {
                if (cachedStorageBlob != null) return cachedStorageBlob;
                File file = new File(getFilesDir(), STORAGE_FILE);
                if (file.exists()) {
                    String fromFile = readUtf8StorageFile(file);
                    if (fromFile != null) {
                        cachedStorageBlob = fromFile;
                        return fromFile;
                    }
                }
                String legacy = getSharedPreferences("radica_storage", MODE_PRIVATE).getString("blob", null);
                if (legacy != null) {
                    cachedStorageBlob = legacy;
                    final long seq = storageWriteSeq.incrementAndGet();
                    try {
                        storageExecutor.execute(() -> {
                            if (seq == storageWriteSeq.get()) {
                                String latest = cachedStorageBlob;
                                if (latest != null && writeStorageFileAtomic(latest)) {
                                    getSharedPreferences("radica_storage", MODE_PRIVATE).edit().remove("blob").apply();
                                }
                            } else {
                                getSharedPreferences("radica_storage", MODE_PRIVATE).edit().remove("blob").apply();
                            }
                        });
                    } catch (java.util.concurrent.RejectedExecutionException ignored) {}
                }
                return legacy;
            }
        }

        @JavascriptInterface
        public void setAll(String json) {
            if (!isRadicaUrl(currentTopUrl)) return;
            if (json == null || json.length() > MAX_STORAGE_BYTES) return;
            final long seq;
            synchronized (storageLock) {
                cachedStorageBlob = json;
                seq = storageWriteSeq.incrementAndGet();
            }
            try {
                storageExecutor.execute(() -> {
                    if (seq != storageWriteSeq.get()) return;
                    String latest = cachedStorageBlob;
                    if (latest == null) return;
                    writeStorageFileAtomic(latest);
                });
            } catch (java.util.concurrent.RejectedExecutionException ignored) {}
        }

        @JavascriptInterface
        public void meshSend(String json) {
            DatagramSocket s = mesh;
            if (s == null || json == null || !isRadicaUrl(currentTopUrl)) return;
            byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > MESH_MAX_BYTES) return;
            new Thread(() -> {
                try {
                    s.send(new DatagramPacket(bytes, bytes.length, InetAddress.getByName("255.255.255.255"), MESH_PORT));
                } catch (Exception ignored) {}
            }).start();
        }

        @JavascriptInterface
        public boolean canRecordVoice() {
            return isRadicaUrl(currentTopUrl);
        }

        @JavascriptInterface
        public void startVoiceRec(int maxSec) {
            if (!isRadicaUrl(currentTopUrl)) return;
            int clamped = Math.max(1, Math.min(60, maxSec));
            main.post(() -> beginNativeVoiceRecording(clamped));
        }

        @JavascriptInterface
        public void stopVoiceRec() {
            if (!isRadicaUrl(currentTopUrl)) return;
            main.post(() -> finishNativeVoiceRecording(false));
        }

        @JavascriptInterface
        public void cancelVoiceRec() {
            if (!isRadicaUrl(currentTopUrl)) return;
            main.post(() -> finishNativeVoiceRecording(true));
        }
    }

    private class Client extends WebViewClient {
        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            if (url != null && !"radica://status".equals(url) && !"about:blank".equals(url)) currentTopUrl = url;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (isRadicaUrl(url)) {
                try {
                    view.evaluateJavascript(
                        "(function(){" +
                        "if(window.__radicaVoiceRelay)return;" +
                        "window.__radicaVoiceRelay=true;" +
                        "window.addEventListener('message',function(ev){" +
                        "  var d=ev&&ev.data;" +
                        "  if(!d||d.type!=='radica_native_voice_cmd'||!window.__radicaNative)return;" +
                        "  if(d.cmd==='start'&&window.__radicaNative.startVoiceRec)window.__radicaNative.startVoiceRec(d.maxSec||10);" +
                        "  else if(d.cmd==='stop'&&window.__radicaNative.stopVoiceRec)window.__radicaNative.stopVoiceRec();" +
                        "  else if(d.cmd==='cancel'&&window.__radicaNative.cancelVoiceRec)window.__radicaNative.cancelVoiceRec();" +
                        "  else if(d.cmd==='mesh'&&typeof d.data==='string'&&window.__radicaNative.meshSend)window.__radicaNative.meshSend(d.data);" +
                        "});" +
                        "})();",
                        null
                    );
                } catch (Exception ignored) {}
            }
            if (isMessengerApp()) {
                Runnable postMode = () -> {
                    try {
                        view.evaluateJavascript(
                            "(function() {" +
                            "  try {" +
                            "    document.documentElement.setAttribute('data-app-mode', 'messenger');" +
                            "    var frames = document.getElementsByTagName('iframe');" +
                            "    for (var i = 0; i < frames.length; i++) {" +
                            "      try { frames[i].contentWindow.postMessage({ type: 'radica_set_app_mode', mode: 'messenger' }, '*'); } catch(e){}" +
                            "    }" +
                            "  } catch(e){}" +
                            "})()",
                            null
                        );
                    } catch (Exception ignored) {}
                };
                postMode.run();
                main.postDelayed(postMode, 600);
                main.postDelayed(postMode, 1500);
            }
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri uri = req.getUrl();
            String url = uri != null ? uri.toString() : "";
            if (url.startsWith(BUNDLED)) return bundledAsset(uri);
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
            if (isRadicaUrl(url)) {
                WebResourceResponse injected = tryInjectRadicaBridgeDocument(req, url);
                if (injected != null) return injected;
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
                    case "offline":
                        // stays offline until the app is reopened: the node turning up must not reload the chat
                        opened = true;
                        main.removeCallbacks(check);
                        currentTopUrl = BUNDLED + "index.html";
                        web.loadUrl(currentTopUrl);
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
                Intent base = params.createIntent();
                boolean wantsVideo = false;
                String[] accepts = params.getAcceptTypes();
                if (accepts != null) {
                    for (String t : accepts) {
                        if (t != null && t.toLowerCase().contains("video")) {
                            wantsVideo = true;
                            break;
                        }
                    }
                }
                if (wantsVideo && params.isCaptureEnabled()) {
                    Intent cam = new Intent(MediaStore.ACTION_VIDEO_CAPTURE);
                    cam.putExtra(MediaStore.EXTRA_DURATION_LIMIT, 60);
                    cam.putExtra(MediaStore.EXTRA_VIDEO_QUALITY, 1);
                    Intent chooser = Intent.createChooser(base, "Record or pick video");
                    chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{ cam });
                    if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                        pendingCameraChooserIntent = chooser;
                        pendingFallbackFileIntent = base;
                        requestPermissions(new String[]{ Manifest.permission.CAMERA }, CAMERA_CHOOSER);
                    } else {
                        startActivityForResult(chooser, PICK_FILES);
                    }
                } else {
                    startActivityForResult(base, PICK_FILES);
                }
            } catch (ActivityNotFoundException e) {
                pendingFiles = null;
                return false;
            }
            return true;
        }

        /** Voice notes and circular video messages: mic and camera, for Radica only. */
        @Override
        public void onPermissionRequest(PermissionRequest req) {
            if (!isRadicaUrl(currentTopUrl)) {
                req.deny();
                return;
            }
            List<String> requested = java.util.Arrays.asList(req.getResources());
            java.util.ArrayList<String> wantedRes = new java.util.ArrayList<>();
            java.util.ArrayList<String> missingAndroid = new java.util.ArrayList<>();
            if (requested.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                wantedRes.add(PermissionRequest.RESOURCE_AUDIO_CAPTURE);
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    missingAndroid.add(Manifest.permission.RECORD_AUDIO);
                }
            }
            if (requested.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                wantedRes.add(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
                if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                    missingAndroid.add(Manifest.permission.CAMERA);
                }
            }
            if (wantedRes.isEmpty()) {
                req.deny();
            } else if (missingAndroid.isEmpty()) {
                req.grant(wantedRes.toArray(new String[0]));
            } else {
                if (pendingMic != null) pendingMic.deny();
                pendingMic = req;
                pendingMediaResources = wantedRes.toArray(new String[0]);
                requestPermissions(missingAndroid.toArray(new String[0]), MIC);
            }
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILES && pendingFiles != null) {
            Uri[] parsed = WebChromeClient.FileChooserParams.parseResult(result, data);
            if ((parsed == null || parsed.length == 0) && result == RESULT_OK && data != null && data.getData() != null) {
                parsed = new Uri[]{ data.getData() };
            }
            pendingFiles.onReceiveValue(parsed);
            pendingFiles = null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        if (request == CAMERA_CHOOSER) {
            Intent chooser = pendingCameraChooserIntent;
            Intent fallback = pendingFallbackFileIntent;
            pendingCameraChooserIntent = null;
            pendingFallbackFileIntent = null;
            Intent target = (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED && chooser != null)
                    ? chooser
                    : fallback;
            if (target != null) {
                try {
                    startActivityForResult(target, PICK_FILES);
                    return;
                } catch (Exception ignored) {}
            }
            if (pendingFiles != null) {
                pendingFiles.onReceiveValue(null);
                pendingFiles = null;
            }
            return;
        }
        if (request == MIC_NATIVE) {
            int maxSec = pendingNativeVoiceMaxSec > 0 ? pendingNativeVoiceMaxSec : 10;
            pendingNativeVoiceMaxSec = 0;
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                beginNativeVoiceRecording(maxSec);
            } else {
                dispatchNativeVoiceEvent("{\"type\":\"radica_native_voice\",\"event\":\"error\",\"message\":\"Microphone permission denied\"}");
            }
            return;
        }
        if (request == MIC && pendingMic != null) {
            java.util.ArrayList<String> granted = new java.util.ArrayList<>();
            if (pendingMediaResources != null) {
                for (String res : pendingMediaResources) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)
                            && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        granted.add(res);
                    } else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)
                            && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        granted.add(res);
                    }
                }
            }
            if (!granted.isEmpty()) {
                pendingMic.grant(granted.toArray(new String[0]));
            } else {
                pendingMic.deny();
            }
            pendingMic = null;
            pendingMediaResources = null;
        }
    }
}
