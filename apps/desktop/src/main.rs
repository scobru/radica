//! Radica for the desktop.
//!
//! `cargo run -p radica-desktop` opens the window connected to the local Freenet node's live
//! Radica contracts. Headless, `-- --snap out.png --scene NAME` renders a screen (`-- --live`
//! populates `--snap` with live Freenet data).

// No console window behind the app on Windows release builds.
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod host;
mod install;
mod live;
mod release;

use std::sync::Arc;

use radica_app::{Controller, RadicaApp};

fn detached_live() -> RadicaApp {
    let mut app = RadicaApp::detached();
    if let Some(s) = live::load_live() {
        app.chat.apply_live(s);
    }
    app
}

fn main() {
    if rune::is_headless() {
        let mut spec = radica_app::spec();
        if std::env::args().any(|a| a == "--live") {
            spec.init = detached_live;
        }
        rune::run(spec);
        return;
    }
    let host = Arc::new(host::DesktopHost::new());
    radica_app::app(move |handle| RadicaApp::attached(Controller::new(host, handle))).run();
}
