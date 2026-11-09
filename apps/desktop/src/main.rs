//! Radica for the desktop.
//!
//! `cargo run -p radica-desktop` finds, installs or starts the local Freenet node and opens Radica web in a window
//! (`web.rs`); `-- --native` opens the native Rune UI instead. Headless, `-- --snap out.png --scene NAME` renders a screen (`-- --live`
//! populates `--snap` with live Freenet data).

// No console window behind the app on Windows release builds.
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod host;
mod install;
mod live;
mod media;
mod release;
mod river;
mod web;

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
    if !std::env::args().any(|a| a == "--native") {
        if let Err(e) = web::run() {
            eprintln!("Radica: could not open the window: {e}");
            std::process::exit(1);
        }
        return;
    }
    let host = Arc::new(host::DesktopHost::new());
    radica_app::app(move |handle| RadicaApp::attached(Controller::new(host, handle))).run();
}
