//! Radica's native UI, shared by every platform shell.
//!
//! A shell (today `apps/desktop`) supplies a [`NodeHost`] that knows how to find, install and
//! start Freenet on its platform; everything the user sees lives here.
// ponytail: reuses River's proven Rune node-setup & chat architecture in an isolated Cargo workspace

pub mod chat;
pub mod node;
pub mod setup;

use rune::{AppHandle, AppSpec, Cx, El, Tx, col, el, row, text};
use rune_kit::{Button, ButtonVariant, Kit};

pub use chat::Chat;
pub use node::{
    IdentityInfo, InstallStep, LiveAction, LiveSnapshot, MANUAL_INSTALL_URL, NodeHost, NodeProbe,
};
pub use setup::{Controller, Setup};

/// Live Freenet web container URL for the full Radica social dApp.
pub const RADICA_WEB_URL: &str =
    "http://127.0.0.1:7509/v1/contract/web/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/";

pub struct RadicaApp {
    pub setup: Setup,
    /// The chat screen, shown once setup reaches [`Setup::Connected`]. It holds example data
    /// for now ([`chat::Source::Example`]): nothing is read from or sent to the node yet.
    pub chat: Chat,
    /// `None` in headless snapshots and tests, where nothing runs in the background.
    ctl: Option<Controller>,
    /// Radica's logo, rasterized once by [`load_logo`]. `None` until then, and in tests, which
    /// draw an empty square in its place.
    logo: Option<Logo>,
}

/// The logo and the cache that keeps its pixels alive.
struct Logo {
    _cache: rune::image::ImageCache,
    image: rune::image::Image,
}

/// The web UI's sprout logo, so both apps carry the same mark.
const LOGO_SVG: &[u8] = include_bytes!("../../../ui/public/radica_logo.svg");
const LOGO_PATH: &str = "ui/public/radica_logo.svg";
/// The logo's largest drawn size in points (the setup card draws it at this size, the room
/// list smaller), and the scale it rasterizes at. Smaller draws use its mips.
const LOGO_PT: f32 = 36.0;
const LOGO_SCALE: f32 = 2.0;

/// `AppSpec::setup`: start rasterizing the logo on the image cache's worker. A headless run
/// (`--snap`) waits for it, so snapshots show it, and fails if it does not rasterize.
fn load_logo(s: &mut RadicaApp, waker: rune::Waker) {
    s.chat.init_avatar_cache(waker.clone());
    let cache = rune::image::ImageCache::new(waker);
    let image = cache.svg(LOGO_SVG, LOGO_PT, LOGO_SCALE);
    if rune::is_headless()
        && let Err(e) = image.wait()
    {
        panic!("Radica's logo ({LOGO_PATH}) did not rasterize: {e}");
    }
    s.logo = Some(Logo {
        _cache: cache,
        image,
    });
}

impl RadicaApp {
    /// A window with nothing running behind it, for snapshots and tests.
    pub fn detached() -> Self {
        RadicaApp {
            setup: Setup::Checking,
            // TODO: example rooms; this goes once the app reads real rooms from the node.
            chat: Chat::example(),
            ctl: None,
            logo: None,
        }
    }

    /// The live app: starts checking for a node straight away.
    pub fn attached(ctl: Controller) -> Self {
        ctl.check();
        RadicaApp {
            setup: Setup::Checking,
            // TODO: example rooms; this goes once the app reads real rooms from the node.
            chat: Chat::example(),
            ctl: Some(ctl),
            logo: None,
        }
    }

    fn can_install(&self) -> bool {
        self.ctl.as_ref().is_none_or(Controller::can_install)
    }

    fn install(&mut self) {
        if let Some(ctl) = &self.ctl {
            ctl.install();
        }
    }

    fn retry(&mut self) {
        if let Some(ctl) = &self.ctl {
            ctl.check();
        }
    }

    /// Send a file from disk as an attachment in the open room (the node seals and publishes it).
    pub fn send_attachment(&mut self, path: std::path::PathBuf) {
        let Some(room_key) = self.chat.room().map(|r| r.key.clone()) else {
            return;
        };
        let reply_to = self.chat.replying_to.take().map(|r| r.message);
        if let Some(ctl) = &self.ctl {
            ctl.act(LiveAction::SendAttachment {
                room_key,
                path,
                reply_to,
            });
        }
    }

    pub fn send_chat(&mut self) {
        let key = self.chat.room().map(|r| r.key.clone());
        let raw = self.chat.composer.text.trim().to_owned();
        let text = self.chat.take_mentions(&raw);
        let editing = self.chat.editing_id;
        let reply_to = self.chat.replying_to.as_ref().map(|r| r.message);
        if self.chat.send()
            && matches!(self.chat.source, chat::Source::Live(_))
            && let (Some(ctl), Some(room_key)) = (&self.ctl, key)
        {
            if let Some(msg_id) = editing {
                ctl.act(LiveAction::EditMessage {
                    room_key,
                    msg_id,
                    new_text: text,
                });
            } else {
                ctl.act(LiveAction::SendMessage {
                    room_key,
                    text,
                    reply_to,
                });
            }
        }
    }

    pub fn react_msg(&mut self, msg_id: u32, emoji: &str) {
        if let Some((room_key, msg_id, emoji, on)) = self.chat.toggle_react(msg_id, emoji)
            && matches!(self.chat.source, chat::Source::Live(_))
            && let Some(ctl) = &self.ctl
        {
            ctl.act(LiveAction::ReactMessage {
                room_key,
                msg_id,
                emoji,
                on,
            });
        }
    }

    pub fn delete_msg(&mut self, msg_id: u32) {
        if let Some((room_key, msg_id)) = self.chat.delete_msg(msg_id)
            && matches!(self.chat.source, chat::Source::Live(_))
            && let Some(ctl) = &self.ctl
        {
            ctl.act(LiveAction::DeleteMessage { room_key, msg_id });
        }
    }

    /// Open a room from the list; on the node it counts as read up to now.
    pub fn open_room(&mut self, room_key: &str) {
        self.chat.select(room_key);
        if matches!(self.chat.source, chat::Source::Live(_))
            && let Some(ctl) = &self.ctl
        {
            ctl.act(LiveAction::MarkRead {
                room_key: room_key.to_owned(),
            });
        }
    }

    pub fn remove_room(&mut self, room_key: &str) {
        if self.chat.remove_room(room_key)
            && matches!(self.chat.source, chat::Source::Live(_))
            && let Some(ctl) = &self.ctl
        {
            ctl.act(LiveAction::RemoveRoom {
                room_key: room_key.to_owned(),
            });
        }
    }

    pub fn create_room(&mut self) {
        if self.chat.creating_private_room || self.chat.create_input.text.trim().starts_with("🔒")
        {
            if let Some(name) = self.chat.submit_create_private_room()
                && matches!(self.chat.source, chat::Source::Live(_))
                && let Some(ctl) = &self.ctl
            {
                ctl.act(LiveAction::CreatePrivateRoom { name });
            }
            return;
        }
        if let Some((slug, name)) = self.chat.submit_create_room()
            && matches!(self.chat.source, chat::Source::Live(_))
            && let Some(ctl) = &self.ctl
        {
            ctl.act(LiveAction::CreateRoom { slug, name });
        }
    }

    pub fn toggle_block(&mut self, member_id: u32) {
        let block = self.chat.toggle_block_member(member_id);
        if matches!(self.chat.source, chat::Source::Live(_))
            && let Some(ctl) = &self.ctl
        {
            ctl.act(LiveAction::ToggleBlock { member_id, block });
        }
    }

    pub fn toggle_follow(&mut self, member_id: u32) {
        let follow = self.chat.toggle_follow_member(member_id);
        if matches!(self.chat.source, chat::Source::Live(_))
            && let Some(ctl) = &self.ctl
        {
            ctl.act(LiveAction::ToggleFollow { member_id, follow });
        }
    }

    pub fn join_room(&mut self) {
        if let Some(code) = self.chat.submit_join_room()
            && matches!(self.chat.source, chat::Source::Live(_))
            && let Some(ctl) = &self.ctl
        {
            ctl.act(LiveAction::JoinRoom { code });
        }
    }

    pub fn sign_in_with_viso(&mut self) {
        self.chat.start_viso_signin();
        if let Some(ctl) = &self.ctl {
            ctl.act(LiveAction::SignInWithViso);
        }
    }

    pub fn create_local_identity(&mut self) {
        self.chat.generate_local_identity();
        if let Some(ctl) = &self.ctl {
            ctl.act(LiveAction::CreateLocalIdentity);
        }
    }

    pub fn import_identity(&mut self) {
        if let Some(raw) = self.chat.submit_import_identity()
            && let Some(ctl) = &self.ctl
        {
            ctl.act(LiveAction::ImportIdentity { raw });
        }
    }

    pub fn save_display_name(&mut self) {
        if let Some(display_name) = self.chat.submit_display_name()
            && let Some(ctl) = &self.ctl
        {
            ctl.act(LiveAction::UpdateDisplayName { display_name });
        }
    }

    pub fn sign_out_identity(&mut self) {
        self.chat.sign_out_identity();
        if let Some(ctl) = &self.ctl {
            ctl.act(LiveAction::SignOutIdentity);
        }
    }
}

/// A named state for `--snap` and `--list-scenes`: a name and how it changes the initial state.
pub type Scene = (&'static str, fn(&mut RadicaApp));

/// One scene per screen.
pub const SCENES: &[Scene] = &[
    ("checking", |s| s.setup = Setup::Checking),
    ("not-installed", |s| s.setup = Setup::NotInstalled),
    ("finding-release", |s| {
        s.setup = Setup::Installing(InstallStep::FindingRelease)
    }),
    ("downloading", |s| {
        s.setup = Setup::Installing(InstallStep::Downloading {
            received: 9_400_000,
            total: Some(23_372_438),
        })
    }),
    ("verifying", |s| {
        s.setup = Setup::Installing(InstallStep::Verifying)
    }),
    ("installing", |s| {
        s.setup = Setup::Installing(InstallStep::Installing)
    }),
    ("waiting-for-installer", |s| {
        s.setup = Setup::Installing(InstallStep::WaitingForInstaller)
    }),
    ("starting", |s| s.setup = Setup::Starting),
    ("failed", |s| {
        s.setup = Setup::Failed("Couldn't install Freenet: the download was interrupted.".into())
    }),
    // Connected: the chat screen, on example data.
    ("chat", connect),
    ("chat-identity", |s| {
        connect(s);
        s.chat.identity_open = true;
    }),
    ("chat-ecosystem", |s| {
        connect(s);
        s.chat.ecosystem_open = true;
    }),
    ("chat-members-hidden", |s| {
        connect(s);
        s.chat.members_open = false;
    }),
    ("chat-private-room", |s| {
        connect(s);
        s.chat.select(chat::example::PRIVATE_ROOM);
    }),
    ("chat-composing", |s| {
        connect(s);
        s.chat
            .composer
            .replace_text("Sounds good, I'll bring the slides on Thursday");
        s.chat.composer.focused = true;
    }),
    ("chat-empty-room", |s| {
        connect(s);
        s.chat.select(chat::example::EMPTY_ROOM);
    }),
    ("chat-narrow", connect),
    ("chat-narrow-members", |s| {
        connect(s);
        s.chat.members_overlay = true;
    }),
];

fn connect(s: &mut RadicaApp) {
    s.setup = Setup::Connected {
        version: "0.2.155".into(),
    };
}

/// The window's opening size, in points: room for the room list, a conversation and the
/// members panel side by side.
pub const WINDOW_SIZE: (f32, f32) = (1280.0, 800.0);

/// The size the `*narrow*` scenes are rendered at.
pub const NARROW_SCENE_SIZE: (f32, f32) = (820.0, 720.0);

/// The window size a scene is meant to be rendered at.
pub fn scene_size(name: &str) -> (f32, f32) {
    if name.contains("narrow") {
        NARROW_SCENE_SIZE
    } else {
        WINDOW_SIZE
    }
}

pub fn spec() -> AppSpec<RadicaApp> {
    AppSpec {
        scenes: SCENES,
        min_size: Some((640.0, 480.0)),
        setup: Some(load_logo),
        ..AppSpec::new("Radica", WINDOW_SIZE, RadicaApp::detached, view)
    }
}

/// Build the live app: `init` receives the app's own handle so background work can report back.
pub fn app(make: impl FnOnce(AppHandle<RadicaApp>) -> RadicaApp + 'static) -> rune::App<RadicaApp> {
    let app = rune::App::new(spec());
    let handle = app.handle();
    app.init(move || make(handle))
}

pub fn view(s: &RadicaApp, cx: &mut Cx<RadicaApp>) -> El {
    let palette = chat::style::palette();
    let k = Kit::neutral(true);
    let logo = s.logo.as_ref().map(|l| l.image.pixels());
    let t = (&palette, logo);
    let body = match &s.setup {
        Setup::Checking => panel(
            t,
            "Looking for Freenet…",
            "Radica runs on Freenet, a peer-to-peer network on your own computer.",
            None,
            vec![],
        ),
        Setup::NotInstalled if s.can_install() => panel(
            t,
            "Freenet isn't installed",
            "Radica needs Freenet running on this computer. Radica can download it from the official release, check its signature, and set it up to run in the background.",
            None,
            vec![
                Button::new("Install Freenet")
                    .variant(ButtonVariant::Contrast)
                    .on_press(|s: &mut RadicaApp| s.install())
                    .build(&k)
                    .key("install"),
                manual_install_button(&k),
                Button::new("Check again")
                    .variant(ButtonVariant::Ghost)
                    .on_press(|s: &mut RadicaApp| s.retry())
                    .build(&k)
                    .key("retry"),
            ],
        ),
        Setup::NotInstalled => panel(
            t,
            "Freenet isn't installed",
            "Radica needs Freenet running on this computer. Install it, then try again.",
            None,
            vec![manual_install_button(&k), retry_button(&k)],
        ),
        Setup::Installing(step) => {
            let (title, fraction) = install_progress(step);
            let progress = fraction.map(|f| (f, download_detail(step)));
            panel(t, title, "This only happens once.", progress, vec![])
        }
        Setup::Starting => panel(
            t,
            "Starting Freenet…",
            "This can take a moment the first time.",
            None,
            vec![],
        ),
        Setup::Failed(message) => panel(
            t,
            "Something went wrong",
            message,
            None,
            vec![retry_button(&k), manual_install_button(&k)],
        ),
        Setup::Connected { .. } => return chat::view(&s.chat, logo, cx),
    };
    col()
        .key("root")
        .w_full()
        .h_full()
        .center()
        .padding(24.0)
        .fill(palette.rail)
        .child(body)
}

fn install_progress(step: &InstallStep) -> (&'static str, Option<f32>) {
    match step {
        InstallStep::FindingRelease => ("Finding the latest Freenet release…", None),
        InstallStep::Downloading { received, total } => (
            "Downloading Freenet…",
            total
                .filter(|t| *t > 0)
                .map(|t| (*received as f32 / t as f32).clamp(0.0, 1.0)),
        ),
        InstallStep::Verifying => ("Checking the download…", None),
        InstallStep::Installing => ("Installing Freenet…", None),
        InstallStep::WaitingForInstaller => {
            ("Finish setting up Freenet in its installer window", None)
        }
    }
}

/// "9.4 of 23.4 MB" under the download bar, when the download's size is known.
fn download_detail(step: &InstallStep) -> Option<String> {
    let InstallStep::Downloading {
        received,
        total: Some(total),
    } = step
    else {
        return None;
    };
    let mb = |b: u64| b as f64 / 1_000_000.0;
    Some(format!(
        "{:.1} of {:.1} MB",
        mb((*received).min(*total)),
        mb(*total)
    ))
}

/// The setup card's inner width.
const PANEL_W: f32 = 380.0;
/// The card's least height.
const PANEL_MIN_H: f32 = 276.0;

type Look<'a> = (&'a chat::style::Palette, Option<&'a rune::Pixels>);

/// A progress bar's fraction, and the text under it.
type Progress = Option<(f32, Option<String>)>;

fn panel(t: Look, title: &str, body: &str, progress: Progress, actions: Vec<El>) -> El {
    let (p, logo) = t;
    let mark = match logo {
        Some(px) => el().size(LOGO_PT, LOGO_PT).pixels(px),
        None => el().size(LOGO_PT, LOGO_PT),
    };
    let mut card = col()
        .key("panel")
        .w(PANEL_W + 64.0)
        .min_h(PANEL_MIN_H)
        .padding(32.0)
        .gap(12.0)
        .radius(16.0)
        .fill(p.bg)
        .border(1.0, p.line)
        .shadow(18.0, 48.0, p.shadow)
        .child(
            row()
                .key("wordmark")
                .gap(10.0)
                .mb(10.0)
                .center_y()
                .child(mark)
                .child(text("Radica").font(chat::style::BRAND).color(p.text)),
        )
        .child(
            text(title.to_owned())
                .key("title")
                .font(chat::style::TITLE)
                .color(p.text)
                .wrap()
                .w_full(),
        )
        .child(
            text(body.to_owned())
                .key("body")
                .font(chat::style::BODY.lh(21.0))
                .color(p.text_secondary)
                .wrap()
                .w_full(),
        );
    if let Some((fraction, detail)) = progress {
        card = card.child(progress_bar(p, fraction));
        if let Some(detail) = detail {
            card = card.child(
                text(detail)
                    .key("progress-detail")
                    .font(chat::style::SMALL)
                    .color(p.text_muted),
            );
        }
    }
    if !actions.is_empty() {
        let mut buttons = row().key("actions").gap(8.0).mt(10.0).flex_wrap();
        for action in actions {
            buttons = buttons.child(action);
        }
        card = card.child(buttons);
    }
    card
}

fn progress_bar(p: &chat::style::Palette, fraction: f32) -> El {
    el().key("track")
        .w_full()
        .h(4.0)
        .mt(6.0)
        .radius(2.0)
        .fill(p.surface_hover)
        .child(
            el().key("bar")
                .w(PANEL_W * fraction.clamp(0.0, 1.0))
                .h(4.0)
                .radius(2.0)
                .fill(p.accent)
                .motion(rune::Spring::new(0.3, 0.0)),
        )
}

fn manual_install_button(k: &Kit) -> El {
    Button::new("Install it myself")
        .variant(ButtonVariant::Ghost)
        .on_press_tx(|_: &mut RadicaApp, tx: &mut Tx| {
            let _ = tx.open_url(MANUAL_INSTALL_URL);
        })
        .build(k)
        .key("manual")
}

fn retry_button(k: &Kit) -> El {
    Button::new("Try again")
        .variant(ButtonVariant::Contrast)
        .on_press(|s: &mut RadicaApp| s.retry())
        .build(k)
        .key("retry")
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime};

    fn render(setup: Setup) -> Runtime<RadicaApp> {
        let mut state = RadicaApp::detached();
        state.setup = setup;
        let mut rt = Runtime::new(
            state,
            view,
            (560.0, 440.0),
            Env {
                system_dark: true,
                scale: 1.0,
            },
        );
        rt.frame(0.0);
        rt
    }

    #[test]
    fn each_stage_offers_the_right_actions() {
        let cases = [
            (Setup::Checking, &[][..]),
            (Setup::NotInstalled, &["install", "manual", "retry"][..]),
            (Setup::Installing(InstallStep::Verifying), &[][..]),
            (Setup::Starting, &[][..]),
            (Setup::Failed("x".into()), &["retry", "manual"][..]),
            (
                Setup::Connected {
                    version: "1".into(),
                },
                &[][..],
            ),
        ];
        for (setup, expected) in cases {
            let rt = render(setup.clone());
            for key in ["install", "manual", "retry"] {
                assert_eq!(
                    rt.find(key).is_some(),
                    expected.contains(&key),
                    "{setup:?}: button {key}"
                );
            }
        }
    }

    fn downloading(received: u64, total: Option<u64>) -> InstallStep {
        InstallStep::Downloading { received, total }
    }

    #[test]
    fn only_a_download_of_known_size_shows_a_bar() {
        assert!(
            render(Setup::Installing(downloading(50, Some(100))))
                .find("bar")
                .is_some()
        );
        for step in [
            downloading(50, None),
            downloading(50, Some(0)),
            InstallStep::FindingRelease,
            InstallStep::Verifying,
            InstallStep::Installing,
            InstallStep::WaitingForInstaller,
        ] {
            assert!(
                render(Setup::Installing(step.clone()))
                    .find("bar")
                    .is_none(),
                "{step:?}"
            );
        }
        assert_eq!(install_progress(&downloading(50, Some(100))).1, Some(0.5));
        assert_eq!(install_progress(&downloading(150, Some(100))).1, Some(1.0));
    }

    /// A host that only counts probes, for pressing buttons in a live window.
    struct CountingHost {
        installable: bool,
        probes: std::sync::atomic::AtomicUsize,
    }

    impl NodeHost for CountingHost {
        fn probe(&self) -> NodeProbe {
            self.probes
                .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            NodeProbe::NotInstalled
        }
        fn can_install(&self) -> bool {
            self.installable
        }
        fn install(&self, _: &mut dyn FnMut(InstallStep)) -> Result<(), String> {
            Ok(())
        }
        fn start(&self) -> Result<(), String> {
            Ok(())
        }
    }

    fn render_with_host(
        setup: Setup,
        installable: bool,
    ) -> (Runtime<RadicaApp>, std::sync::Arc<CountingHost>) {
        let host = std::sync::Arc::new(CountingHost {
            installable,
            probes: Default::default(),
        });
        let ctl = Controller::reporting_to(host.clone(), |_| {});
        let state = RadicaApp {
            setup,
            chat: Chat::example(),
            ctl: Some(ctl),
            logo: None,
        };
        let env = Env {
            system_dark: true,
            scale: 1.0,
        };
        let mut rt = Runtime::new(state, view, (560.0, 440.0), env);
        rt.frame(0.0);
        (rt, host)
    }

    #[test]
    fn a_platform_that_cannot_install_offers_no_install_button() {
        let (rt, _) = render_with_host(Setup::NotInstalled, false);
        assert!(rt.find("install").is_none());
        assert!(rt.find("manual").is_some());
        assert!(rt.find("retry").is_some());
    }

    #[test]
    fn pressing_retry_checks_for_the_node_again() {
        let (mut rt, host) = render_with_host(Setup::Failed("x".into()), true);
        let (x, y) = rt.find("retry").expect("retry button");
        rt.pointer_down(x, y);
        rt.pointer_up(x, y);
        rt.frame(1.0 / 60.0);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while host.probes.load(std::sync::atomic::Ordering::SeqCst) == 0 {
            assert!(std::time::Instant::now() < deadline, "retry never probed");
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    }

    /// Fails to compile when a new screen is added, and fails when it has no scene.
    #[test]
    fn every_screen_has_a_scene() {
        fn screen(s: &Setup) -> &'static str {
            match s {
                Setup::Checking => "checking",
                Setup::NotInstalled => "not-installed",
                Setup::Installing(InstallStep::FindingRelease) => "finding-release",
                Setup::Installing(InstallStep::Downloading { .. }) => "downloading",
                Setup::Installing(InstallStep::Verifying) => "verifying",
                Setup::Installing(InstallStep::Installing) => "installing",
                Setup::Installing(InstallStep::WaitingForInstaller) => "waiting-for-installer",
                Setup::Starting => "starting",
                Setup::Failed(_) => "failed",
                Setup::Connected { .. } => "chat",
            }
        }
        let mut covered: Vec<&str> = SCENES
            .iter()
            .map(|(name, apply)| {
                let mut s = RadicaApp::detached();
                apply(&mut s);
                let shown = screen(&s.setup);
                assert!(
                    *name == shown || name.starts_with(&format!("{shown}-")),
                    "scene {name} shows the {shown} screen"
                );
                shown
            })
            .collect();
        covered.sort();
        covered.dedup();
        assert_eq!(covered.len(), 10, "{covered:?}");
    }

    #[test]
    fn the_logo_rasterizes() {
        let cache = rune::image::ImageCache::new(std::sync::Arc::new(|| {}));
        let image = cache.svg(LOGO_SVG, LOGO_PT, LOGO_SCALE);
        let [w, h] = image.wait().expect("the logo rasterizes");
        let px = (LOGO_PT * LOGO_SCALE) as u32;
        assert!(w > px / 2 && h > px / 2 && w <= px && h <= px, "{w}x{h}");
    }

    #[test]
    fn radica_web_url_points_to_local_freenet_contract() {
        // ponytail: replaces River's apps.yml workflow assertion with Radica web container check
        assert!(RADICA_WEB_URL.starts_with("http://127.0.0.1:7509/v1/contract/web/"));
        assert!(RADICA_WEB_URL.contains("Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw"));
    }

    #[test]
    fn a_download_of_known_size_says_how_far_it_is() {
        assert_eq!(
            download_detail(&downloading(9_400_000, Some(23_372_438))).as_deref(),
            Some("9.4 of 23.4 MB")
        );
        assert_eq!(download_detail(&downloading(9_400_000, None)), None);
        assert_eq!(
            download_detail(&downloading(150, Some(100))).as_deref(),
            Some("0.0 of 0.0 MB")
        );
        let rt = render(Setup::Installing(downloading(50, Some(100))));
        assert!(rt.find("progress-detail").is_some());
    }
}
