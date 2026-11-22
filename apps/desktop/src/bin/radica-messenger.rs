//! Radica Messenger for the desktop: launches Radica desktop locked to standalone chat mode.

// No console window behind the app on Windows release builds.
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

fn main() {
    if let Err(e) = radica_desktop::web::run_with_mode(radica_desktop::web::AppMode::Messenger) {
        eprintln!("Radica Messenger: could not open the window: {e}");
        std::process::exit(1);
    }
}
