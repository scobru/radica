//! Windows: the app's icon goes into radica.exe as resource 1, so Explorer, the taskbar and the window show it
//! (`web.rs` reads the same resource for the window).

#[cfg(windows)]
fn main() {
    println!("cargo:rerun-if-changed=assets/radica.ico");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        winresource::WindowsResource::new()
            .set_icon("assets/radica.ico")
            .compile()
            .expect("could not put the icon into radica.exe");
    }
}

#[cfg(not(windows))]
fn main() {}
