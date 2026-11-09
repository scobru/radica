//! The desktop app: a window around Radica web, served by the local Freenet node, so the desktop does what the web
//! does from one codebase. Before the page can load, the node must run: this finds, installs or starts it with the same
//! code the native app uses ([`DesktopHost`]), showing each step in the window.

use std::time::{Duration, Instant};

use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy};
use tao::window::WindowBuilder;
use wry::{NewWindowResponse, WebContext, WebViewBuilder};

use crate::host::{DesktopHost, InstallStep, MANUAL_INSTALL_URL, NodeProbe};

/// Radica web, as the node serves it.
const RADICA_WEB_URL: &str =
    "http://127.0.0.1:7509/v1/contract/web/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/";

enum Ui {
    Status(String),
    Failed(String),
    Open,
    Retry,
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

/// The web opens profiles, docs and other Freenet apps with `window.open`, and navigates itself away when that returns
/// null. Here they go to the system browser, and the page gets a stand-in window so it stays where it is.
const OPEN_IN_BROWSER: &str = r#"window.open = function (url) {
  try { window.ipc.postMessage("open:" + new URL(url, location.href).href); } catch (e) {}
  return { closed: false, opener: null, focus() {}, close() {} };
};"#;

/// Only web pages go to the browser: the page asks, so a `file:` or app-handler URL is refused.
fn open_external(url: &str) {
    if url.starts_with("https://") || url.starts_with("http://") {
        open_in_browser(url);
    }
}

fn open_in_browser(url: &str) {
    use std::process::Command;
    #[cfg(target_os = "windows")]
    let _ = Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", url])
        .spawn();
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

pub fn run() -> wry::Result<()> {
    let event_loop = EventLoopBuilder::<Ui>::with_user_event().build();
    let window = WindowBuilder::new()
        .with_title("Radica")
        .with_inner_size(tao::dpi::LogicalSize::new(1280.0, 860.0))
        .build(&event_loop)
        .map_err(|e| wry::Error::Io(std::io::Error::other(e)))?;
    // The web app keeps identity and keys in its storage: a fixed folder keeps them across runs.
    let mut context = WebContext::new(
        directories::ProjectDirs::from("", "Freenet", "Radica")
            .map(|d| d.data_local_dir().join("webview")),
    );
    let retry = event_loop.create_proxy();
    let builder = WebViewBuilder::new_with_web_context(&mut context)
        .with_html(LOADING)
        .with_initialization_script_for_main_only(OPEN_IN_BROWSER, false)
        .with_ipc_handler(move |req| match req.body().strip_prefix("open:") {
            Some(url) => open_external(url),
            None if req.body() == "retry" => {
                let _ = retry.send_event(Ui::Retry);
            }
            None => {}
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
                let _ = webview.load_url(RADICA_WEB_URL);
            }
            Event::UserEvent(Ui::Retry) => {
                status("Looking for your Freenet node…", false);
                spawn_bring_up(proxy.clone());
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => *flow = ControlFlow::Exit,
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
}
