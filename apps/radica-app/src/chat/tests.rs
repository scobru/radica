//! The chat screen driven headlessly, as a person would: pressing rows and buttons, typing.

use rune::{Env, Key, KeyEvent, Runtime};

use super::example::{EMPTY_ROOM, PRIVATE_ROOM};
use crate::{NARROW_SCENE_SIZE, RadicaApp, SCENES, Setup, WINDOW_SIZE, scene_size, view};

fn connected() -> RadicaApp {
    let mut s = RadicaApp::detached();
    s.setup = Setup::Connected {
        version: "0.2.155".into(),
    };
    s
}

fn render(state: RadicaApp, size: (f32, f32)) -> Runtime<RadicaApp> {
    let env = Env {
        system_dark: true,
        scale: 1.0,
    };
    let mut rt = Runtime::new(state, view, size, env);
    rt.frame(0.0);
    rt.frame(1.0 / 60.0);
    rt
}

fn press(rt: &mut Runtime<RadicaApp>, key: &str) {
    let (x, y) = rt.find(key).unwrap_or_else(|| panic!("no element {key}"));
    rt.pointer_move(x, y);
    rt.frame(0.3);
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(0.1);
    rt.frame(0.2);
}

fn key(rt: &mut Runtime<RadicaApp>, key: Key) {
    rt.key(KeyEvent {
        key,
        mods: Default::default(),
    });
    rt.frame(0.3);
}

/// Every piece of text on screen, in tree order.
fn texts(rt: &Runtime<RadicaApp>) -> Vec<String> {
    rt.elements().into_iter().filter_map(|e| e.text).collect()
}

fn shows(rt: &Runtime<RadicaApp>, needle: &str) -> bool {
    texts(rt).iter().any(|t| t.contains(needle))
}

/// Whether the element keyed `key` shows at least partly inside its scroll viewport.
fn visible(rt: &Runtime<RadicaApp>, key: &str) -> bool {
    rt.elements()
        .into_iter()
        .find(|e| e.key.as_deref() == Some(key))
        .is_some_and(|e| e.visible[2] > 0.0 && e.visible[3] > 0.0)
}

#[test]
fn connecting_shows_the_chat_screen() {
    let rt = render(connected(), WINDOW_SIZE);
    for part in [
        "rooms",
        "room-header",
        "history",
        "composer",
        "members",
        "open-web",
    ] {
        assert!(rt.find(part).is_some(), "missing {part}");
    }
    assert!(shows(&rt, "Radica"));
    assert!(shows(&rt, "Town Square"));
    // Example rooms say so, and do not claim a connection.
    assert!(shows(&rt, "Example rooms, not connected to Freenet"));
    assert!(!shows(&rt, "Connected to Freenet"));
}

#[test]
fn selecting_a_room_opens_its_conversation() {
    let mut rt = render(connected(), WINDOW_SIZE);
    assert!(!shows(&rt, "pushed the new mockups"));
    press(&mut rt, &format!("room-{PRIVATE_ROOM}"));
    assert_eq!(rt.state.chat.room().unwrap().key, PRIVATE_ROOM);
    assert_eq!(rt.state.chat.room().unwrap().unread, 0);
    assert!(shows(&rt, "pushed the new mockups"));
    assert!(rt.find("private-badge").is_some());
    assert!(!shows(&rt, "Release notes are at"));
    // Two days back is written as a date, so the example's calendar reaches the view.
    assert!(shows(&rt, "Wednesday, November 4"));
}

#[test]
fn only_the_open_room_loses_its_unread_badge() {
    let mut rt = render(connected(), WINDOW_SIZE);
    let badge = |room: &str| format!("room-{room}/unread");
    assert!(rt.find(&badge(PRIVATE_ROOM)).is_some());
    assert!(rt.find(&badge("rust-help")).is_some());
    press(&mut rt, &format!("room-{PRIVATE_ROOM}"));
    assert!(rt.find(&badge(PRIVATE_ROOM)).is_none());
    assert!(rt.find(&badge("rust-help")).is_some());
}

#[test]
fn the_empty_room_invites_a_first_message() {
    let mut rt = render(connected(), WINDOW_SIZE);
    press(&mut rt, &format!("room-{EMPTY_ROOM}"));
    assert!(rt.find("history-empty").is_some());
    assert!(shows(&rt, "No messages yet"));
}

#[test]
fn typing_and_pressing_return_sends_and_clears_the_composer() {
    let mut rt = render(connected(), WINDOW_SIZE);
    let before = rt.state.chat.room().unwrap().messages.len();
    press(&mut rt, "composer-field");
    key(&mut rt, Key::Text("Hello from the desktop".into()));
    assert_eq!(rt.state.chat.composer.text, "Hello from the desktop");
    key(&mut rt, Key::Enter);
    let room = rt.state.chat.room().unwrap();
    assert_eq!(room.messages.len(), before + 1);
    let last = room.last_message().unwrap();
    assert_eq!(last.text, "Hello from the desktop");
    assert_eq!(last.author, room.me);
    assert_eq!(rt.state.chat.composer.text, "");
    assert!(shows(&rt, "Hello from the desktop"));
}

#[test]
fn a_draft_stays_in_the_room_it_was_typed_in() {
    let mut rt = render(connected(), WINDOW_SIZE);
    let texts_in = |rt: &Runtime<RadicaApp>, key: &str| {
        rt.state
            .chat
            .rooms()
            .iter()
            .find(|r| r.key == key)
            .unwrap()
            .messages
            .iter()
            .map(|m| m.text.clone())
            .collect::<Vec<_>>()
    };
    let town_before = texts_in(&rt, "town-square");
    press(&mut rt, "composer-field");
    key(&mut rt, Key::Text("for Town Square only".into()));
    press(&mut rt, &format!("room-{PRIVATE_ROOM}"));
    assert_eq!(rt.state.chat.composer.text, "");
    assert!(!shows(&rt, "for Town Square only"));
    // Type and send in the other room: only its own text goes, and only to it. A leaked
    // draft would arrive here as "for Town Square onlyfor Design Crew", or in Town Square.
    press(&mut rt, "composer-field");
    key(&mut rt, Key::Text("for Design Crew".into()));
    key(&mut rt, Key::Enter);
    assert_eq!(
        texts_in(&rt, PRIVATE_ROOM).last().map(String::as_str),
        Some("for Design Crew")
    );
    assert_eq!(texts_in(&rt, "town-square"), town_before);
    press(&mut rt, "room-town-square");
    assert_eq!(rt.state.chat.composer.text, "for Town Square only");
    assert!(shows(&rt, "for Town Square only"));
}

#[test]
fn the_send_button_sends_too() {
    let mut state = connected();
    state.chat.composer.replace_text("Pressed, not typed");
    let mut rt = render(state, WINDOW_SIZE);
    press(&mut rt, "send");
    assert_eq!(
        rt.state.chat.room().unwrap().last_message().unwrap().text,
        "Pressed, not typed"
    );
    assert!(rt.state.chat.composer.text.is_empty());
}

#[test]
fn create_room_join_invite_and_emoji_tray_work() {
    let mut rt = render(connected(), WINDOW_SIZE);
    // 1. Emoji & Freenet actions tray
    assert!(rt.find("emoji-tray").is_none());
    press(&mut rt, "emoji");
    assert!(rt.find("emoji-tray").is_some());
    press(&mut rt, "insert-invite-link");
    assert!(rt.state.chat.composer.text.contains("town-square"));
    rt.state.chat.composer.clear();

    // 2. Invite someone from Room Info drawer
    press(&mut rt, "invite");
    assert!(rt.state.chat.composer.text.contains("Join Town Square"));
    rt.state.chat.composer.clear();

    // 3. Create new community room (`+`)
    assert!(rt.find("create-room-bar").is_none());
    press(&mut rt, "create-room");
    assert!(rt.find("create-room-bar").is_some());
    rt.state.chat.create_input.replace_text("wormhole");
    press(&mut rt, "create-room-submit");
    assert_eq!(rt.state.chat.room().unwrap().key, "c_wormhole");

    // 4. Join with invite code
    assert!(rt.find("join-room-bar").is_none());
    press(&mut rt, "enter-invite");
    assert!(rt.find("join-room-bar").is_some());
    rt.state.chat.join_input.replace_text("freetree");
    press(&mut rt, "join-room-submit");
    assert_eq!(rt.state.chat.room().unwrap().key, "c_freetree");

    // 5. Open Identity & Viso Login modal, import 64-hex key, and trigger Viso sign-in
    assert!(rt.find("identity-modal").is_none());
    press(&mut rt, "identity-btn");
    assert!(rt.find("identity-modal").is_some());
    press(&mut rt, "identity-toggle-secret");
    assert!(rt.find("identity-secret-box").is_some());
    rt.state
        .chat
        .identity_import_input
        .replace_text("abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789");
    press(&mut rt, "identity-import-submit");
    assert!(!rt.state.chat.identity.is_viso);
    assert_eq!(
        rt.state.chat.identity.secret_key_hex.as_deref(),
        Some("abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789")
    );
    press(&mut rt, "viso-signin-btn");
    assert!(
        rt.state
            .chat
            .identity_status
            .as_deref()
            .unwrap_or("")
            .contains("Viso")
    );
    press(&mut rt, "identity-close");
    assert!(rt.find("identity-modal").is_none());

    // 6. Refreshing live snapshot preserves open DM rooms and optimistic messages
    rt.state.chat.source = super::Source::Live("7 rooms".into());
    rt.state.chat.open_dm(2, "Ivvor");
    rt.state.chat.composer.replace_text("test dm message");
    rt.state.chat.send();
    assert_eq!(rt.state.chat.room().unwrap().key, "dm:2");
    rt.state.chat.apply_live(crate::node::LiveSnapshot {
        rooms: vec![super::example::data().rooms[0].clone()],
        today: 1,
        day_zero: 20_000,
        now: 600,
        status: "7 rooms".into(),
        identity: None,
    });
    assert_eq!(rt.state.chat.room().unwrap().key, "dm:2");
    assert_eq!(
        rt.state.chat.room().unwrap().last_message().unwrap().text,
        "test dm message"
    );
}

#[test]
fn reply_edit_react_and_delete_work_in_the_conversation() {
    let mut rt = render(connected(), WINDOW_SIZE);
    let last_id = rt.state.chat.room().unwrap().last_message().unwrap().id;
    // Toggle quick reaction on the visible newest message
    press(&mut rt, &format!("react-🌱-{last_id}"));
    let last_msg = rt.state.chat.room().unwrap().last_message().unwrap();
    let me = rt.state.chat.room().unwrap().me;
    assert!(last_msg.reactions.iter().any(|r| r.emoji == "🌱" && r.by.contains(&me)));

    // Reply to the newest message
    press(&mut rt, &format!("reply-btn-{last_id}"));
    assert!(rt.find("reply-banner").is_some());
    rt.state.chat.composer.replace_text("Replying to release notes");
    press(&mut rt, "send");
    assert!(rt.find("reply-banner").is_none());
    let sent = rt.state.chat.room().unwrap().last_message().unwrap().clone();
    assert_eq!(sent.text, "Replying to release notes");
    assert_eq!(sent.reply_to.as_ref().map(|r| r.message), Some(last_id));

    // Edit our sent message
    press(&mut rt, &format!("edit-btn-{}", sent.id));
    assert!(rt.find("edit-banner").is_some());
    rt.state.chat.composer.replace_text("Edited release reply");
    press(&mut rt, "send");
    assert!(rt.find("edit-banner").is_none());
    let updated = rt.state.chat.room().unwrap().last_message().unwrap();
    assert_eq!(updated.text, "Edited release reply");
    assert!(updated.edited);

    // Delete our sent message
    let count_before = rt.state.chat.room().unwrap().messages.len();
    press(&mut rt, &format!("del-btn-{}", sent.id));
    assert_eq!(rt.state.chat.room().unwrap().messages.len(), count_before - 1);
}

#[test]
fn ecosystem_bookmarks_polls_private_rooms_and_follow_work() {
    let mut rt = render(connected(), WINDOW_SIZE);

    // 1. Companion Ecosystem modal (`ecosystem-btn` -> `ecosystem-modal` -> 11 dApps -> `ecosystem-close`)
    assert!(rt.find("ecosystem-modal").is_none());
    press(&mut rt, "ecosystem-btn");
    assert!(rt.find("ecosystem-modal").is_some());
    assert!(rt.find("eco-app-river").is_some());
    assert!(rt.find("eco-app-viso").is_some());
    press(&mut rt, "ecosystem-close");
    assert!(rt.find("ecosystem-modal").is_none());

    // 2. Bookmark message & filter by Saved (`bookmark-btn-<id>` & `filter-Saved`)
    let last_id = rt.state.chat.room().unwrap().last_message().unwrap().id;
    let room_key = rt.state.chat.room().unwrap().key.clone();
    assert!(!rt.state.chat.is_bookmarked(&room_key, last_id));
    press(&mut rt, &format!("bookmark-btn-{last_id}"));
    assert!(rt.state.chat.is_bookmarked(&room_key, last_id));
    press(&mut rt, "filter-Saved");
    assert_eq!(rt.state.chat.filter, super::RoomFilter::Saved);
    press(&mut rt, "filter-All");

    // 3. Insert Poll template from composer `+` tray (`insert-poll`)
    press(&mut rt, "emoji");
    assert!(rt.find("insert-poll").is_some());
    assert!(rt.find("open-wormhole").is_some());
    press(&mut rt, "insert-poll");
    assert!(rt.state.chat.composer.text.starts_with("📊 Poll:"));
    rt.state.chat.composer.clear();

    // 4. Create an E2EE Private Group Room (`create-room-private-toggle`)
    press(&mut rt, "create-room");
    press(&mut rt, "create-room-private-toggle");
    assert!(rt.state.chat.creating_private_room);
    rt.state.chat.create_input.replace_text("Core Lab");
    press(&mut rt, "create-room-submit");
    assert_eq!(rt.state.chat.room().unwrap().key, "priv:core-lab");
    assert!(rt.state.chat.room().unwrap().private);

    // 5. Follow / Unfollow a peer in Room Info drawer (`follow-btn-<id>`)
    press(&mut rt, "room-town-square");
    let peer_id = rt
        .state
        .chat
        .room()
        .unwrap()
        .members
        .iter()
        .find(|m| m.id != rt.state.chat.room().unwrap().me)
        .unwrap()
        .id;
    assert!(!rt.state.chat.is_following(peer_id));
    press(&mut rt, &format!("follow-btn-{peer_id}"));
    assert!(rt.state.chat.is_following(peer_id));
}

#[test]
fn each_room_opens_at_its_newest_message() {
    // Two long rooms: Town Square and a copy of it.
    let mut state = connected();
    let mut copy = state.chat.rooms()[0].clone();
    copy.key = "town-square-copy".into();
    copy.name = "Town Square copy".into();
    state.chat.edit_rooms(|rooms| rooms.push(copy));
    let town = &state.chat.rooms()[0];
    let first = format!("msg-{}", town.messages[0].id);
    let last = format!("msg-{}", town.last_message().unwrap().id);
    let mut rt = render(state, WINDOW_SIZE);
    assert!(visible(&rt, &last) && !visible(&rt, &first));
    // Scroll Town Square to its top.
    let (x, y) = rt.find("history").unwrap();
    let y = y.clamp(100.0, 600.0);
    let mut t = 1.0;
    for _ in 0..40 {
        rt.wheel(x, y, 200.0);
        t += 1.0 / 60.0;
        rt.frame(t);
    }
    for _ in 0..120 {
        t += 1.0 / 60.0;
        rt.frame(t);
    }
    assert!(visible(&rt, &first), "the wheel scrolled the history up");
    // The other long room opens at its end, not at Town Square's offset.
    let (x, y) = rt.find("room-town-square-copy").unwrap();
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    for _ in 0..30 {
        t += 1.0 / 60.0;
        rt.frame(t);
    }
    assert_eq!(rt.state.chat.room().unwrap().key, "town-square-copy");
    assert!(visible(&rt, &last), "the newest message shows");
    assert!(!visible(&rt, &first));
}

#[test]
fn the_members_panel_toggles() {
    let mut rt = render(connected(), WINDOW_SIZE);
    assert!(rt.find("members").is_some());
    press(&mut rt, "toggle-members");
    assert!(!rt.state.chat.members_open);
    assert!(rt.find("members").is_none());
    press(&mut rt, "toggle-members");
    assert!(rt.find("members").is_some());
}

#[test]
fn a_narrow_window_leaves_out_the_members_panel() {
    let rt = render(connected(), NARROW_SCENE_SIZE);
    assert!(rt.state.chat.members_open);
    assert!(rt.find("members").is_none());
    assert!(rt.find("composer").is_some());
}

#[test]
fn a_narrow_window_opens_members_over_the_conversation() {
    let mut rt = render(connected(), NARROW_SCENE_SIZE);
    press(&mut rt, "toggle-members");
    assert!(rt.state.chat.members_overlay);
    assert!(rt.find("members-overlay").is_some());
    // The wide layout's choice is untouched.
    assert!(rt.state.chat.members_open);
    // The overlay covers the header's toggle, so it has its own close button.
    press(&mut rt, "close-members");
    assert!(!rt.state.chat.members_overlay);
    assert!(rt.find("members").is_none());
    // Pressing the dimmed conversation closes it too.
    press(&mut rt, "toggle-members");
    press(&mut rt, "members-scrim");
    assert!(!rt.state.chat.members_overlay);
    // Tab stays inside it, and Escape closes it.
    press(&mut rt, "toggle-members");
    assert!(rt.state.chat.members_overlay);
    for i in 0..8 {
        key(&mut rt, Key::Tab);
        let focused: Vec<_> = rt.elements().into_iter().filter(|e| e.focused).collect();
        if i == 0 {
            assert!(!focused.is_empty(), "Tab focuses something in the panel");
        }
        for e in focused {
            assert!(e.path.contains("members-overlay"), "Tab reached {}", e.path);
        }
    }
    key(&mut rt, Key::Escape);
    assert!(!rt.state.chat.members_overlay);
    // The room list is behind it too: a press there closes the panel and opens nothing.
    press(&mut rt, "toggle-members");
    press(&mut rt, &format!("room-{PRIVATE_ROOM}"));
    assert!(!rt.state.chat.members_overlay);
    assert_eq!(rt.state.chat.room().unwrap().key, "town-square");
}

#[test]
fn every_scene_renders() {
    for (name, apply) in SCENES {
        let mut state = RadicaApp::detached();
        apply(&mut state);
        let rt = render(state, scene_size(name));
        assert!(
            rt.find("root").is_some() || rt.find("chat").is_some(),
            "{name}"
        );
        assert!(!texts(&rt).is_empty(), "{name} shows no text");
    }
}

/// The narrow scenes are rendered at the narrow size only because their names say "narrow"
/// (`scene_size`, and the matching glob in CI's render step). Check that names and layouts
/// agree, so a renamed scene cannot quietly render in the wrong layout.
#[test]
fn narrow_scenes_are_named_narrow() {
    let mut narrow = 0;
    for (name, apply) in SCENES {
        let mut state = RadicaApp::detached();
        apply(&mut state);
        if !matches!(state.setup, Setup::Connected { .. }) {
            continue;
        }
        // The members overlay only exists in a narrow window.
        if state.chat.members_overlay {
            assert!(name.contains("narrow"), "{name} needs the narrow size");
        }
        let rt = render(state, scene_size(name));
        // A narrow window never puts the members panel beside the conversation.
        let beside = rt.find("members").is_some() && rt.find("members-overlay").is_none();
        let is_narrow = name.contains("narrow");
        assert_eq!(beside, !is_narrow && rt.state.chat.members_open, "{name}");
        narrow += usize::from(is_narrow);
    }
    assert!(narrow > 0, "no scene shows the narrow layout");
}

#[test]
fn the_town_square_history_renders_its_parts() {
    let rt = render(connected(), WINDOW_SIZE);
    assert!(shows(&rt, "Yesterday"));
    assert!(shows(&rt, "Today"));
    // The release notes message's address is a link (`find` also finds link boxes).
    assert!(rt.find("https://freenet.org/news").is_some());
    assert!(rt.find("reply").is_some());
    assert!(rt.find("reaction-🎉").is_some());
    assert!(rt.find("tag-owner").is_some());
}

#[test]
fn removing_the_open_room_shows_another_not_an_empty_screen() {
    let mut rt = render(connected(), WINDOW_SIZE);
    rt.state
        .chat
        .edit_rooms(|rooms| rooms.retain(|r| r.key != "town-square"));
    // State changed outside a handler, so ask for the view to run again.
    rt.invalidate();
    rt.frame(0.5);
    rt.frame(0.6);
    assert!(rt.find("no-rooms").is_none());
    assert!(rt.find("room-header").is_some());
    let open = rt.state.chat.room().expect("a room is open").key.clone();
    assert_eq!(open, PRIVATE_ROOM);
    assert_eq!(rt.state.chat.room().unwrap().unread, 0);
    press(&mut rt, "composer-field");
    key(&mut rt, Key::Text("still here".into()));
    key(&mut rt, Key::Enter);
    let last = rt.state.chat.room().unwrap().last_message().unwrap();
    assert_eq!(last.text, "still here");
    // With no rooms at all, the empty screen shows.
    rt.state.chat.set_rooms(Vec::new());
    rt.invalidate();
    rt.frame(0.7);
    rt.frame(0.8);
    assert!(rt.find("no-rooms").is_some());
}

/// Opening members in a narrow window, widening, typing, then narrowing again must not bring
/// the modal panel back and take the keyboard from the composer.
#[test]
fn widening_closes_the_narrow_members_panel() {
    let mut rt = render(connected(), NARROW_SCENE_SIZE);
    press(&mut rt, "toggle-members");
    assert!(rt.find("members-overlay").is_some());
    let mut t = 1.0;
    let mut settle = |rt: &mut Runtime<RadicaApp>| {
        for _ in 0..4 {
            t += 1.0 / 60.0;
            rt.frame(t);
        }
    };
    rt.set_viewport(WINDOW_SIZE, 1.0);
    settle(&mut rt);
    assert!(!rt.state.chat.members_overlay);
    let (x, y) = rt.find("composer-field").unwrap();
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    settle(&mut rt);
    assert!(rt.state.chat.composer.focused);
    rt.set_viewport(NARROW_SCENE_SIZE, 1.0);
    settle(&mut rt);
    assert!(rt.find("members-overlay").is_none());
    assert!(rt.state.chat.composer.focused);
    rt.key(KeyEvent {
        key: Key::Text("still typing".into()),
        mods: Default::default(),
    });
    settle(&mut rt);
    assert_eq!(rt.state.chat.composer.text, "still typing");
}
