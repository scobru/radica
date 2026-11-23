//! Windows: the app's icon goes into radica.exe as resource 1, so Explorer, the taskbar and the window show it
//! (`web.rs` reads the same resource for the window).
//! Every platform: Radica web (`ui/dist`, without its heavy optional assets) goes into the binary as `bundled_ui.rs`,
//! for opening Radica without a Freenet node (`web.rs`, `radica://`). Without a built `ui/dist` the table is empty and
//! the app simply has no offline mode.

use std::path::Path;

/// The image filter, translation engine and GIFs (~58 MB) stay in their own Freenet containers.
const HEAVY: [&str; 3] = ["moderation", "gifs", "translate"];

fn bundle_ui() {
    let dist = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../ui/dist");
    println!("cargo:rerun-if-changed={}", dist.display());
    let mut files = Vec::new();
    collect(&dist, &dist, &mut files);
    files.sort();
    let mut out = String::from("pub static FILES: &[(&str, &[u8])] = &[\n");
    for (rel, abs) in &files {
        out += &format!("    ({rel:?}, include_bytes!({abs:?})),\n");
    }
    out += "];\n";
    std::fs::write(Path::new(&std::env::var("OUT_DIR").unwrap()).join("bundled_ui.rs"), out).unwrap();
}

fn collect(root: &Path, dir: &Path, files: &mut Vec<(String, String)>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let path = e.path();
        let rel = path.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/");
        if HEAVY.iter().any(|h| rel == *h) {
            continue;
        }
        if path.is_dir() {
            collect(root, &path, files);
        } else {
            files.push((rel, path.to_string_lossy().into_owned())); // absolute, from CARGO_MANIFEST_DIR
        }
    }
}

fn main() {
    bundle_ui();
    #[cfg(windows)]
    {
        println!("cargo:rerun-if-changed=assets/radica.ico");
        if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
            winresource::WindowsResource::new()
                .set_icon("assets/radica.ico")
                .compile()
                .expect("could not put the icon into radica.exe");
        }
    }
}
