//! What Radica needs from the platform it runs on, to reach a Freenet node.
//!
//! The desktop shell answers these by probing `127.0.0.1:7509`, installing Freenet from the
//! signed GitHub release, and syncing live Radica contracts (`communities`, `directory`,
//! `community-chat/*`, `feed:*`).

use crate::chat::Room;

/// The state of the local Freenet node, as the platform sees it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum NodeProbe {
    /// A node answered on its client API.
    Running { version: String },
    /// A node is running, but it is older than Radica supports. `running` is `None` when it is
    /// too old to report its version at all.
    Outdated {
        running: Option<String>,
        minimum: String,
    },
    /// Freenet is installed but no node answered.
    InstalledNotRunning,
    /// Freenet is not installed.
    NotInstalled,
}

/// One step of installing Freenet, reported as it happens.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum InstallStep {
    FindingRelease,
    Downloading {
        received: u64,
        total: Option<u64>,
    },
    Verifying,
    Installing,
    /// Waiting on an installer the platform opened (Windows' setup wizard).
    WaitingForInstaller,
}

/// Active user identity (Viso Persona or Local Ed25519 Keypair).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IdentityInfo {
    /// 64-char hex Ed25519 public key (Viso persona pubkey or local keypair pubkey).
    pub pubkey: String,
    /// Base58 short persona (`Persona @...`).
    pub persona_b58: String,
    /// Display name published to Radica directory (`Scobru`, `Persona @...`, etc.).
    pub display_name: String,
    /// `true` when authenticated via Viso (`whoiam-connect-v1` delegation cert), `false` for local keypair.
    pub is_viso: bool,
    /// 64-char hex secret key (only populated for local keypair so the user can view/backup it).
    pub secret_key_hex: Option<String>,
}

/// Live rooms and messages fetched from the local Freenet node.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LiveSnapshot {
    pub rooms: Vec<Room>,
    pub today: u32,
    pub day_zero: i64,
    pub now: u32,
    pub status: String,
    pub identity: Option<IdentityInfo>,
}

/// Interactive write actions dispatched from the Messenger UI to the local Freenet node.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LiveAction {
    SendMessage {
        room_key: String,
        text: String,
        reply_to: Option<u32>,
    },
    ReactMessage {
        room_key: String,
        msg_id: u32,
        emoji: String,
        on: bool,
    },
    EditMessage {
        room_key: String,
        msg_id: u32,
        new_text: String,
    },
    DeleteMessage {
        room_key: String,
        msg_id: u32,
    },
    RemoveRoom {
        room_key: String,
    },
    CreateRoom {
        slug: String,
        name: String,
    },
    CreatePrivateRoom {
        name: String,
    },
    JoinRoom {
        code: String,
    },
    ToggleFollow {
        member_id: u32,
        follow: bool,
    },
    SignInWithViso,
    CreateLocalIdentity,
    ImportIdentity {
        raw: String,
    },
    UpdateDisplayName {
        display_name: String,
    },
    SignOutIdentity,
}

pub trait NodeHost: Send + Sync + 'static {
    fn probe(&self) -> NodeProbe;

    /// Whether this platform can install Freenet itself.
    fn can_install(&self) -> bool;

    /// Download, verify and install Freenet, reporting progress. Runs on a worker thread.
    /// On return the node may or may not be running; the caller probes and calls [`start`].
    ///
    /// [`start`]: NodeHost::start
    fn install(&self, progress: &mut dyn FnMut(InstallStep)) -> Result<(), String>;

    /// Start an installed node that is not running. Runs on a worker thread.
    fn start(&self) -> Result<(), String>;

    /// Fetch real Radica rooms, community chats and feed posts from the local Freenet node.
    fn load_live(&self) -> Option<LiveSnapshot> {
        None
    }

    /// Sign and publish a chat message to a live Radica contract on the local Freenet node.
    fn send_live(&self, room_key: &str, text: &str) -> Result<(), String> {
        self.act_live(LiveAction::SendMessage {
            room_key: room_key.to_owned(),
            text: text.to_owned(),
            reply_to: None,
        })
    }

    /// Execute a signed Messenger action on the local Freenet node.
    fn act_live(&self, _action: LiveAction) -> Result<(), String> {
        Ok(())
    }
}

/// Where to send someone who wants to install Freenet by hand.
pub const MANUAL_INSTALL_URL: &str = "https://freenet.org/quickstart/";
