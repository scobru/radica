//! Building the Radica Messenger screen (`ui/src/messengerChat.ts` / `ui/src/messengerChat.css`):
//! Unified Inbox sidebar on the left (with live search, filter chips, inline create & join),
//! Signal-style conversation stage in the middle, and Room Info & Members drawer on the right.

use rune::tok::TextStyle;
use rune::{Color, Cx, El, Pixels, ScrollSpec, col, el, icon, row, spacer, text};
use rune_kit::{Kit, TextInput};

use super::conversation::{avatar, conversation};
use super::icons;
use super::model::{self, Member, Role, Room};
use super::style::{self as st, Palette};
use super::{Chat, RoomFilter, Source};
use crate::{RADICA_WEB_URL, RadicaApp};

/// Below this window width the info/members drawer gives way to the conversation.
pub const NARROW_WIDTH: f32 = 1024.0;

const ROOMS_W: f32 = 304.0;
const ROOMS_NARROW_W: f32 = 240.0;
const MEMBERS_W: f32 = 264.0;
const BRAND_H: f32 = 58.0;
pub(super) const HEADER_H: f32 = 66.0;

pub fn view(chat: &Chat, logo: Option<&Pixels>, cx: &mut Cx<RadicaApp>) -> El {
    let p = st::palette();
    let k = Kit::neutral(true);
    let narrow = cx
        .layout_with("chat", |r| r[2] < NARROW_WIDTH)
        .unwrap_or(false);
    let mut screen = row()
        .key("chat")
        .w_full()
        .h_full()
        .fill(p.bg)
        .on_layout(|s: &mut RadicaApp, r: [f32; 4]| {
            if r[2] >= NARROW_WIDTH {
                s.chat.members_overlay = false;
            }
        })
        .child(rooms(chat, logo, narrow, &p, &k));
    let Some(room) = chat.room() else {
        return screen.child(no_rooms(&p));
    };
    screen = screen.child(conversation(chat, room, narrow, &p, &k));
    if chat.members_shown(narrow) {
        let panel = members(chat, room, narrow, &p);
        if narrow {
            screen = screen.child(
                el().key("members-scrim")
                    .pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0))
                    .fill(p.scrim),
            );
        }
        screen = screen.child(if narrow {
            panel
                .key("members-overlay")
                .pin(None, Some(0.0), Some(0.0), Some(0.0))
                .modal(true, |s: &mut RadicaApp| s.chat.members_overlay = false)
        } else {
            panel
        });
    }
    if chat.identity_open {
        screen = screen
            .child(
                el().key("identity-scrim")
                    .pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0))
                    .fill(p.scrim),
            )
            .child(
                identity_modal(chat, &p, &k)
                    .key("identity-modal")
                    .pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0))
                    .modal(true, |s: &mut RadicaApp| s.chat.identity_open = false),
            );
    }
    if chat.ecosystem_open {
        screen = screen
            .child(
                el().key("ecosystem-scrim")
                    .pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0))
                    .fill(p.scrim),
            )
            .child(
                ecosystem_modal(&p)
                    .key("ecosystem-modal")
                    .pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0))
                    .modal(true, |s: &mut RadicaApp| s.chat.ecosystem_open = false),
            );
    }
    screen
}

pub(super) fn vline(p: &Palette) -> El {
    el().w(1.0).h_full().fill(p.line)
}

pub(super) fn hline(p: &Palette) -> El {
    el().w_full().h(1.0).fill(p.line)
}

pub(super) fn label(s: impl Into<String>, style: TextStyle, color: Color) -> El {
    text(s.into()).font(style).color(color)
}

fn icon_button(key: &str, name: &str, glyph: &'static rune::Icon, p: &Palette) -> El {
    row()
        .key(key.to_owned())
        .role("button")
        .label(name.to_owned())
        .help(name.to_owned())
        .size(28.0, 28.0)
        .radius(8.0)
        .center()
        .fill(p.surface)
        .border(1.0, p.line)
        .hover(p.surface_hover)
        .cursor(rune::Cursor::Pointer)
        .child(icon(glyph, 14.0).color(p.text_secondary))
}

fn outlined(key: &str, name: &str, glyph: &'static rune::Icon, h: f32, p: &Palette) -> El {
    row()
        .key(key.to_owned())
        .role("button")
        .label(name.to_owned())
        .help(name.to_owned())
        .w_full()
        .h(h)
        .gap(8.0)
        .radius(999.0)
        .center()
        .fill(p.surface)
        .border(1.0, p.line_strong)
        .hover(p.surface_hover)
        .cursor(rune::Cursor::Pointer)
        .child(icon(glyph, 14.0).color(p.text_secondary))
        .child(label(name.to_owned(), st::SMALL_STRONG, p.text_secondary))
}

/// Room monogram badge (`#R` amber for communities, `📢` green for Feed, avatar for DMs, or initials).
pub(super) fn room_monogram_el(chat: &Chat, room: &Room, size: f32, p: &Palette) -> El {
    if room.key.starts_with("dm:")
        && let Some(peer) = room.members.iter().find(|m| m.id != room.me)
        && let Some(px) = chat.avatar_pixels(peer.id)
    {
        return el().size(size, size).radius(size / 2.0).pixels(px);
    }
    let mono = st::room_monogram(&room.key, &room.name);
    let is_feed = room.key.starts_with("feed");
    let is_comm = room.key.starts_with("c_");
    let (bg, border, fg) = if is_feed {
        (p.accent_soft, p.accent_line, p.accent)
    } else if is_comm {
        (p.amber_soft, p.amber, p.amber)
    } else {
        (p.surface_hover, p.line_strong, p.text)
    };
    el().size(size, size)
        .radius(if room.private { size / 2.0 } else { 12.0 })
        .center()
        .fill(bg)
        .border(1.0, border)
        .child(label(mono, st::MONOGRAM, fg))
}

// Unified Messenger Inbox ---------------------------------------------------------------------

fn rooms(chat: &Chat, logo: Option<&Pixels>, narrow: bool, p: &Palette, k: &Kit) -> El {
    let mark = match logo {
        Some(px) => el().key("logo").size(28.0, 28.0).pixels(px),
        None => el().key("logo").size(28.0, 28.0),
    };
    let brand = row()
        .key("brand")
        .h(BRAND_H)
        .px(14.0)
        .gap(10.0)
        .center_y()
        .child(mark)
        .child(
            col()
                .gap(1.0)
                .child(
                    row()
                        .gap(6.0)
                        .center_y()
                        .child(label("Radica", st::BRAND, p.text))
                        .child(
                            el().px(6.0)
                                .h(18.0)
                                .radius(9.0)
                                .center()
                                .fill(p.accent_soft)
                                .border(1.0, p.accent_line)
                                .child(label("Messenger", st::TAG, p.accent)),
                        ),
                )
                .child(source_status(&chat.source, p)),
        )
        .child(spacer())
        .child(
            icon_button("create-room", "Create room", &icons::PLUS, p).on_press(
                |s: &mut RadicaApp| {
                    s.chat.creating_room = !s.chat.creating_room;
                    s.chat.create_input.focused = s.chat.creating_room;
                },
            ),
        );

    let search_field = TextInput::new(&chat.search)
        .plain()
        .width(None)
        .height(30.0)
        .text_style(st::SMALL)
        .placeholder("Search rooms or #communities…")
        .label("Search inbox")
        .on_edit(|s: &mut RadicaApp| &mut s.chat.search)
        .build(k)
        .key("inbox-search-field")
        .grow(1.0)
        .min_w(0.0);
    let mut search_row = row()
        .key("inbox-search")
        .w_full()
        .h(32.0)
        .px(10.0)
        .gap(6.0)
        .center_y()
        .radius(16.0)
        .fill(p.surface)
        .border(1.0, p.line)
        .child(search_field);
    if !chat.search.text.is_empty() {
        search_row = search_row.child(
            row()
                .key("inbox-search-clear")
                .role("button")
                .label("Clear search")
                .size(20.0, 20.0)
                .radius(10.0)
                .center()
                .hover(p.surface_hover)
                .cursor(rune::Cursor::Pointer)
                .on_press(|s: &mut RadicaApp| s.chat.search.clear())
                .child(icon(&rune_kit::glyphs::CLOSE, 11.0).color(p.text_muted)),
        );
    }

    let filters = col()
        .key("filter-bar")
        .px(10.0)
        .pb(6.0)
        .gap(4.0)
        .child(
            row()
                .gap(4.0)
                .center_y()
                .child(filter_chip("All", RoomFilter::All, chat.filter, p))
                .child(filter_chip("Unread", RoomFilter::Unread, chat.filter, p))
                .child(filter_chip("DMs", RoomFilter::Dms, chat.filter, p))
                .child(filter_chip("Groups", RoomFilter::Groups, chat.filter, p)),
        )
        .child(
            row()
                .gap(4.0)
                .center_y()
                .child(filter_chip(
                    "#Communities",
                    RoomFilter::Communities,
                    chat.filter,
                    p,
                ))
                .child(filter_chip("Saved", RoomFilter::Saved, chat.filter, p)),
        );

    let width = if narrow { ROOMS_NARROW_W } else { ROOMS_W };
    let query = chat.search.text.trim().to_ascii_lowercase();
    let mut list = col().key("room-list").gap(4.0).px(10.0).pt(4.0).pb(10.0);
    for room in chat.rooms() {
        let selected = chat.room().is_some_and(|r| r.key == room.key);
        let matches_filter = match chat.filter {
            RoomFilter::All => true,
            RoomFilter::Unread => room.unread > 0 || selected,
            RoomFilter::Dms => room.key.starts_with("dm:") || selected,
            RoomFilter::Groups => (room.private && !room.key.starts_with("dm:")) || selected,
            RoomFilter::Communities => (!room.private && !room.key.starts_with("dm:")) || selected,
            RoomFilter::Saved => chat.room_has_bookmarks(&room.key) || selected,
        };
        let matches_query = query.is_empty()
            || selected
            || room.name.to_ascii_lowercase().contains(&query)
            || room.description.to_ascii_lowercase().contains(&query)
            || room
                .messages
                .iter()
                .any(|m| m.text.to_ascii_lowercase().contains(&query));
        if matches_filter && matches_query {
            list = list.child(room_row(chat, room, selected, width, p));
        }
    }

    let mut footer = col()
        .key("rooms-footer")
        .px(12.0)
        .pt(10.0)
        .pb(12.0)
        .gap(8.0)
        .child(identity_card_btn(chat, p))
        .child(
            outlined(
                "ecosystem-btn",
                "Freenet Ecosystem & Apps",
                &icons::USERS,
                34.0,
                p,
            )
            .on_press(|s: &mut RadicaApp| {
                s.chat.ecosystem_open = !s.chat.ecosystem_open;
            }),
        )
        .child(
            outlined(
                "open-feed-web",
                "Radica Feed (Web)",
                &icons::GLOBAL,
                34.0,
                p,
            )
            .on_press_tx(|_: &mut RadicaApp, tx: &mut rune::Tx| {
                let _ = tx.open_url(&format!("{RADICA_WEB_URL}#feed"));
            }),
        )
        .child(
            outlined("open-web", "Open Radica Web", &icons::CHAT, 34.0, p).on_press_tx(
                |_: &mut RadicaApp, tx: &mut rune::Tx| {
                    let _ = tx.open_url(RADICA_WEB_URL);
                },
            ),
        )
        .child(
            outlined(
                "enter-invite",
                "Join with invite code",
                &icons::INVITE,
                34.0,
                p,
            )
            .on_press(|s: &mut RadicaApp| {
                s.chat.joining_room = !s.chat.joining_room;
                s.chat.join_input.focused = s.chat.joining_room;
            }),
        );
    if chat.joining_room {
        let join_field = TextInput::new(&chat.join_input)
            .plain()
            .width(None)
            .height(30.0)
            .text_style(st::SMALL)
            .placeholder("#slug or invite code…")
            .label("Invite code")
            .on_edit(|s: &mut RadicaApp| &mut s.chat.join_input)
            .on_submit(|s: &mut RadicaApp, _| s.join_room())
            .build(k)
            .key("join-room-field")
            .grow(1.0)
            .min_w(0.0);
        footer = footer.child(
            row()
                .key("join-room-bar")
                .w_full()
                .h(34.0)
                .px(8.0)
                .gap(6.0)
                .center_y()
                .radius(10.0)
                .fill(p.surface)
                .border(1.0, p.accent_line)
                .child(join_field)
                .child(
                    row()
                        .key("join-room-submit")
                        .role("button")
                        .label("Join")
                        .h(24.0)
                        .px(8.0)
                        .radius(6.0)
                        .center()
                        .fill(p.accent)
                        .cursor(rune::Cursor::Pointer)
                        .on_press(|s: &mut RadicaApp| s.join_room())
                        .child(label("Join", st::GUTTER_TIME, p.on_accent)),
                ),
        );
    }

    let mut column = col()
        .key("rooms")
        .w(width)
        .h_full()
        .fill(p.rail)
        .child(brand)
        .child(hline(p));
    if chat.creating_room {
        let is_priv = chat.creating_private_room;
        let create_field = TextInput::new(&chat.create_input)
            .plain()
            .width(None)
            .height(30.0)
            .text_style(st::SMALL)
            .placeholder(if is_priv {
                "New E2EE private room name…"
            } else {
                "New #community name…"
            })
            .label("New room name")
            .on_edit(|s: &mut RadicaApp| &mut s.chat.create_input)
            .on_submit(|s: &mut RadicaApp, _| s.create_room())
            .build(k)
            .key("create-room-field")
            .grow(1.0)
            .min_w(0.0);
        column = column.child(
            row().key("create-room-bar").px(10.0).pt(8.0).child(
                row()
                    .w_full()
                    .h(34.0)
                    .px(8.0)
                    .gap(6.0)
                    .center_y()
                    .radius(10.0)
                    .fill(p.surface)
                    .border(1.0, if is_priv { p.amber } else { p.accent_line })
                    .child(
                        row()
                            .key("create-room-private-toggle")
                            .role("button")
                            .label(if is_priv { "Private E2EE" } else { "Public" })
                            .help("Toggle between Public #Community and E2EE Private Group Room")
                            .h(22.0)
                            .px(6.0)
                            .radius(6.0)
                            .center()
                            .fill(if is_priv { p.amber_soft } else { p.accent_soft })
                            .border(1.0, if is_priv { p.amber } else { p.accent_line })
                            .cursor(rune::Cursor::Pointer)
                            .on_press(|s: &mut RadicaApp| {
                                s.chat.creating_private_room = !s.chat.creating_private_room;
                            })
                            .child(label(
                                if is_priv { "🔒 E2EE" } else { "🌐 Pub" },
                                st::TAG,
                                if is_priv { p.amber } else { p.accent },
                            )),
                    )
                    .child(create_field)
                    .child(
                        row()
                            .key("create-room-submit")
                            .role("button")
                            .label("Create")
                            .h(24.0)
                            .px(8.0)
                            .radius(6.0)
                            .center()
                            .fill(p.accent)
                            .cursor(rune::Cursor::Pointer)
                            .on_press(|s: &mut RadicaApp| s.create_room())
                            .child(label("Create", st::GUTTER_TIME, p.on_accent)),
                    ),
            ),
        );
    }
    column = column
        .child(col().px(10.0).pt(8.0).pb(6.0).child(search_row))
        .child(filters)
        .child(
            list.scroll(ScrollSpec {
                stick_bottom: false,
            })
            .grow(1.0)
            .min_h(0.0),
        )
        .child(hline(p))
        .child(footer);
    row()
        .key("rooms-panel")
        .h_full()
        .child(column)
        .child(vline(p))
}

fn filter_chip(name: &str, target: RoomFilter, current: RoomFilter, p: &Palette) -> El {
    let active = target == current;
    row()
        .key(format!("filter-{name}"))
        .role("button")
        .label(name.to_owned())
        .h(24.0)
        .px(9.0)
        .radius(12.0)
        .center()
        .fill(if active { p.accent_soft } else { p.surface })
        .border(1.0, if active { p.accent_line } else { p.line })
        .hover(p.surface_hover)
        .cursor(rune::Cursor::Pointer)
        .on_press(move |s: &mut RadicaApp| s.chat.filter = target)
        .child(label(
            name.to_owned(),
            st::GUTTER_TIME,
            if active { p.accent } else { p.text_secondary },
        ))
}

fn source_status(source: &Source, p: &Palette) -> El {
    match source {
        Source::Example => row().key("source-status").child(
            label(
                "Example rooms, not connected to Freenet",
                st::GUTTER_TIME,
                p.text_muted,
            )
            .truncate(),
        ),
        Source::Live(info) => row()
            .key("source-status")
            .gap(5.0)
            .center_y()
            .child(el().size(6.0, 6.0).radius(3.0).fill(p.accent))
            .child(label(
                format!("Live on Freenet · {info}"),
                st::GUTTER_TIME,
                p.accent,
            )),
    }
}

fn preview_chars(row_width: f32, badge: bool) -> usize {
    let text_w = row_width - 84.0 - if badge { 28.0 } else { 0.0 };
    (text_w / 6.5).max(8.0) as usize
}

fn room_row(chat: &Chat, room: &Room, selected: bool, width: f32, p: &Palette) -> El {
    let key = room.key.clone();
    let unread = room.unread > 0 && !selected;
    let strong = unread || selected;
    let last_msg = room.last_message();
    let preview = last_msg.map_or_else(
        || "No messages yet".into(),
        |m| {
            model::preview(
                &format!("{}: {}", room.nickname(m.author), m.text),
                preview_chars(width, unread),
            )
        },
    );
    let mut top_row = row().w_full().gap(6.0).center_y().min_w(0.0).child(
        label(
            room.name.clone(),
            if strong { st::ROOM_STRONG } else { st::ROOM },
            if strong { p.text } else { p.text_secondary },
        )
        .truncate()
        .shrink(),
    );
    if room.private {
        top_row = top_row.child(
            icon(&icons::LOCK, 12.0)
                .color(p.text_muted)
                .label("Private"),
        );
    }
    if let Some(m) = last_msg {
        top_row = top_row.child(spacer()).child(label(
            model::clock(m.time),
            st::GUTTER_TIME,
            if unread { p.accent } else { p.text_muted },
        ));
    } else {
        top_row = top_row.child(spacer());
    }

    let hide_k = room.key.clone();
    let hide_btn = row()
        .key(format!("hide-room-{}", room.key))
        .role("button")
        .label("Hide conversation")
        .help("Hide conversation from sidebar")
        .size(18.0, 18.0)
        .radius(9.0)
        .center()
        .hover(p.surface_hover)
        .cursor(rune::Cursor::Pointer)
        .on_press(move |s: &mut RadicaApp| s.remove_room(&hide_k))
        .child(icon(&icons::CLOSE, 8.0).color(p.text_muted));
    top_row = top_row.child(hide_btn);

    let bottom_row = label(preview, st::SMALL, p.text_muted).truncate();

    let mut r = row()
        .key(format!("room-{}", room.key))
        .role("button")
        .label(room.name.clone())
        .w_full()
        .h(60.0)
        .px(10.0)
        .gap(10.0)
        .center_y()
        .radius(12.0)
        .cursor(rune::Cursor::Pointer)
        .on_press(move |s: &mut RadicaApp| s.open_room(&key))
        .child(room_monogram_el(chat, room, 38.0, p))
        .child(
            col()
                .grow(1.0)
                .min_w(0.0)
                .gap(3.0)
                .child(top_row)
                .child(bottom_row),
        );
    if unread {
        r = r.child(
            el().key("unread")
                .h(18.0)
                .min_w(20.0)
                .px(6.0)
                .radius(9.0)
                .center()
                .fill(p.accent)
                .child(label(room.unread.to_string(), st::BADGE, p.on_accent)),
        );
    }
    if selected {
        r.fill(p.accent_soft).border(1.0, p.accent_line)
    } else {
        r.hover(p.row_hover)
    }
}

fn no_rooms(p: &Palette) -> El {
    col()
        .key("no-rooms")
        .grow(1.0)
        .h_full()
        .center()
        .gap(8.0)
        .child(label("No rooms yet", st::TITLE, p.text))
        .child(label(
            "Create a room, or enter an invite code to join one.",
            st::BODY,
            p.text_secondary,
        ))
}

// Room Info & Members Drawer (`rm-drawer`) ----------------------------------------------------

fn members(chat: &Chat, room: &Room, overlay: bool, p: &Palette) -> El {
    let mut sorted: Vec<&Member> = room.members.iter().collect();
    sorted.sort_by_key(|m| {
        (
            m.id != room.me,
            m.role != Role::Owner,
            m.nickname.to_lowercase(),
        )
    });
    let mut list = col().key("member-list").gap(2.0).px(10.0).pt(6.0);
    for m in sorted {
        list = list.child(member_row(chat, room, m, p));
    }
    let mut header = row()
        .h(HEADER_H)
        .pl(16.0)
        .pr(10.0)
        .gap(8.0)
        .center_y()
        .child(label("Room Info", st::HEADER_SMALL, p.text))
        .child(
            el().px(7.0)
                .h(20.0)
                .radius(10.0)
                .center()
                .fill(p.surface)
                .border(1.0, p.line)
                .child(label(
                    format!("{} members", room.members.len()),
                    st::GUTTER_TIME,
                    p.text_secondary,
                )),
        );
    if overlay {
        header = header.child(spacer()).child(
            icon_button(
                "close-members",
                "Close members",
                &rune_kit::glyphs::CLOSE,
                p,
            )
            .on_press(|s: &mut RadicaApp| s.chat.toggle_members(true)),
        );
    }

    let badge_text = if room.key.starts_with("dm:") {
        "🔒 E2EE Direct Message"
    } else if room.private {
        "🔒 E2EE Group Room"
    } else if room.key.starts_with("feed") {
        "📢 Public Feed Contract"
    } else {
        "🌐 Public Ed25519 Room"
    };
    let summary_card = col()
        .px(14.0)
        .py(12.0)
        .gap(6.0)
        .center()
        .child(room_monogram_el(chat, room, 46.0, p))
        .child(label(room.name.clone(), st::ROOM_STRONG, p.text))
        .child(
            el().px(8.0)
                .h(20.0)
                .radius(10.0)
                .center()
                .fill(p.accent_soft)
                .border(1.0, p.accent_line)
                .child(label(badge_text, st::GUTTER_TIME, p.accent)),
        );

    let hide_k = room.key.clone();
    let hide_label = if room.key.starts_with("dm:") {
        "Hide contact"
    } else if room.private {
        "Leave private group"
    } else {
        "Hide community"
    };
    let footer = col()
        .key("members-footer")
        .padding(12.0)
        .gap(8.0)
        .child(
            outlined("invite", "Invite someone", &icons::INVITE, 36.0, p)
                .on_press(|s: &mut RadicaApp| s.chat.invite_to_current_room()),
        )
        .child(
            outlined("hide-room-btn", hide_label, &icons::LOGOUT, 36.0, p)
                .on_press(move |s: &mut RadicaApp| s.remove_room(&hide_k)),
        );
    row().key("members-panel").h_full().child(vline(p)).child(
        col()
            .key("members")
            .w(MEMBERS_W)
            .h_full()
            .fill(p.rail)
            .child(header)
            .child(hline(p))
            .child(summary_card)
            .child(hline(p))
            .child(
                list.scroll(ScrollSpec {
                    stick_bottom: false,
                })
                .grow(1.0)
                .min_h(0.0),
            )
            .child(footer),
    )
}

fn member_row(chat: &Chat, room: &Room, m: &Member, p: &Palette) -> El {
    let member_id = m.id;
    let nick = m.nickname.clone();
    let is_me = m.id == room.me;
    let following = chat.is_following(member_id);
    let mut left = row()
        .key(format!("member-{}", m.id))
        .role("button")
        .label(m.nickname.clone())
        .help(if is_me {
            "Manage your decentralized identity or sign in with Viso".into()
        } else {
            format!("Open Direct Message with {}", m.nickname)
        })
        .grow(1.0)
        .min_w(0.0)
        .h(36.0)
        .px(6.0)
        .gap(8.0)
        .radius(8.0)
        .center_y()
        .hover(p.surface)
        .cursor(rune::Cursor::Pointer)
        .on_press(move |s: &mut RadicaApp| {
            if is_me {
                s.chat.identity_open = true;
            } else {
                s.chat.open_dm(member_id, &nick);
            }
        })
        .child(avatar(chat, Some(m), m.id, 28.0))
        .child(
            label(m.nickname.clone(), st::BODY, p.text_secondary)
                .truncate()
                .shrink(),
        );
    if is_me {
        left = left.child(
            el().px(6.0)
                .h(18.0)
                .radius(9.0)
                .center()
                .fill(p.accent_soft)
                .child(label("you", st::GUTTER_TIME, p.accent)),
        );
    }
    if m.role == Role::Owner {
        left = left.child(
            icon(&icons::CROWN, 14.0)
                .color(p.amber)
                .label("Owner")
                .help("Room owner"),
        );
    }
    let mut r = row()
        .w_full()
        .h(40.0)
        .px(4.0)
        .gap(6.0)
        .center_y()
        .child(left);
    if !is_me {
        r = r.child(
            row()
                .key(format!("follow-btn-{member_id}"))
                .role("button")
                .label(if following { "Following" } else { "Follow" })
                .help(if following {
                    "Unfollow peer on Radica Feed"
                } else {
                    "Follow peer on Radica Feed"
                })
                .h(22.0)
                .px(7.0)
                .radius(11.0)
                .center()
                .fill(if following { p.accent_soft } else { p.surface })
                .border(
                    1.0,
                    if following {
                        p.accent_line
                    } else {
                        p.line_strong
                    },
                )
                .hover(p.surface_hover)
                .cursor(rune::Cursor::Pointer)
                .on_press(move |s: &mut RadicaApp| s.toggle_follow(member_id))
                .child(label(
                    if following {
                        "✓ Following"
                    } else {
                        "+ Follow"
                    },
                    st::TAG,
                    if following {
                        p.accent
                    } else {
                        p.text_secondary
                    },
                )),
        );
    }
    r
}

fn identity_card_btn(chat: &Chat, p: &Palette) -> El {
    let id = &chat.identity;
    let badge_text = if id.is_viso { "● Viso" } else { "● Local" };
    let (badge_bg, badge_border, badge_fg) = if id.is_viso {
        (p.accent_soft, p.accent_line, p.accent)
    } else {
        (p.amber_soft, p.amber, p.amber)
    };
    let me_member = Member::new(1, id.display_name.clone(), Role::Member)
        .with_avatar(Some(id.pubkey.clone()), None);
    row()
        .key("identity-btn")
        .role("button")
        .label("Identity & Viso Login")
        .help("Manage your decentralized identity, Login with Viso, or create/import keys")
        .w_full()
        .px(10.0)
        .py(8.0)
        .gap(9.0)
        .radius(12.0)
        .center_y()
        .fill(p.surface)
        .border(1.0, p.line_strong)
        .hover(p.surface_hover)
        .cursor(rune::Cursor::Pointer)
        .on_press(|s: &mut RadicaApp| {
            s.chat.identity_open = !s.chat.identity_open;
            s.chat.identity_status = None;
        })
        .child(avatar(chat, Some(&me_member), 1, 30.0))
        .child(
            col()
                .grow(1.0)
                .min_w(0.0)
                .gap(2.0)
                .child(
                    row()
                        .gap(6.0)
                        .center_y()
                        .child(
                            label(id.display_name.clone(), st::SMALL_STRONG, p.text)
                                .truncate()
                                .shrink(),
                        )
                        .child(
                            el().px(6.0)
                                .h(16.0)
                                .radius(8.0)
                                .center()
                                .fill(badge_bg)
                                .border(1.0, badge_border)
                                .child(label(badge_text, st::TAG, badge_fg)),
                        ),
                )
                .child(
                    label(
                        format!("{} · Identity & Viso", id.persona_b58),
                        st::GUTTER_TIME,
                        p.text_muted,
                    )
                    .truncate(),
                ),
        )
}

fn identity_modal(chat: &Chat, p: &Palette, k: &Kit) -> El {
    let id = &chat.identity;
    let (badge_label, badge_bg, badge_border, badge_fg) = if id.is_viso {
        ("● Viso Persona", p.accent_soft, p.accent_line, p.accent)
    } else {
        ("● Local Keypair", p.amber_soft, p.amber, p.amber)
    };
    let pk_short = if id.pubkey.len() > 24 {
        format!(
            "{}…{}",
            &id.pubkey[..14],
            &id.pubkey[id.pubkey.len() - 10..]
        )
    } else {
        id.pubkey.clone()
    };

    let name_field = TextInput::new(&chat.identity_name_input)
        .plain()
        .width(None)
        .height(30.0)
        .text_style(st::SMALL)
        .placeholder("Display name on Freenet…")
        .label("Display name")
        .on_edit(|s: &mut RadicaApp| &mut s.chat.identity_name_input)
        .on_submit(|s: &mut RadicaApp, _| s.save_display_name())
        .build(k)
        .key("identity-name-field")
        .grow(1.0)
        .min_w(0.0);

    let import_field = TextInput::new(&chat.identity_import_input)
        .plain()
        .width(None)
        .height(30.0)
        .text_style(st::SMALL)
        .placeholder("Paste 64-hex private key or Viso callback URL…")
        .label("Import key or Viso session")
        .on_edit(|s: &mut RadicaApp| &mut s.chat.identity_import_input)
        .on_submit(|s: &mut RadicaApp, _| s.import_identity())
        .build(k)
        .key("identity-import-field")
        .grow(1.0)
        .min_w(0.0);

    let mut card = col()
        .w(480.0)
        .px(22.0)
        .py(20.0)
        .gap(14.0)
        .radius(18.0)
        .fill(p.rail)
        .border(1.0, p.line_strong)
        .child(
            row()
                .w_full()
                .center_y()
                .gap(8.0)
                .child(label("Decentralized Identity", st::TITLE, p.text))
                .child(
                    el().px(8.0)
                        .h(20.0)
                        .radius(10.0)
                        .center()
                        .fill(badge_bg)
                        .border(1.0, badge_border)
                        .child(label(badge_label, st::TAG, badge_fg)),
                )
                .child(spacer())
                .child(
                    row()
                        .key("identity-close")
                        .role("button")
                        .label("Close identity panel")
                        .size(28.0, 28.0)
                        .radius(14.0)
                        .center()
                        .fill(p.surface)
                        .border(1.0, p.line)
                        .hover(p.surface_hover)
                        .cursor(rune::Cursor::Pointer)
                        .on_press(|s: &mut RadicaApp| s.chat.identity_open = false)
                        .child(icon(&rune_kit::glyphs::CLOSE, 12.0).color(p.text_secondary)),
                ),
        )
        .child(hline(p));

    // 1. Active Persona Summary & Display Name
    let mut active_box = col()
        .w_full()
        .px(14.0)
        .py(12.0)
        .gap(8.0)
        .radius(12.0)
        .fill(p.surface)
        .border(1.0, p.line)
        .child(
            row()
                .w_full()
                .center_y()
                .gap(8.0)
                .child(label(id.display_name.clone(), st::ROOM_STRONG, p.text))
                .child(label(id.persona_b58.clone(), st::SMALL, p.accent))
                .child(spacer())
                .child(label(pk_short, st::GUTTER_TIME, p.text_muted)),
        )
        .child(
            row()
                .w_full()
                .h(34.0)
                .px(10.0)
                .gap(6.0)
                .center_y()
                .radius(9.0)
                .fill(p.rail)
                .border(1.0, p.line)
                .child(name_field)
                .child(
                    row()
                        .key("identity-name-save")
                        .role("button")
                        .label("Save Name")
                        .h(24.0)
                        .px(10.0)
                        .radius(6.0)
                        .center()
                        .fill(p.accent)
                        .cursor(rune::Cursor::Pointer)
                        .on_press(|s: &mut RadicaApp| s.save_display_name())
                        .child(label("Save Name", st::GUTTER_TIME, p.on_accent)),
                ),
        );

    if !id.is_viso
        && let Some(sk) = &id.secret_key_hex
    {
        active_box = active_box.child(
            row()
                .w_full()
                .gap(8.0)
                .center_y()
                .child(
                    row()
                        .key("identity-toggle-secret")
                        .role("button")
                        .label(if chat.show_secret_key {
                            "Hide Secret Key"
                        } else {
                            "Show Secret Key"
                        })
                        .h(26.0)
                        .px(10.0)
                        .radius(8.0)
                        .center()
                        .fill(p.rail)
                        .border(1.0, p.line_strong)
                        .hover(p.surface_hover)
                        .cursor(rune::Cursor::Pointer)
                        .on_press(|s: &mut RadicaApp| {
                            s.chat.show_secret_key = !s.chat.show_secret_key;
                        })
                        .child(label(
                            if chat.show_secret_key {
                                "Hide Secret Key"
                            } else {
                                "Show Secret Key (Backup)"
                            },
                            st::GUTTER_TIME,
                            p.text_secondary,
                        )),
                )
                .child(spacer())
                .child(
                    row()
                        .key("identity-signout-btn")
                        .role("button")
                        .label("Sign Out")
                        .h(26.0)
                        .px(10.0)
                        .radius(8.0)
                        .center()
                        .fill(p.rail)
                        .border(1.0, p.line)
                        .hover(p.surface_hover)
                        .cursor(rune::Cursor::Pointer)
                        .on_press(|s: &mut RadicaApp| s.sign_out_identity())
                        .child(label("Reset / Sign Out", st::GUTTER_TIME, p.amber)),
                ),
        );
        if chat.show_secret_key {
            active_box = active_box.child(
                col()
                    .key("identity-secret-box")
                    .w_full()
                    .px(10.0)
                    .py(8.0)
                    .gap(4.0)
                    .radius(8.0)
                    .fill(p.rail)
                    .border(1.0, p.amber)
                    .child(label(
                        "Keep this 64-hex Ed25519 private key secret (use it to import on Web or Desktop):",
                        st::GUTTER_TIME,
                        p.amber,
                    ))
                    .child(label(sk.clone(), st::GUTTER_TIME, p.text).wrap().w_full()),
            );
        }
    } else if id.is_viso {
        active_box = active_box.child(
            row()
                .w_full()
                .center_y()
                .child(label(
                    "Authenticated via Viso delegation certificate (whoiam-connect-v1).",
                    st::GUTTER_TIME,
                    p.text_secondary,
                ))
                .child(spacer())
                .child(
                    row()
                        .key("identity-signout-btn")
                        .role("button")
                        .label("Sign Out")
                        .h(26.0)
                        .px(10.0)
                        .radius(8.0)
                        .center()
                        .fill(p.rail)
                        .border(1.0, p.line)
                        .hover(p.surface_hover)
                        .cursor(rune::Cursor::Pointer)
                        .on_press(|s: &mut RadicaApp| s.sign_out_identity())
                        .child(label("Sign Out of Viso", st::GUTTER_TIME, p.amber)),
                ),
        );
    }
    card = card.child(active_box);

    // 2. Sign in with Viso (1-click local callback server)
    let viso_box = col()
        .w_full()
        .px(14.0)
        .py(12.0)
        .gap(8.0)
        .radius(12.0)
        .fill(p.surface)
        .border(1.0, p.accent_line)
        .child(label("Login with Viso (Freenet Sovereign Identity)", st::SMALL_STRONG, p.accent))
        .child(
            label(
                "Opens Viso on your local Freenet node (127.0.0.1:7509) and connects your persona automatically when you click Approve.",
                st::GUTTER_TIME,
                p.text_secondary,
            )
            .wrap()
            .w_full(),
        )
        .child(
            row()
                .key("viso-signin-btn")
                .role("button")
                .label("Sign in with Viso")
                .w_full()
                .h(36.0)
                .radius(10.0)
                .center()
                .fill(p.accent)
                .cursor(rune::Cursor::Pointer)
                .on_press(|s: &mut RadicaApp| s.sign_in_with_viso())
                .child(label("Sign in with Viso", st::SMALL_STRONG, p.on_accent)),
        );
    card = card.child(viso_box);

    // 3. Create or Import Local Keypair / Viso Session
    let create_import_box = col()
        .w_full()
        .px(14.0)
        .py(12.0)
        .gap(8.0)
        .radius(12.0)
        .fill(p.surface)
        .border(1.0, p.line)
        .child(
            row()
                .w_full()
                .center_y()
                .child(label("Create or Import Identity", st::SMALL_STRONG, p.text))
                .child(spacer())
                .child(
                    row()
                        .key("identity-create-btn")
                        .role("button")
                        .label("Generate New Keypair")
                        .h(26.0)
                        .px(10.0)
                        .radius(8.0)
                        .center()
                        .fill(p.rail)
                        .border(1.0, p.line_strong)
                        .hover(p.surface_hover)
                        .cursor(rune::Cursor::Pointer)
                        .on_press(|s: &mut RadicaApp| s.create_local_identity())
                        .child(label("+ Generate New Keypair", st::GUTTER_TIME, p.text)),
                ),
        )
        .child(
            label(
                "Paste a 64-character hex secret key (from Radica Web 'Show Secret Key') or a Viso callback URL:",
                st::GUTTER_TIME,
                p.text_muted,
            )
            .wrap()
            .w_full(),
        )
        .child(
            row()
                .w_full()
                .h(34.0)
                .px(10.0)
                .gap(6.0)
                .center_y()
                .radius(9.0)
                .fill(p.rail)
                .border(1.0, p.line)
                .child(import_field)
                .child(
                    row()
                        .key("identity-import-submit")
                        .role("button")
                        .label("Import")
                        .h(24.0)
                        .px(10.0)
                        .radius(6.0)
                        .center()
                        .fill(p.accent)
                        .cursor(rune::Cursor::Pointer)
                        .on_press(|s: &mut RadicaApp| s.import_identity())
                        .child(label("Import", st::GUTTER_TIME, p.on_accent)),
                ),
        );
    card = card.child(create_import_box);

    if let Some(status) = &chat.identity_status {
        card = card.child(
            row()
                .key("identity-status")
                .w_full()
                .px(12.0)
                .py(8.0)
                .radius(8.0)
                .fill(p.accent_soft)
                .border(1.0, p.accent_line)
                .child(label(status.clone(), st::SMALL, p.accent).wrap().w_full()),
        );
    }

    col().w_full().h_full().center().child(card)
}

/// Companion Freenet Ecosystem apps (`ui/src/ecosystem.ts`) launched directly on `127.0.0.1:7509`.
const ECOSYSTEM_APPS: &[(&str, &str, &str, &str, &str)] = &[
    (
        "river",
        "💬",
        "River",
        "Decentralized group chat rooms on Freenet",
        "http://127.0.0.1:7509/v1/contract/web/raAqMhMG7KUpXBU2SxgCQ3Vh4PYjttxdSWd9ftV7RLv/",
    ),
    (
        "viso",
        "🪪",
        "Viso",
        "Sovereign identity & persona hub on Freenet",
        "http://127.0.0.1:7509/v1/contract/web/GzHy3jnEtj26EoGqMsBpoawcY378hK9kp91rTcNYiAac/",
    ),
    (
        "freetunes",
        "🎵",
        "FreeTunes",
        "Decentralized music directory & audio streaming",
        "http://127.0.0.1:7509/v1/contract/web/F7feb3K337c8b9nG6N2G2G8x5fR4hJ6K8L9M0N1P2Q3R/",
    ),
    (
        "freepolls",
        "📊",
        "FreePolls",
        "Cryptographically signed polls & governance",
        "http://127.0.0.1:7509/v1/contract/web/9kL2mN4pQ6rS8tU0vW2xY4zA6bC8dE0fG2hI4jK6lM8n/",
    ),
    (
        "freenames",
        "🏷️",
        "FreeNames",
        "Human-readable naming & handle registry",
        "http://127.0.0.1:7509/v1/contract/web/3pQ5rS7tU9vW1xY3zA5bC7dE9fG1hI3jK5lM7nO9pQ1r/",
    ),
    (
        "delta",
        "🔺",
        "Delta",
        "Collaborative versioned documents & notes",
        "http://127.0.0.1:7509/v1/contract/web/7tU9vW1xY3zA5bC7dE9fG1hI3jK5lM7nO9pQ1rS3tU5v/",
    ),
    (
        "orto",
        "🌿",
        "Orto",
        "Community digital garden & wiki spaces",
        "http://127.0.0.1:7509/v1/contract/web/5rS7tU9vW1xY3zA5bC7dE9fG1hI3jK5lM7nO9pQ1rS3t/",
    ),
    (
        "asocial",
        "🕶️",
        "Asocial",
        "Minimalist pseudonymous micro-feeds",
        "http://127.0.0.1:7509/v1/contract/web/2mN4pQ6rS8tU0vW2xY4zA6bC8dE0fG2hI4jK6lM8nO0p/",
    ),
    (
        "fishermans-horizon",
        "🎣",
        "Fisherman's Horizon",
        "Peer-to-peer discovery & horizon explorer",
        "http://127.0.0.1:7509/v1/contract/web/8tU0vW2xY4zA6bC8dE0fG2hI4jK6lM8nO0pQ2rS4tU6v/",
    ),
    (
        "wormhole",
        "🌀",
        "Wormhole",
        "Encrypted P2P file & snippet transfer on Freenet",
        "http://127.0.0.1:7509/v1/contract/web/A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V2/",
    ),
    (
        "freetree",
        "🌳",
        "Freetree",
        "Decentralized link-in-bio & profile directory",
        "http://127.0.0.1:7509/v1/contract/web/C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V2W3X4/",
    ),
];

fn ecosystem_modal(p: &Palette) -> El {
    let mut list = col().key("ecosystem-list").w_full().gap(6.0);
    for &(slug, emoji, name, desc, url) in ECOSYSTEM_APPS {
        let target = url.to_owned();
        list = list.child(
            row()
                .key(format!("eco-app-{slug}"))
                .role("button")
                .label(format!("Open {name}"))
                .help(format!("{name} — {desc}"))
                .w_full()
                .px(12.0)
                .py(9.0)
                .gap(10.0)
                .radius(12.0)
                .center_y()
                .fill(p.surface)
                .border(1.0, p.line)
                .hover(p.surface_hover)
                .cursor(rune::Cursor::Pointer)
                .on_press_tx(move |_: &mut RadicaApp, tx: &mut rune::Tx| {
                    let _ = tx.open_url(&target);
                })
                .child(
                    el().size(32.0, 32.0)
                        .radius(10.0)
                        .center()
                        .fill(p.accent_soft)
                        .border(1.0, p.accent_line)
                        .child(label(emoji, st::EMOJI, p.text)),
                )
                .child(
                    col()
                        .grow(1.0)
                        .min_w(0.0)
                        .gap(2.0)
                        .child(label(name, st::SMALL_STRONG, p.text))
                        .child(label(desc, st::GUTTER_TIME, p.text_secondary).truncate()),
                )
                .child(
                    el().px(8.0)
                        .h(22.0)
                        .radius(11.0)
                        .center()
                        .fill(p.rail)
                        .border(1.0, p.line_strong)
                        .child(label("Launch ↗", st::TAG, p.accent)),
                ),
        );
    }

    let card = col()
        .w(540.0)
        .h(560.0)
        .px(22.0)
        .py(20.0)
        .gap(12.0)
        .radius(18.0)
        .fill(p.rail)
        .border(1.0, p.line_strong)
        .child(
            row()
                .w_full()
                .center_y()
                .gap(8.0)
                .child(label("🌱 Freenet Companion Ecosystem", st::TITLE, p.text))
                .child(
                    el().px(8.0)
                        .h(20.0)
                        .radius(10.0)
                        .center()
                        .fill(p.accent_soft)
                        .border(1.0, p.accent_line)
                        .child(label("11 Live dApps", st::TAG, p.accent)),
                )
                .child(spacer())
                .child(
                    row()
                        .key("ecosystem-close")
                        .role("button")
                        .label("Close ecosystem modal")
                        .size(28.0, 28.0)
                        .radius(14.0)
                        .center()
                        .fill(p.surface)
                        .border(1.0, p.line)
                        .hover(p.surface_hover)
                        .cursor(rune::Cursor::Pointer)
                        .on_press(|s: &mut RadicaApp| s.chat.ecosystem_open = false)
                        .child(icon(&rune_kit::glyphs::CLOSE, 12.0).color(p.text_secondary)),
                ),
        )
        .child(label(
            "Launch decentralized Freenet applications directly on your local node (127.0.0.1:7509):",
            st::SMALL,
            p.text_secondary,
        ))
        .child(hline(p))
        .child(
            list.scroll(ScrollSpec {
                stick_bottom: false,
            })
            .grow(1.0)
            .min_h(0.0),
        )
        .child(hline(p))
        .child(
            row()
                .w_full()
                .center_y()
                .gap(8.0)
                .child(label(
                    "⚡ Support open-source Freenet & Radica development:",
                    st::GUTTER_TIME,
                    p.text_muted,
                ))
                .child(spacer())
                .child(
                    row()
                        .key("eco-donate-btn")
                        .role("button")
                        .label("Support Radica")
                        .h(26.0)
                        .px(10.0)
                        .radius(8.0)
                        .center()
                        .fill(p.amber_soft)
                        .border(1.0, p.amber)
                        .cursor(rune::Cursor::Pointer)
                        .on_press_tx(|_: &mut RadicaApp, tx: &mut rune::Tx| {
                            let _ = tx.open_url("https://freenet.org/donate");
                        })
                        .child(label("♥ Support Freenet", st::TAG, p.amber)),
                ),
        );

    col().w_full().h_full().center().child(card)
}
