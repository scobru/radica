//! Radica for the desktop: finds, installs or starts the local Freenet node, then opens Radica web from it in a
//! window (`web.rs`), so the desktop does what the web does from one codebase.

// No console window behind the app on Windows release builds.
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod host;
mod install;
mod release;
mod web;

#[cfg(test)]
#[test]
fn the_app_carries_radica_s_version() {
    let pkg: serde_json::Value =
        serde_json::from_str(include_str!("../../../package.json")).unwrap();
    assert_eq!(
        pkg["version"].as_str(),
        Some(env!("CARGO_PKG_VERSION")),
        "set apps/Cargo.toml's version to package.json's"
    );
}

fn main() {
    if let Err(e) = web::run() {
        eprintln!("Radica: could not open the window: {e}");
        std::process::exit(1);
    }
}
