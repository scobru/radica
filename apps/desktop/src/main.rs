//! Radica for the desktop: finds, installs or starts the local Freenet node, then opens Radica web from it in a
//! window (`web.rs`), so the desktop does what the web does from one codebase.

// No console window behind the app on Windows release builds.
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod host;
mod install;
mod release;
mod web;

fn main() {
    if let Err(e) = web::run() {
        eprintln!("Radica: could not open the window: {e}");
        std::process::exit(1);
    }
}
