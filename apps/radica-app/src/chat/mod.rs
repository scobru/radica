//! The chat screen: rooms on the left, the open room's conversation in the middle, its members
//! on the right.
//!
//! Nothing here talks to a node yet. The rooms come from a [`Source`], and today the only source
//! is [`Source::Example`], the built-in example data. Selecting a room, sending a message and
//! showing or hiding the members panel all work, in memory.

pub mod avatar;
mod conversation;
pub mod example;
mod icons;
pub mod media;
pub mod model;
pub(crate) mod style;
#[cfg(test)]
mod tests;
mod view;

use std::collections::HashMap;

use rune::TextEdit;

pub use model::{Member, Message, Reaction, ReplyTo, Role, Room};
pub use view::{NARROW_WIDTH, view};

/// Where the chat screen's rooms come from.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Source {
    /// Built-in example rooms. Nothing is read from or sent to Freenet.
    Example,
    /// Real rooms and messages loaded from the local Freenet node.
    Live(String),
}

/// Filter tabs in the Radica Messenger inbox sidebar.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RoomFilter {
    All,
    Unread,
    Dms,
    Groups,
    Communities,
    Saved,
}

pub struct Chat {
    pub source: Source,
    pub filter: RoomFilter,
    /// Search input in the Messenger inbox sidebar (`rm-inbox-search`).
    pub search: TextEdit,
    /// Search input inside the open conversation (`rm-thread-search`).
    pub thread_search: TextEdit,
    pub thread_search_open: bool,
    /// Active reply target (`rm-reply-banner`).
    pub replying_to: Option<ReplyTo>,
    /// Message ID currently being edited (`rm-edit-banner`).
    pub editing_id: Option<u32>,
    /// Whether the quick emoji & Freenet actions tray above the composer is open.
    pub emoji_open: bool,
    /// Inline `+` create room/community bar in the inbox header.
    pub creating_room: bool,
    /// Whether the inline create bar is in E2EE Private Group Room mode (`🔒 Private`).
    pub creating_private_room: bool,
    pub create_input: TextEdit,
    /// Inline `Join with invite code` bar in the inbox footer.
    pub joining_room: bool,
    pub join_input: TextEdit,
    /// Bookmarked/saved messages `(room_key, msg_id)` across all rooms.
    pub saved_messages: std::collections::BTreeSet<(String, u32)>,
    /// Followed member IDs (`radica/following/v2`).
    pub followed_members: std::collections::BTreeSet<u32>,
    /// Whether the Freenet Companion Ecosystem & Apps modal is open.
    pub ecosystem_open: bool,
    /// Active user identity (Viso Persona or Local Ed25519 Keypair) and modal state.
    pub identity: crate::node::IdentityInfo,
    pub identity_open: bool,
    pub show_secret_key: bool,
    pub identity_name_input: TextEdit,
    pub identity_import_input: TextEdit,
    pub identity_status: Option<String>,
    /// The rooms, in the room list's order. Private so every change goes through
    /// [`Chat::set_rooms`], which keeps a room open whenever there is one.
    rooms: Vec<Room>,
    /// The key of the open room. Rooms are looked up by key, so adding or removing other rooms
    /// never opens a different one.
    selected: String,
    /// The room that was open when the list last went empty, to reopen when it comes back.
    last_open: String,
    /// What is typed in the open room's composer.
    pub composer: TextEdit,
    /// Unsent text in the other rooms' composers, by room key, so switching rooms never carries
    /// text from one room to another.
    drafts: HashMap<String, TextEdit>,
    /// Cache for avatar rasterization.
    pub avatar_cache: Option<rune::image::ImageCache>,
    /// Decoded/rasterized avatar images keyed by member ID.
    pub avatar_images: HashMap<u32, rune::image::Image>,
    /// Where the node keeps opened attachments, by hash (from the live snapshot).
    pub media_dir: Option<std::path::PathBuf>,
    /// Decoded image attachments, by hash.
    pub media_images: HashMap<String, rune::image::Image>,
    /// Whether a wide window shows the members panel beside the conversation.
    pub members_open: bool,
    /// Whether a narrow window shows the members panel over the conversation. Separate from
    /// `members_open`, so a narrow window opens on the conversation however the wide one was left.
    pub members_overlay: bool,
    /// Today's day number in message time (whose day 0 is `day_zero`).
    pub today: u32,
    /// The date of message time's day 0, in days since 1970-01-01, for the day headings.
    pub day_zero: i64,
    /// The time a message sent now is stamped with, in message time's minutes.
    // TODO: a fixed time for example data; it goes once the app reads real rooms and stamps
    // messages with the clock.
    pub now: u32,
}

impl Chat {
    /// A chat screen showing `rooms`, with the first one open.
    pub fn new(source: Source, rooms: Vec<Room>, today: u32, day_zero: i64, now: u32) -> Self {
        let mut chat = Chat {
            source,
            filter: RoomFilter::All,
            search: TextEdit::new(""),
            thread_search: TextEdit::new(""),
            thread_search_open: false,
            replying_to: None,
            editing_id: None,
            emoji_open: false,
            creating_room: false,
            creating_private_room: false,
            create_input: TextEdit::new(""),
            joining_room: false,
            join_input: TextEdit::new(""),
            saved_messages: std::collections::BTreeSet::new(),
            followed_members: std::collections::BTreeSet::new(),
            ecosystem_open: false,
            identity: crate::node::IdentityInfo {
                pubkey: "464b576da4cc5bcf31febd41a863ac251d04024c19f1786b24ca6620a0cce53b".into(),
                persona_b58: "Persona @5nK8xQ".into(),
                display_name: "You (Desktop)".into(),
                is_viso: false,
                secret_key_hex: Some(
                    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".into(),
                ),
            },
            identity_open: false,
            show_secret_key: false,
            identity_name_input: TextEdit::new("You (Desktop)"),
            identity_import_input: TextEdit::new(""),
            identity_status: None,
            rooms: Vec::new(),
            selected: String::new(),
            last_open: String::new(),
            composer: TextEdit::new(""),
            drafts: HashMap::new(),
            avatar_cache: None,
            avatar_images: HashMap::new(),
            media_dir: None,
            media_images: HashMap::new(),
            members_open: true,
            members_overlay: false,
            today,
            day_zero,
            now,
        };
        chat.set_rooms(rooms);
        chat
    }

    pub fn example() -> Self {
        let data = example::data();
        Chat::new(
            Source::Example,
            data.rooms,
            data.today,
            data.day_zero,
            data.now,
        )
    }

    /// Replace the rooms and calendar with a live snapshot from the local Freenet node,
    /// preserving any open DM/private/custom rooms and optimistic messages not yet synced.
    pub fn apply_live(&mut self, snap: crate::node::LiveSnapshot) {
        let was_live = matches!(self.source, Source::Live(_));
        self.source = Source::Live(snap.status);
        self.today = snap.today;
        self.day_zero = snap.day_zero;
        self.now = snap.now;
        self.media_dir = snap.media_dir;
        if let Some(id) = snap.identity {
            if self.identity_name_input.text.is_empty()
                || self.identity_name_input.text == self.identity.display_name
            {
                self.identity_name_input.replace_text(&id.display_name);
            }
            self.identity = id;
        }
        let mut merged = snap.rooms;
        if was_live {
            for new_r in &mut merged {
                if let Some(old_r) = self.rooms.iter().find(|r| r.key == new_r.key) {
                    for old_m in &old_r.messages {
                        if (old_m.author == old_r.me || old_m.author == new_r.me)
                            && !new_r.messages.iter().any(|nm| {
                                (nm.author == new_r.me || nm.author == old_m.author)
                                    && nm.text == old_m.text
                                    && (nm.time as i64 - old_m.time as i64).abs() <= 5
                            })
                        {
                            let next_id = new_r
                                .messages
                                .iter()
                                .map(|m| m.id)
                                .max()
                                .unwrap_or(0)
                                .saturating_add(1);
                            let mut kept = old_m.clone();
                            kept.id = next_id;
                            kept.author = new_r.me;
                            new_r.messages.push(kept);
                        }
                    }
                }
            }
            for old_r in &self.rooms {
                if !merged.iter().any(|r| r.key == old_r.key) {
                    merged.push(old_r.clone());
                }
            }
        }
        self.set_rooms(merged);
        self.refresh_media_images();
    }

    pub fn rooms(&self) -> &[Room] {
        &self.rooms
    }

    /// Replace the rooms. The open room stays open if it is still there. Otherwise the room
    /// that was open before the list last went empty opens, if it is back, and else the first
    /// room; either way through [`Chat::select`], so it is marked read and its draft comes back.
    ///
    /// Drafts are never dropped here. A list can refill in steps (empty, then some rooms, then
    /// all of them), and a room missing from one step may be in the next; a draft costs a few
    /// bytes, and losing typed text costs the user.
    pub fn set_rooms(&mut self, rooms: Vec<Room>) {
        self.rooms = rooms;
        if self.rooms.is_empty() {
            // An empty list is often a reload on its way to the full one: keep the open room's
            // text as its draft, remember which room it was, and open nothing.
            let mut open = std::mem::replace(&mut self.composer, TextEdit::new(""));
            open.focused = false;
            let key = std::mem::take(&mut self.selected);
            if !key.is_empty() {
                if !open.text.is_empty() {
                    self.drafts.insert(key.clone(), open);
                }
                self.last_open = key;
            }
            return;
        }
        if self.room().is_none() {
            let back = self.rooms.iter().any(|r| r.key == self.last_open);
            let key = if back {
                self.last_open.clone()
            } else {
                self.rooms[0].key.clone()
            };
            self.select(&key);
        }
        self.refresh_avatar_images();
    }

    /// Decode the image attachments the node has opened since the last look (it keeps them by hash in `media_dir`).
    pub fn refresh_media_images(&mut self) {
        let (Some(cache), Some(dir)) = (&self.avatar_cache, &self.media_dir) else {
            return;
        };
        for room in &self.rooms {
            for m in &room.messages {
                for item in media::parse(&m.text).0 {
                    if item.kind != media::MediaKind::Img
                        || self.media_images.contains_key(&item.hash)
                    {
                        continue;
                    }
                    if let Ok(bytes) = std::fs::read(dir.join(&item.hash)) {
                        self.media_images.insert(item.hash, cache.load(bytes));
                    }
                }
            }
        }
    }

    /// The opened attachment's file on this device, if the node has it yet.
    pub fn media_path(&self, hash: &str) -> Option<std::path::PathBuf> {
        let p = self.media_dir.as_ref()?.join(hash);
        p.exists().then_some(p)
    }

    /// Initialize the avatar rasterization cache with the window waker.
    pub fn init_avatar_cache(&mut self, waker: rune::Waker) {
        self.avatar_cache = Some(rune::image::ImageCache::new(waker));
        self.refresh_avatar_images();
        self.refresh_media_images();
    }

    /// Get ready-to-draw avatar pixels for member `member_id`, if rasterized.
    pub fn avatar_pixels(&self, member_id: u32) -> Option<&rune::Pixels> {
        self.avatar_images.get(&member_id).map(|img| img.pixels())
    }

    /// Ensure all members in known rooms have their avatar loaded or deterministically generated.
    pub fn refresh_avatar_images(&mut self) {
        let Some(cache) = &self.avatar_cache else {
            return;
        };
        for room in &self.rooms {
            for m in &room.members {
                if self.avatar_images.contains_key(&m.id) {
                    continue;
                }
                let img = if let Some(uri) = &m.avatar_url
                    && let Some((bytes, is_svg)) = avatar::decode_avatar_uri(uri)
                {
                    if is_svg {
                        cache.svg(bytes, 64.0, 2.0)
                    } else {
                        cache.load(bytes)
                    }
                } else {
                    let seed = m.pubkey.as_deref().unwrap_or(&m.nickname);
                    let svg = avatar::generate_default_avatar_svg(seed);
                    cache.svg(svg.into_bytes(), 64.0, 2.0)
                };
                self.avatar_images.insert(m.id, img);
            }
        }
    }

    /// Remove or hide `room_key` from the inbox sidebar.
    pub fn remove_room(&mut self, room_key: &str) -> bool {
        let before = self.rooms.len();
        self.rooms.retain(|r| r.key != room_key);
        if self.selected == room_key {
            let next_key = self
                .rooms
                .first()
                .map(|r| r.key.clone())
                .unwrap_or_default();
            self.select(&next_key);
        }
        self.rooms.len() < before
    }

    /// Change the rooms in place, then settle the open room as [`Chat::set_rooms`] does.
    pub fn edit_rooms(&mut self, f: impl FnOnce(&mut Vec<Room>)) {
        let mut rooms = std::mem::take(&mut self.rooms);
        f(&mut rooms);
        self.set_rooms(rooms);
    }

    /// The open room. `None` only when there are no rooms.
    pub fn room(&self) -> Option<&Room> {
        self.rooms.iter().find(|r| r.key == self.selected)
    }

    fn room_mut(&mut self) -> Option<&mut Room> {
        self.rooms.iter_mut().find(|r| r.key == self.selected)
    }

    /// Open the room keyed `key`, marking it read. The composer's text stays with the room it
    /// was typed in. Unknown keys are ignored.
    pub fn select(&mut self, key: &str) {
        let Some(room) = self.rooms.iter_mut().find(|r| r.key == key) else {
            return;
        };
        room.unread = 0;
        if key == self.selected {
            return;
        }
        self.replying_to = None;
        self.editing_id = None;
        self.thread_search_open = false;
        self.thread_search.clear();
        if self.selected.is_empty() {
            // Nothing was open, so what the composer holds belongs to no room yet: keep it,
            // unless it is empty and this room has a draft.
            if self.composer.text.is_empty()
                && let Some(draft) = self.drafts.remove(key)
            {
                self.composer = draft;
            }
            self.selected = key.to_owned();
            return;
        }
        let incoming = self.drafts.remove(key).unwrap_or_else(|| TextEdit::new(""));
        let mut outgoing = std::mem::replace(&mut self.composer, incoming);
        outgoing.focused = false;
        if !outgoing.text.is_empty() {
            self.drafts.insert(self.selected.clone(), outgoing);
        }
        self.selected = key.to_owned();
    }
    /// Send what the composer holds to the open room (or commit an active edit). Blank text
    /// sends nothing; otherwise the composer clears (keeping focus, so the next message can be
    /// typed straight away).
    pub fn send(&mut self) -> bool {
        let text = self.composer.text.trim().to_owned();
        if text.is_empty() {
            return false;
        }
        let now = self.now;
        let editing = self.editing_id.take();
        let reply = self.replying_to.take();
        let Some(room) = self.room_mut() else {
            return false;
        };
        if let Some(edit_id) = editing {
            room.edit_message(edit_id, &text);
        } else {
            room.send_with_reply(&text, now, reply);
        }
        self.composer.clear();
        self.emoji_open = false;
        true
    }

    /// Begin replying to `msg_id` in the open room.
    pub fn start_reply(&mut self, msg_id: u32) {
        let Some(room) = self.room() else {
            return;
        };
        let Some(m) = room.messages.iter().find(|m| m.id == msg_id) else {
            return;
        };
        let reply = ReplyTo {
            message: m.id,
            author: m.author,
            preview: model::preview(&m.text, 64),
        };
        self.editing_id = None;
        self.replying_to = Some(reply);
        self.composer.focused = true;
    }

    pub fn cancel_reply(&mut self) {
        self.replying_to = None;
    }

    /// Begin editing `msg_id` in the open room.
    pub fn start_edit(&mut self, msg_id: u32) {
        let Some(room) = self.room() else {
            return;
        };
        let me = room.me;
        let Some(m) = room
            .messages
            .iter()
            .find(|m| m.id == msg_id && m.author == me)
        else {
            return;
        };
        let text = m.text.clone();
        self.replying_to = None;
        self.editing_id = Some(msg_id);
        self.composer.replace_text(&text);
        self.composer.focused = true;
    }

    pub fn cancel_edit(&mut self) {
        self.editing_id = None;
        self.composer.clear();
    }

    /// Toggle reaction `emoji` on `msg_id` in the open room.
    pub fn toggle_react(
        &mut self,
        msg_id: u32,
        emoji: &str,
    ) -> Option<(String, u32, String, bool)> {
        let key = self.selected.clone();
        let room = self.room_mut()?;
        let on = room.toggle_reaction(msg_id, emoji)?;
        Some((key, msg_id, emoji.to_owned(), on))
    }

    /// Delete `msg_id` from the open room.
    pub fn delete_msg(&mut self, msg_id: u32) -> Option<(String, u32)> {
        let key = self.selected.clone();
        if self.editing_id == Some(msg_id) {
            self.editing_id = None;
        }
        let room = self.room_mut()?;
        if room.delete_message(msg_id) {
            Some((key, msg_id))
        } else {
            None
        }
    }

    /// Toggle bookmark on `msg_id` in the open room. Returns `true` if now bookmarked.
    pub fn toggle_bookmark(&mut self, msg_id: u32) -> bool {
        let key = self.selected.clone();
        if key.is_empty() {
            return false;
        }
        let pair = (key, msg_id);
        if self.saved_messages.remove(&pair) {
            false
        } else {
            self.saved_messages.insert(pair);
            true
        }
    }

    pub fn is_bookmarked(&self, room_key: &str, msg_id: u32) -> bool {
        self.saved_messages.contains(&(room_key.to_owned(), msg_id))
    }

    pub fn room_has_bookmarks(&self, room_key: &str) -> bool {
        self.saved_messages.iter().any(|(rk, _)| rk == room_key)
    }

    /// Toggle following `member_id` (`radica/following/v2`). Returns `true` if now followed.
    pub fn toggle_follow_member(&mut self, member_id: u32) -> bool {
        if self.followed_members.remove(&member_id) {
            false
        } else {
            self.followed_members.insert(member_id);
            true
        }
    }

    pub fn is_following(&self, member_id: u32) -> bool {
        self.followed_members.contains(&member_id)
    }

    /// Insert a ready-to-send interactive poll template into the composer.
    pub fn insert_poll_template(&mut self) {
        let tpl = "📊 Poll: What should we build next on Freenet? | 1️⃣ Voice notes | 2️⃣ Shared media albums | 3️⃣ Custom themes";
        self.composer.replace_text(tpl);
        self.composer.focused = true;
        self.emoji_open = false;
    }

    /// Create an E2EE Private Group Room (`priv:<slug>`) from `create_input`.
    pub fn submit_create_private_room(&mut self) -> Option<String> {
        let raw = self.create_input.text.trim().to_owned();
        if raw.is_empty() {
            return None;
        }
        let clean = raw
            .trim_start_matches("🔒")
            .trim_start_matches('#')
            .trim_start_matches("priv:")
            .trim();
        let slug: String = clean
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() {
                    c.to_ascii_lowercase()
                } else {
                    '-'
                }
            })
            .collect::<String>()
            .trim_matches('-')
            .chars()
            .take(32)
            .collect();
        if slug.is_empty() {
            return None;
        }
        let key = format!("priv:{slug}");
        let name = format!("🔒 {clean}");
        let me = self.room().map_or(1, |r| r.me);
        let me_nick = self.room().map_or("You", |r| r.nickname(r.me)).to_owned();
        if !self.rooms.iter().any(|r| r.key == key) {
            self.rooms.push(Room {
                key: key.clone(),
                name: name.clone(),
                description: format!(
                    "E2EE Private Group Room · AES-256-GCM · Invite: #join_room={slug}&key=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef&name={slug}"
                ),
                private: true,
                members: vec![Member::new(me, me_nick, Role::Owner)],
                messages: Vec::new(),
                me,
                unread: 0,
            });
        }
        self.create_input.clear();
        self.creating_room = false;
        self.creating_private_room = false;
        self.filter = RoomFilter::All;
        self.select(&key);
        Some(clean.to_owned())
    }

    /// Create a new community or group room from `create_input`.
    pub fn submit_create_room(&mut self) -> Option<(String, String)> {
        let raw = self.create_input.text.trim().to_owned();
        if raw.is_empty() {
            return None;
        }
        let clean = raw
            .trim_start_matches('#')
            .trim_start_matches("r/")
            .trim_start_matches("c_")
            .trim();
        let slug: String = clean
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() {
                    c.to_ascii_lowercase()
                } else {
                    '_'
                }
            })
            .collect::<String>()
            .trim_matches('_')
            .chars()
            .take(32)
            .collect();
        if slug.is_empty() {
            return None;
        }
        let key = format!("c_{slug}");
        let name = clean.to_owned();
        let me = self.room().map_or(1, |r| r.me);
        let me_nick = self.room().map_or("You", |r| r.nickname(r.me)).to_owned();
        if !self.rooms.iter().any(|r| r.key == key) {
            self.rooms.push(Room {
                key: key.clone(),
                name: name.clone(),
                description: format!("Public Freenet community #r/{slug}"),
                private: false,
                members: vec![Member::new(me, me_nick, Role::Owner)],
                messages: Vec::new(),
                me,
                unread: 0,
            });
        }
        self.create_input.clear();
        self.creating_room = false;
        self.filter = RoomFilter::All;
        self.select(&key);
        Some((slug, name))
    }

    /// Join a community or private room by slug/invite code from `join_input`.
    pub fn submit_join_room(&mut self) -> Option<String> {
        let raw = self.join_input.text.trim().to_owned();
        if raw.is_empty() {
            return None;
        }
        let clean = raw.trim_start_matches('#').trim_start_matches("r/").trim();
        let is_priv = clean.starts_with("priv:") || clean.starts_with("inv_") || clean.len() > 28;
        let slug: String = clean
            .trim_start_matches("c_")
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
            .take(40)
            .collect();
        if slug.is_empty() {
            return None;
        }
        let key = if is_priv {
            format!("priv:{slug}")
        } else {
            format!("c_{}", slug.to_ascii_lowercase())
        };
        let name = if is_priv {
            format!("Room {}", &slug[..slug.len().min(8)])
        } else {
            slug.clone()
        };
        let me = self.room().map_or(1, |r| r.me);
        let me_nick = self.room().map_or("You", |r| r.nickname(r.me)).to_owned();
        if !self.rooms.iter().any(|r| r.key == key) {
            self.rooms.push(Room {
                key: key.clone(),
                name,
                description: if is_priv {
                    "End-to-end encrypted room joined by invite code.".into()
                } else {
                    format!("Joined Freenet community #r/{}", slug.to_ascii_lowercase())
                },
                private: is_priv,
                members: vec![Member::new(me, me_nick, Role::Member)],
                messages: Vec::new(),
                me,
                unread: 0,
            });
        }
        self.join_input.clear();
        self.joining_room = false;
        self.filter = RoomFilter::All;
        self.select(&key);
        // a private room needs the whole invite (its code or keys), not the shortened key shown here
        Some(if is_priv { raw } else { key })
    }

    /// Open or create a 1-on-1 E2EE Direct Message conversation with `member_id`.
    pub fn open_dm(&mut self, member_id: u32, nickname: &str) {
        let me = self.room().map_or(1, |r| r.me);
        if member_id == me {
            return;
        }
        let me_nick = self.room().map_or("You", |r| r.nickname(r.me)).to_owned();
        let key = format!("dm:{member_id}");
        if !self.rooms.iter().any(|r| r.key == key) {
            self.rooms.push(Room {
                key: key.clone(),
                name: nickname.to_owned(),
                description: format!("Direct E2EE session with {nickname} · X25519 + AES-256-GCM"),
                private: true,
                members: vec![
                    Member::new(me, me_nick, Role::Member),
                    Member::new(member_id, nickname.to_owned(), Role::Member),
                ],
                messages: Vec::new(),
                me,
                unread: 0,
            });
        }
        if self.filter != RoomFilter::All && self.filter != RoomFilter::Dms {
            self.filter = RoomFilter::All;
        }
        self.select(&key);
    }

    /// Populate the composer with an invite link for the active room.
    pub fn invite_to_current_room(&mut self) {
        let Some(room) = self.room() else {
            return;
        };
        let link = if room.key.starts_with("priv:")
            && let Some((_, inv)) = room.description.split_once("Invite: ")
        {
            format!(
                "Join E2EE Private Room {} on Radica Freenet: {}{}",
                room.name,
                crate::RADICA_WEB_URL,
                inv
            )
        } else {
            format!(
                "Join {} on Radica Freenet: {}#room={}",
                room.name,
                crate::RADICA_WEB_URL,
                room.key
            )
        };
        self.composer.replace_text(&link);
        self.composer.focused = true;
    }

    pub fn start_viso_signin(&mut self) {
        self.identity_status = Some(
            "Opening Viso in your browser… Approve the persona connection to complete sign-in."
                .into(),
        );
    }

    pub fn generate_local_identity(&mut self) {
        self.identity.is_viso = false;
        self.identity.display_name = "Persona @new".into();
        self.identity_name_input.replace_text("Persona @new");
        self.show_secret_key = false;
        self.identity_status = Some("✓ Generated new Ed25519 local keypair.".into());
    }

    pub fn submit_import_identity(&mut self) -> Option<String> {
        let raw = self.identity_import_input.text.trim().to_owned();
        if raw.is_empty() {
            self.identity_status = Some(
                "Paste a 64-hex private key, a Viso callback URL, or a session JSON first.".into(),
            );
            return None;
        }
        let hex_candidate: String = raw
            .lines()
            .map(str::trim)
            .find(|l| l.len() == 64 && l.chars().all(|c| c.is_ascii_hexdigit()))
            .unwrap_or(&raw)
            .trim()
            .to_ascii_lowercase();
        let is_viso_input =
            raw.contains("viso=ok") || raw.contains("pk=") || raw.contains("\"persona\"");
        if hex_candidate.len() == 64 && hex_candidate.chars().all(|c| c.is_ascii_hexdigit()) {
            self.identity.is_viso = false;
            self.identity.secret_key_hex = Some(hex_candidate.clone());
            self.identity.pubkey = hex_candidate.clone();
            self.identity_import_input.clear();
            self.identity_status = Some("✓ Imported local Ed25519 secret key.".into());
            Some(hex_candidate)
        } else if is_viso_input {
            self.identity.is_viso = true;
            self.identity.secret_key_hex = None;
            self.identity_import_input.clear();
            self.identity_status = Some("Importing Viso Persona session…".into());
            Some(raw)
        } else {
            self.identity_status = Some(
                "Invalid format: enter a 64-character hex secret key, Viso callback URL, or session JSON.".into(),
            );
            None
        }
    }

    pub fn submit_display_name(&mut self) -> Option<String> {
        let name: String = self
            .identity_name_input
            .text
            .trim()
            .chars()
            .take(40)
            .collect();
        if name.is_empty() {
            return None;
        }
        self.identity.display_name = name.clone();
        for r in &mut self.rooms {
            let me = r.me;
            if let Some(m) = r.members.iter_mut().find(|m| m.id == me) {
                m.nickname = name.clone();
            }
        }
        self.identity_status = Some(format!(
            "✓ Display name \"{name}\" saved & published to Freenet."
        ));
        Some(name)
    }

    pub fn sign_out_identity(&mut self) {
        self.identity.is_viso = false;
        self.show_secret_key = false;
        self.identity_status = Some("Signed out — switched to a fresh local keypair.".into());
    }

    /// Show or hide the members panel, in the layout the window is in now.
    pub fn toggle_members(&mut self, narrow: bool) {
        let open = if narrow {
            &mut self.members_overlay
        } else {
            &mut self.members_open
        };
        *open = !*open;
    }

    /// Whether the members panel shows, in a window that is `narrow` or not.
    pub fn members_shown(&self, narrow: bool) -> bool {
        if narrow {
            self.members_overlay
        } else {
            self.members_open
        }
    }
}

#[cfg(test)]
mod state_tests {
    use super::*;

    fn counts(c: &Chat) -> Vec<usize> {
        c.rooms().iter().map(|r| r.messages.len()).collect()
    }

    #[test]
    fn selecting_marks_the_room_read() {
        let mut chat = Chat::example();
        let i = chat
            .rooms()
            .iter()
            .position(|r| r.unread > 0)
            .expect("the example has an unread room");
        let key = chat.rooms()[i].key.clone();
        chat.select(&key);
        assert_eq!(chat.room().unwrap().key, key);
        assert_eq!(chat.rooms()[i].unread, 0);
        chat.select("no-such-room");
        assert_eq!(chat.room().unwrap().key, key);
    }

    #[test]
    fn the_first_room_opens_read() {
        let mut data = example::data();
        data.rooms[0].unread = 3;
        let first = data.rooms[0].key.clone();
        let chat = Chat::new(Source::Example, data.rooms, 0, 0, 0);
        assert_eq!(chat.room().unwrap().key, first);
        assert_eq!(chat.room().unwrap().unread, 0);
    }

    #[test]
    fn the_open_room_is_kept_by_key_when_rooms_move() {
        let mut chat = Chat::example();
        chat.select(example::PRIVATE_ROOM);
        chat.edit_rooms(|rooms| rooms.reverse());
        assert_eq!(chat.room().unwrap().key, example::PRIVATE_ROOM);
    }

    #[test]
    fn removing_the_open_room_opens_the_first_one() {
        let mut chat = Chat::example();
        chat.select(example::PRIVATE_ROOM);
        chat.composer.replace_text("typed in the room that goes");
        chat.edit_rooms(|rooms| {
            rooms.retain(|r| r.key != example::PRIVATE_ROOM);
            rooms.rotate_left(1);
            rooms[0].unread = 2;
        });
        let first = chat.rooms()[0].key.clone();
        assert_eq!(chat.room().unwrap().key, first);
        assert_eq!(chat.room().unwrap().unread, 0);
        // The gone room's draft does not follow into the room that opened.
        assert_eq!(chat.composer.text, "");
        chat.composer.replace_text("hello");
        assert!(chat.send());
        assert_eq!(chat.room().unwrap().last_message().unwrap().text, "hello");
    }

    #[test]
    fn with_no_rooms_nothing_is_open_until_rooms_arrive() {
        let mut chat = Chat::new(Source::Example, Vec::new(), 0, 0, 0);
        assert!(chat.room().is_none());
        // Text in the composer, so only the missing room can stop the send.
        chat.composer.replace_text("into the void");
        assert!(!chat.send());
        chat.set_rooms(example::data().rooms);
        assert!(chat.room().is_some());
        assert!(chat.send());
    }

    #[test]
    fn a_reload_through_an_empty_list_keeps_drafts_and_marks_the_open_room_read() {
        let mut chat = Chat::example();
        let a = chat.room().unwrap().key.clone();
        let b = example::PRIVATE_ROOM;
        chat.composer.replace_text("draft in A");
        chat.select(b);
        chat.composer.replace_text("draft in B");
        chat.composer.focused = true;
        chat.set_rooms(Vec::new());
        assert!(chat.room().is_none());
        assert_eq!(chat.composer.text, "");
        let mut rooms = example::data().rooms;
        for r in &mut rooms {
            r.unread = r.from_others().min(1);
        }
        chat.set_rooms(rooms);
        // The room that was open reopens, read, with its draft, and does not take focus.
        assert_eq!(chat.room().unwrap().key, b);
        assert_eq!(chat.room().unwrap().unread, 0);
        assert_eq!(chat.composer.text, "draft in B");
        assert!(!chat.composer.focused);
        chat.select(&a);
        assert_eq!(chat.composer.text, "draft in A");
    }

    #[test]
    fn a_list_that_refills_in_steps_keeps_every_draft() {
        let mut chat = Chat::example();
        let all = example::data().rooms;
        let b = example::PRIVATE_ROOM;
        chat.select(b);
        chat.composer.replace_text("draft in B");
        chat.composer.focused = true;
        chat.set_rooms(Vec::new());
        // First only the other rooms come back, then B too.
        chat.set_rooms(all.iter().filter(|r| r.key != b).cloned().collect());
        assert_ne!(chat.room().unwrap().key, b);
        assert_eq!(chat.composer.text, "");
        chat.set_rooms(all);
        chat.select(b);
        assert_eq!(chat.composer.text, "draft in B");
        assert!(!chat.composer.focused);
    }

    #[test]
    fn each_room_keeps_its_own_draft() {
        let mut chat = Chat::example();
        let a = chat.room().unwrap().key.clone();
        let b = example::PRIVATE_ROOM;
        chat.composer.replace_text("for A");
        chat.select(b);
        assert_eq!(chat.composer.text, "");
        // B's own text goes to B, and A's draft goes nowhere.
        chat.composer.replace_text("for B");
        let before = counts(&chat);
        assert!(chat.send());
        let after = counts(&chat);
        let bi = chat.rooms().iter().position(|r| r.key == b).unwrap();
        for (i, (x, y)) in before.iter().zip(&after).enumerate() {
            assert_eq!(*y, x + usize::from(i == bi));
        }
        assert_eq!(chat.room().unwrap().last_message().unwrap().text, "for B");
        chat.select(&a);
        assert_eq!(chat.composer.text, "for A");
        assert!(!chat.composer.focused);
    }

    #[test]
    fn example_unread_counts_are_possible() {
        for room in Chat::example().rooms() {
            assert!(room.unread <= room.from_others(), "{}", room.key);
        }
    }

    #[test]
    fn blank_messages_are_not_sent() {
        let mut chat = Chat::example();
        let before = chat.room().unwrap().messages.len();
        chat.composer.replace_text("   \n ");
        assert!(!chat.send());
        assert_eq!(chat.room().unwrap().messages.len(), before);
    }
}
