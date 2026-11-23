//! The desktop app: a window around Radica web, served by the local Freenet node, so the desktop does what the web
//! does from one codebase. Before the page can load, the node must run: this finds, installs or starts it with the same
//! code the native app uses ([`DesktopHost`]), showing each step in the window.

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, Instant};

use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy};
use tao::window::WindowBuilder;
use wry::{NewWindowResponse, WebContext, WebViewBuilder};

use crate::host::{DesktopHost, InstallStep, MANUAL_INSTALL_URL, NodeProbe};

/// Radica web, as the node serves it.
const RADICA_KEY: &str = "Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw";
const VISO_KEY: &str = "GzHy3jnEtj26EoGqMsBpoawcY378hK9kp91rTcNYiAac";
const RADICA_WEB_URL: &str =
    "http://127.0.0.1:7509/v1/contract/web/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/";
const MAX_STORAGE_BYTES: usize = 8 * 1024 * 1024;

fn is_contract_prefix(url: &str, key: &str) -> bool {
    let loopback = format!("http://127.0.0.1:7509/v1/contract/web/{key}");
    let localhost = format!("http://localhost:7509/v1/contract/web/{key}");
    [loopback, localhost].iter().any(|base| {
        url == base
            || url.starts_with(&format!("{base}/"))
            || url.starts_with(&format!("{base}?"))
            || url.starts_with(&format!("{base}#"))
    })
}

fn is_radica_url(url: &str) -> bool {
    is_contract_prefix(url, RADICA_KEY)
}

fn is_allowed_nav(url: &str) -> bool {
    is_radica_url(url)
        || is_contract_prefix(url, VISO_KEY)
        || url == "about:blank"
        || url.starts_with("data:text/html")
}

enum Ui {
    Status(String),
    Failed(String),
    Open,
    Retry,
    VoiceEvent(crate::audio::VoiceEvent),
}

const LOADING: &str = r#"<!doctype html><meta charset="utf-8"><title>Radica</title>
<style>
:root{color-scheme:light dark;--bg:#f6f3ea;--fg:#2b2a26;--muted:#77736a;--accent:#3d6b2a}
@media (prefers-color-scheme:dark){:root{--bg:#141310;--fg:#ecead8;--muted:#9a978a;--accent:#7fae5c}}
body{margin:0;height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:15px system-ui,sans-serif}
main{text-align:center;max-width:28rem;padding:16px}
h1{font:600 28px Georgia,serif;margin:0 0 12px}
p{color:var(--muted);margin:0 0 16px;white-space:pre-wrap}
button{display:none;border:0;border-radius:999px;padding:8px 20px;background:var(--accent);color:#fff;font:inherit;cursor:pointer}
.failed button{display:inline-block}.failed p{color:var(--fg)}
</style>
<main><h1>Radica</h1><p id="s">Looking for your Freenet node…</p>
<button onclick="window.ipc.postMessage('retry')">Try again</button></main>
<script>
function setStatus(t,failed){document.getElementById('s').textContent=t;document.body.className=failed?'failed':''}
</script>"#;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AppMode {
    Full,
    Messenger,
}

impl AppMode {
    pub const fn title(self) -> &'static str {
        match self {
            AppMode::Full => "Radica",
            AppMode::Messenger => "Radica Messenger",
        }
    }

    pub const fn js_mode(self) -> &'static str {
        match self {
            AppMode::Full => "full",
            AppMode::Messenger => "messenger",
        }
    }

    pub const fn webview_dir_name(self) -> &'static str {
        match self {
            AppMode::Full => "webview",
            AppMode::Messenger => "webview-messenger",
        }
    }

    pub fn window_size(self) -> tao::dpi::LogicalSize<f64> {
        match self {
            AppMode::Full => tao::dpi::LogicalSize::new(1280.0, 860.0),
            AppMode::Messenger => tao::dpi::LogicalSize::new(1080.0, 780.0),
        }
    }
}

fn loading_html(mode: AppMode) -> String {
    LOADING.replace("Radica", mode.title())
}

/// The web opens profiles, docs and other Freenet apps with `window.open`, and navigates itself away when that returns
/// null. Here they go to the system browser, and the page gets a stand-in window so it stays where it is.
const OPEN_IN_BROWSER: &str = r#"window.open = function (url) {
  try { window.ipc.postMessage("open:" + new URL(url, location.href).href); } catch (e) {}
  return { closed: false, opener: null, focus() {}, close() {} };
};"#;

/// Radica runs in a sandboxed iframe the node's shell serves (no `allow-same-origin`): `window.localStorage` throws
/// there, and `storage.ts`'s fallback (`window.name` + URL hash) is lost whenever this window is closed and
/// reopened. `window.__radicaNative` gives it a real, file-backed alternative that survives that; `initial` is
/// read from disk once at startup and seeded here since the init script runs before the page's own JS does.
fn native_storage_script(initial_blob: &str, mode: AppMode) -> String {
    format!(
        r#"(function() {{
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):7509\/v1\/contract\/web\/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw(?:[/?#]|$)/.test(String(location.href || ""))) return;
  var initial = {};
  window.__radicaNative = {{
    getAppMode: function() {{ return {}; }},
    openExternal: function(url) {{
      try {{ window.ipc.postMessage("open:" + new URL(url, location.href).href); }} catch (e) {{}}
    }},
    getAll: function() {{ return initial; }},
    setAll: function(json) {{
      initial = json;
      try {{ window.ipc.postMessage("storage:" + json); }} catch (e) {{}}
    }},
    canRecordVoice: function() {{ return true; }},
    startVoiceRec: function(maxSec) {{
      try {{ window.ipc.postMessage("voice:start:" + Math.max(1, Math.min(60, Math.round(Number(maxSec) || 10)))); }} catch (e) {{}}
    }},
    stopVoiceRec: function() {{
      try {{ window.ipc.postMessage("voice:stop"); }} catch (e) {{}}
    }},
    cancelVoiceRec: function() {{
      try {{ window.ipc.postMessage("voice:cancel"); }} catch (e) {{}}
    }}
  }};
}})();"#,
        serde_json::to_string(initial_blob).unwrap_or_else(|_| "\"\"".to_string()),
        serde_json::to_string(mode.js_mode()).unwrap_or_else(|_| "\"full\"".to_string())
    )
}

/// Where the native storage bridge keeps its blob, next to the webview's own profile directory.
fn storage_path() -> Option<std::path::PathBuf> {
    directories::ProjectDirs::from("", "Freenet", "Radica").map(|d| d.data_local_dir().join("storage.json"))
}

fn write_storage_atomic(path: &std::path::Path, json: &str) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("json.tmp");
    {
        use std::io::Write;
        let mut opts = std::fs::OpenOptions::new();
        opts.create(true).write(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(0o600);
        }
        let mut f = opts.open(&tmp)?;
        f.write_all(json.as_bytes())?;
        f.sync_all()?;
    }
    std::fs::rename(&tmp, path)
}

/// Only web pages, and the one app-handler link Radica itself renders (Spore Radio's hand-off to the Spore desktop
/// app), go to the system: anything else the page asks for (`file:`, an arbitrary app-handler URL) is refused.
fn is_safe_external_url(url: &str) -> bool {
    !url.chars().any(|c| c.is_control())
        && (url.starts_with("https://") || url.starts_with("http://") || url.starts_with("spore:radio:"))
}

fn open_external(url: &str) {
    if is_safe_external_url(url) {
        launch_externally(url);
    }
}

/// Hand `url` to the OS: the system browser for `http(s)`, or whatever app registered the scheme otherwise.
fn launch_externally(url: &str) {
    use std::process::Command;
    #[cfg(target_os = "windows")]
    {
        let sys_root = std::env::var_os("SystemRoot")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| std::path::PathBuf::from(r"C:\Windows"));
        let rundll32 = sys_root.join("System32").join("rundll32.exe");
        let _ = Command::new(rundll32)
            .args(["url.dll,FileProtocolHandler", url])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    let _ = Command::new("open").arg(url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let _ = Command::new("xdg-open").arg(url).spawn();
}

fn step_text(step: &InstallStep) -> String {
    match step {
        InstallStep::FindingRelease => "Finding the latest Freenet…".into(),
        InstallStep::Downloading {
            received,
            total: Some(t),
        } if *t > 0 => format!("Downloading Freenet… {}%", received * 100 / t),
        InstallStep::Downloading { received, .. } => {
            format!("Downloading Freenet… {} MB", received / 1_000_000)
        }
        InstallStep::Verifying => "Checking the download…".into(),
        InstallStep::Installing => "Installing Freenet…".into(),
        InstallStep::WaitingForInstaller => "Finish the Freenet installer to continue…".into(),
    }
}

/// The longest Freenet may take to answer once started: a first start sets up its data and joins the network.
const ANSWER_DEADLINE: Duration = Duration::from_secs(180);

/// Get a node running: install it if missing, start it if stopped, then wait for it to answer, counting the seconds.
fn bring_up(host: &DesktopHost, tell: &dyn Fn(Ui)) -> Result<(), String> {
    let mut started: Option<Instant> = None;
    loop {
        match host.probe() {
            NodeProbe::Running { .. } => return Ok(()),
            NodeProbe::Outdated { running, minimum } => {
                return Err(format!(
                    "Your Freenet node ({}) is older than Radica needs ({minimum}). Update Freenet and try again.",
                    running.as_deref().unwrap_or("an old version")
                ));
            }
            NodeProbe::NotInstalled if !host.can_install() => {
                return Err(format!(
                    "Freenet is not installed. Install it from {MANUAL_INSTALL_URL} and try again."
                ));
            }
            NodeProbe::NotInstalled => {
                host.install(&mut |s| tell(Ui::Status(step_text(&s))))?;
            }
            NodeProbe::InstalledNotRunning => match started {
                None => {
                    // `freenet service start` can take a while (on Windows it launches Freenet's wrapper)
                    let t0 = Instant::now();
                    std::thread::scope(|s| {
                        let start = s.spawn(|| host.start());
                        while !start.is_finished() {
                            tell(Ui::Status(format!(
                                "Starting Freenet… {} s",
                                t0.elapsed().as_secs()
                            )));
                            std::thread::sleep(Duration::from_secs(1));
                        }
                        start
                            .join()
                            .unwrap_or_else(|_| Err("starting Freenet crashed".into()))
                    })?;
                    started = Some(Instant::now());
                }
                Some(t) if t.elapsed() > ANSWER_DEADLINE => return Err(not_answering()),
                Some(t) => {
                    tell(Ui::Status(format!(
                        "Freenet is starting, waiting for it to answer… {} s",
                        t.elapsed().as_secs()
                    )));
                    std::thread::sleep(Duration::from_secs(1));
                }
            },
        }
    }
}

fn not_answering() -> String {
    let check = if cfg!(windows) {
        "Check that Freenet's icon is in the system tray (if not, open Freenet from the Start menu)"
    } else if cfg!(target_os = "macos") {
        "Check that Freenet's icon is in the menu bar (if not, open Freenet from Applications)"
    } else {
        "Check it with `freenet service status`, or restart it with `freenet service restart`"
    };
    format!(
        "Freenet was started but has not answered for {} minutes. {check}, then try again.",
        ANSWER_DEADLINE.as_secs() / 60
    )
}

fn spawn_bring_up(proxy: EventLoopProxy<Ui>) {
    std::thread::spawn(move || {
        let tell = |u: Ui| {
            let _ = proxy.send_event(u);
        };
        tell(match bring_up(&DesktopHost::new(), &tell) {
            Ok(()) => Ui::Open,
            Err(e) => Ui::Failed(e),
        });
    });
}

/// Radica's icon on the window and the taskbar. Windows reads it from radica.exe (build.rs puts it there, at every
/// size); Linux gets the 64 px pixels; a macOS app takes its icon from its bundle.
#[cfg(windows)]
fn with_icon(builder: WindowBuilder) -> WindowBuilder {
    use tao::platform::windows::{IconExtWindows, WindowBuilderExtWindows};
    use tao::window::Icon;
    // without the icon the app still opens: a missing resource must not stop it
    let icon = |px: u32| Icon::from_resource(1, Some(tao::dpi::PhysicalSize::new(px, px))).ok();
    builder
        .with_window_icon(icon(32))
        .with_taskbar_icon(icon(256))
}
#[cfg(target_os = "macos")]
fn with_icon(builder: WindowBuilder) -> WindowBuilder {
    builder
}
#[cfg(not(any(windows, target_os = "macos")))]
fn with_icon(builder: WindowBuilder) -> WindowBuilder {
    let pixels = include_bytes!("../assets/icon-64.rgba").to_vec();
    builder.with_window_icon(tao::window::Icon::from_rgba(pixels, 64, 64).ok())
}

pub fn run() -> wry::Result<()> {
    run_with_mode(AppMode::Full)
}

pub fn run_with_mode(mode: AppMode) -> wry::Result<()> {
    let event_loop = EventLoopBuilder::<Ui>::with_user_event().build();
    let window = with_icon(
        WindowBuilder::new()
            .with_title(mode.title())
            .with_inner_size(mode.window_size()),
    )
    .build(&event_loop)
    .map_err(|e| wry::Error::Io(std::io::Error::other(e)))?;
    // The web app keeps identity and keys in its storage: a fixed folder keeps them across runs.
    let mut context = WebContext::new(
        directories::ProjectDirs::from("", "Freenet", "Radica")
            .map(|d| d.data_local_dir().join(mode.webview_dir_name())),
    );
    let retry = event_loop.create_proxy();
    let voice_proxy = event_loop.create_proxy();
    let voice_ctrl = Arc::new(crate::audio::NativeVoiceController::new());
    let voice_ctrl_ipc = Arc::clone(&voice_ctrl);
    let voice_ctrl_close = Arc::clone(&voice_ctrl);
    let radica_opened = Arc::new(AtomicBool::new(false));
    let radica_opened_ipc = Arc::clone(&radica_opened);
    let storage_path = storage_path();
    let initial_storage_blob = storage_path.as_ref().and_then(|p| std::fs::read_to_string(p).ok()).unwrap_or_default();
    let builder = WebViewBuilder::new_with_web_context(&mut context)
        .with_html(loading_html(mode))
        .with_initialization_script_for_main_only(OPEN_IN_BROWSER, false)
        .with_initialization_script_for_main_only(&native_storage_script(&initial_storage_blob, mode), false)
        .with_navigation_handler(|url| {
            if is_allowed_nav(&url) {
                true
            } else {
                open_external(&url);
                false
            }
        })
        .with_ipc_handler(move |req| {
            let origin_uri = req.uri().to_string();
            match req.body().strip_prefix("open:") {
                Some(url) => {
                    if is_radica_url(&origin_uri) {
                        open_external(url);
                    }
                }
                None if req.body() == "retry" => {
                    if !radica_opened_ipc.load(Ordering::Relaxed) {
                        let _ = retry.send_event(Ui::Retry);
                    }
                }
                None => {
                    if let Some(json) = req.body().strip_prefix("storage:") {
                        if is_radica_url(&origin_uri) && json.len() <= MAX_STORAGE_BYTES {
                            if let Some(p) = &storage_path {
                                let _ = write_storage_atomic(p, json);
                            }
                        }
                    } else if req.body() == "voice:stop" {
                        if is_radica_url(&origin_uri) {
                            voice_ctrl_ipc.stop();
                        }
                    } else if req.body() == "voice:cancel" {
                        if is_radica_url(&origin_uri) {
                            voice_ctrl_ipc.cancel();
                        }
                    } else if let Some(sec_str) = req.body().strip_prefix("voice:start:") {
                        if is_radica_url(&origin_uri) {
                            let max_sec = sec_str.trim().parse::<u32>().unwrap_or(10).clamp(1, 60);
                            let vp = voice_proxy.clone();
                            voice_ctrl_ipc.start(max_sec, move |ev| {
                                let _ = vp.send_event(Ui::VoiceEvent(ev));
                            });
                        }
                    }
                }
            }
        })
        // `target="_blank"` links: the system browser too.
        .with_new_window_req_handler(|url, _| {
            open_external(&url);
            NewWindowResponse::Deny
        });
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    let webview = builder.build(&window)?;
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let webview = {
        use tao::platform::unix::WindowExtUnix;
        use wry::WebViewBuilderExtUnix;
        builder.build_gtk(window.default_vbox().expect("tao makes a vbox on Linux"))?
    };

    spawn_bring_up(event_loop.create_proxy());
    let proxy = event_loop.create_proxy();
    event_loop.run(move |event, _, flow| {
        *flow = ControlFlow::Wait;
        let status = |text: &str, failed: bool| {
            let arg = serde_json::to_string(text).unwrap_or_default();
            let _ = webview.evaluate_script(&format!("setStatus({arg},{failed})"));
        };
        match event {
            Event::UserEvent(Ui::Status(s)) => status(&s, false),
            Event::UserEvent(Ui::Failed(e)) => status(&e, true),
            Event::UserEvent(Ui::Open) => {
                radica_opened.store(true, Ordering::Relaxed);
                let _ = webview.load_url(RADICA_WEB_URL);
            }
            Event::UserEvent(Ui::Retry) => {
                status("Looking for your Freenet node…", false);
                spawn_bring_up(proxy.clone());
            }
            Event::UserEvent(Ui::VoiceEvent(ev)) => {
                if let Ok(payload) = serde_json::to_string(&ev.to_json()) {
                    let js = format!(
                        "(function(d){{try{{window.postMessage(d,'*');var fs=document.getElementsByTagName('iframe');for(var i=0;i<fs.length;i++){{try{{fs[i].contentWindow.postMessage(d,'*');}}catch(e){{}}}}}}catch(e){{}}}})({payload});"
                    );
                    let _ = webview.evaluate_script(&js);
                }
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                voice_ctrl_close.cancel();
                *flow = ControlFlow::Exit;
            }
            _ => {}
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_steps_read_as_progress() {
        let d = |received, total| InstallStep::Downloading { received, total };
        assert_eq!(step_text(&d(50, Some(200))), "Downloading Freenet… 25%");
        assert_eq!(step_text(&d(3_000_000, None)), "Downloading Freenet… 3 MB");
        assert_eq!(step_text(&d(1, Some(0))), "Downloading Freenet… 0 MB");
    }

    #[test]
    fn radica_and_allowed_nav_gate_untrusted_contracts() {
        assert!(is_radica_url(RADICA_WEB_URL));
        assert!(is_radica_url("http://localhost:7509/v1/contract/web/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/#p=1"));
        assert!(!is_radica_url("http://127.0.0.1:7509/v1/contract/web/GzHy3jnEtj26EoGqMsBpoawcY378hK9kp91rTcNYiAac/"));
        assert!(!is_radica_url("http://127.0.0.1:7509/v1/contract/web/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2SwEVIL/"));

        assert!(is_allowed_nav(RADICA_WEB_URL));
        assert!(is_allowed_nav("http://127.0.0.1:7509/v1/contract/web/GzHy3jnEtj26EoGqMsBpoawcY378hK9kp91rTcNYiAac/?connect=v1"));
        assert!(is_allowed_nav("about:blank"));
        assert!(!is_allowed_nav("http://127.0.0.1:7509/v1/contract/web/SomeOtherApp/"));
        assert!(!is_allowed_nav("https://evil.example/"));
        assert!(is_safe_external_url("https://freenet.org"));
        assert!(is_safe_external_url("spore:radio:123"));
        assert!(!is_safe_external_url("https://freenet.org/\nevil"));
        assert!(!is_safe_external_url("file:///etc/passwd"));
    }

    #[test]
    fn app_mode_configures_messenger_binary() {
        assert_eq!(AppMode::Full.title(), "Radica");
        assert_eq!(AppMode::Full.js_mode(), "full");
        assert_eq!(AppMode::Full.webview_dir_name(), "webview");
        assert_eq!(AppMode::Messenger.title(), "Radica Messenger");
        assert_eq!(AppMode::Messenger.js_mode(), "messenger");
        assert_eq!(AppMode::Messenger.webview_dir_name(), "webview-messenger");
        assert!(loading_html(AppMode::Messenger).contains("<h1>Radica Messenger</h1>"));
        assert!(loading_html(AppMode::Messenger).contains("<title>Radica Messenger</title>"));
        let script = native_storage_script("{\"k\":\"v\"}", AppMode::Messenger);
        assert!(script.contains("getAppMode: function() { return \"messenger\"; }"));
        assert!(script.contains("openExternal: function(url)"));
        assert!(script.contains("canRecordVoice: function() { return true; }"));
        assert!(script.contains("startVoiceRec: function(maxSec)"));
        let full_script = native_storage_script("{}", AppMode::Full);
        assert!(full_script.contains("getAppMode: function() { return \"full\"; }"));
    }
}
