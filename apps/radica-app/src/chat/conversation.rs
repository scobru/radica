//! The open room's conversation in Radica Messenger style (`ui/src/messengerChat.ts`):
//! header with monogram & trust pill, thread search bar, context banner, Signal-style
//! incoming/outgoing bubbles, interactive reply/react/edit/delete actions, and pill composer.

use rune::tok::TextStyle;
use rune::{El, ScrollSpec, col, el, icon, row, spacer, text};
use rune_kit::{Kit, TextInput};

use super::Chat;
use super::icons;
use super::media;
use super::model::{self, Group, MINUTES_PER_DAY, Member, Message, Role, Room};
use super::style::{self as st, Palette};
use super::view::{HEADER_H, hline, label, room_monogram_el};
use crate::{RADICA_WEB_URL, RadicaApp};

const AVATAR: f32 = 34.0;
const GUTTER: f32 = 48.0;
const BODY_MAX_W: f32 = 560.0;
const COLUMN_MAX_W: f32 = GUTTER + BODY_MAX_W + 72.0;

pub(super) fn conversation(chat: &Chat, room: &Room, narrow: bool, p: &Palette, k: &Kit) -> El {
    let mut stage = col()
        .key("conversation")
        .grow(1.0)
        .min_w(0.0)
        .h_full()
        .fill(p.bg)
        .child(header(chat, room, narrow, p))
        .child(hline(p));
    if chat.thread_search_open {
        stage = stage.child(thread_search_bar(chat, p, k)).child(hline(p));
    }
    stage
        .child(history(chat, room, p))
        .child(composer(chat, room, p, k))
}

fn header(chat: &Chat, room: &Room, narrow: bool, p: &Palette) -> El {
    let mut title = row().gap(8.0).center_y().min_w(0.0).child(
        label(room.name.clone(), st::HEADER, p.text)
            .truncate()
            .shrink(),
    );
    if room.private {
        let badge_txt = if room.key.starts_with("dm:") {
            "E2EE · Direct"
        } else {
            "PRIVATE · E2EE"
        };
        title = title.child(
            row()
                .key("private-badge")
                .h(20.0)
                .px(8.0)
                .gap(4.0)
                .radius(10.0)
                .center_y()
                .fill(p.surface)
                .border(1.0, p.line_strong)
                .child(icon(&icons::LOCK, 11.0).color(p.amber))
                .child(label(badge_txt, st::TAG, p.amber)),
        );
    } else {
        let badge_txt = if room.key.starts_with("feed") {
            "📢 Broadcast Feed"
        } else {
            "🌐 Public Room"
        };
        title = title.child(
            row()
                .key("public-badge")
                .h(20.0)
                .px(8.0)
                .radius(10.0)
                .center_y()
                .fill(p.accent_soft)
                .border(1.0, p.accent_line)
                .child(label(badge_txt, st::GUTTER_TIME, p.accent)),
        );
    }

    let subtitle = if room.description.is_empty() {
        format!(
            "{} participants · Ed25519 signed on Freenet",
            room.members.len()
        )
    } else {
        format!("{} participants · {}", room.members.len(), room.description)
    };
    let info = col()
        .grow(1.0)
        .min_w(0.0)
        .gap(2.0)
        .child(title)
        .child(label(subtitle, st::SMALL, p.text_muted).truncate());

    let search_btn = row()
        .key("toggle-thread-search")
        .role("button")
        .label("Search conversation")
        .help("Find in conversation")
        .h(34.0)
        .px(10.0)
        .radius(17.0)
        .center()
        .fill(if chat.thread_search_open {
            p.accent_soft
        } else {
            p.surface
        })
        .border(
            1.0,
            if chat.thread_search_open {
                p.accent_line
            } else {
                p.line
            },
        )
        .hover(p.surface_hover)
        .cursor(rune::Cursor::Pointer)
        .on_press(|s: &mut RadicaApp| {
            s.chat.thread_search_open = !s.chat.thread_search_open;
            if s.chat.thread_search_open {
                s.chat.thread_search.focused = true;
            } else {
                s.chat.thread_search.clear();
            }
        })
        .child(label(
            "Find",
            st::GUTTER_TIME,
            if chat.thread_search_open {
                p.accent
            } else {
                p.text_secondary
            },
        ));

    let open = chat.members_shown(narrow);
    let toggle = row()
        .key("toggle-members")
        .role("button")
        .label(if open { "Hide members" } else { "Show members" })
        .help(if open { "Hide members" } else { "Show members" })
        .h(34.0)
        .px(12.0)
        .gap(6.0)
        .radius(17.0)
        .center_y()
        .fill(if open { p.accent_soft } else { p.surface })
        .border(1.0, if open { p.accent_line } else { p.line })
        .hover(p.surface_hover)
        .cursor(rune::Cursor::Pointer)
        .on_press(move |s: &mut RadicaApp| s.chat.toggle_members(narrow))
        .child(icon(&icons::USERS, 16.0).color(if open { p.accent } else { p.text_secondary }))
        .child(label(
            room.members.len().to_string(),
            st::SMALL_STRONG,
            if open { p.accent } else { p.text_secondary },
        ));

    let feed_btn = row()
        .key("header-feed-link")
        .role("button")
        .label("Radica Feed (Web)")
        .help("Open social feed on Radica Web")
        .h(34.0)
        .px(10.0)
        .radius(17.0)
        .gap(4.0)
        .center()
        .fill(p.surface)
        .border(1.0, p.line)
        .hover(p.surface_hover)
        .cursor(rune::Cursor::Pointer)
        .on_press_tx(|_: &mut RadicaApp, tx: &mut rune::Tx| {
            let _ = tx.open_url(&format!("{RADICA_WEB_URL}#feed"));
        })
        .child(icon(&icons::GLOBAL, 12.0).color(p.accent))
        .child(label("Feed Web", st::GUTTER_TIME, p.text_secondary));

    row()
        .key("room-header")
        .w_full()
        .h(HEADER_H)
        .pl(18.0)
        .pr(14.0)
        .gap(10.0)
        .center_y()
        .fill(p.rail)
        .child(room_monogram_el(chat, room, 40.0, p))
        .child(info)
        .child(feed_btn)
        .child(search_btn)
        .child(toggle)
}

fn thread_search_bar(chat: &Chat, p: &Palette, k: &Kit) -> El {
    let field = TextInput::new(&chat.thread_search)
        .plain()
        .width(None)
        .height(30.0)
        .text_style(st::SMALL)
        .placeholder("Find in conversation…")
        .label("Find in conversation")
        .on_edit(|s: &mut RadicaApp| &mut s.chat.thread_search)
        .build(k)
        .key("thread-search-field")
        .grow(1.0)
        .min_w(0.0);
    row()
        .key("thread-search-bar")
        .w_full()
        .h(40.0)
        .px(18.0)
        .gap(8.0)
        .center_y()
        .fill(p.rail)
        .child(field)
        .child(
            row()
                .key("close-thread-search")
                .role("button")
                .label("Close search")
                .size(24.0, 24.0)
                .radius(12.0)
                .center()
                .hover(p.surface_hover)
                .cursor(rune::Cursor::Pointer)
                .on_press(|s: &mut RadicaApp| {
                    s.chat.thread_search_open = false;
                    s.chat.thread_search.clear();
                })
                .child(icon(&rune_kit::glyphs::CLOSE, 12.0).color(p.text_muted)),
        )
}

fn context_banner(room: &Room, p: &Palette) -> El {
    let msg = if room.key.starts_with("dm:") {
        format!(
            "🔒 Direct E2EE session with {} · Zero central servers · X25519 + AES-256-GCM.",
            room.name
        )
    } else if room.private {
        "🔒 Messages in this conversation are end-to-end encrypted on your Freenet node.".to_owned()
    } else if room.key.starts_with("feed") {
        "📢 Public Freenet social feed · Posts, likes and comments synced from feed contracts."
            .to_owned()
    } else {
        format!(
            "🌐 Public community chat for {}. Messages are signed with Ed25519 and synced on Freenet.",
            room.name
        )
    };
    row().key("context-banner").w_full().px(24.0).child(
        row()
            .w_full()
            .px(14.0)
            .py(9.0)
            .radius(12.0)
            .center()
            .fill(p.surface)
            .border(1.0, p.line)
            .child(label(msg, st::SMALL, p.text_secondary).wrap().w_full()),
    )
}

fn history(chat: &Chat, room: &Room, p: &Palette) -> El {
    let q = chat.thread_search.text.trim().to_ascii_lowercase();
    let only_saved = chat.filter == super::RoomFilter::Saved && chat.room_has_bookmarks(&room.key);
    let filtered: Vec<Message> = room
        .messages
        .iter()
        .filter(|m| {
            (!only_saved || chat.is_bookmarked(&room.key, m.id))
                && (q.is_empty() || m.text.to_ascii_lowercase().contains(&q))
        })
        .cloned()
        .collect();

    if filtered.is_empty() {
        return col()
            .key("history-empty")
            .grow(1.0)
            .min_h(0.0)
            .w_full()
            .center()
            .gap(10.0)
            .child(room_monogram_el(chat, room, 58.0, p))
            .child(
                label(
                    if q.is_empty() {
                        "No messages yet"
                    } else {
                        "No matching messages"
                    },
                    st::TITLE,
                    p.text,
                )
                .mt(6.0),
            )
            .child(label(
                if q.is_empty() {
                    format!("Be the first to say something in {}.", room.name)
                } else {
                    format!("No messages in {} match \"{}\".", room.name, q)
                },
                st::BODY,
                p.text_secondary,
            ));
    }
    let mut items = col()
        .key("history")
        .w_full()
        .max_w(COLUMN_MAX_W)
        .self_center()
        .pt(14.0)
        .pb(24.0)
        .gap(10.0)
        .child(context_banner(room, p));
    let mut day = None;
    for group in model::groups(&filtered) {
        let d = group.messages[0].time / MINUTES_PER_DAY;
        if day != Some(d) {
            day = Some(d);
            let label = model::day_label(
                chat.day_zero + i64::from(d),
                chat.day_zero + i64::from(chat.today),
            );
            items = items.child(day_divider(d, label, p));
        }
        items = items.child(group_el(chat, room, &group, p));
    }
    col()
        .key(format!("history-scroll-{}", room.key))
        .grow(1.0)
        .min_h(0.0)
        .w_full()
        .child(items)
        .scroll(ScrollSpec { stick_bottom: true })
        .scroll_edge_fade(36.0)
}

fn day_divider(day: u32, text: String, p: &Palette) -> El {
    row()
        .key(format!("day-{day}"))
        .w_full()
        .px(24.0)
        .py(6.0)
        .gap(12.0)
        .center_y()
        .child(el().grow(1.0).h(1.0).fill(p.line))
        .child(
            el().px(12.0)
                .h(22.0)
                .radius(11.0)
                .center()
                .fill(p.surface)
                .border(1.0, p.line)
                .child(label(text, st::GUTTER_TIME, p.text_secondary)),
        )
        .child(el().grow(1.0).h(1.0).fill(p.line))
}

pub(super) fn avatar(chat: &Chat, member: Option<&Member>, id: u32, size: f32) -> El {
    if let Some(px) = chat.avatar_pixels(id) {
        return el().size(size, size).radius(size / 2.0).pixels(px);
    }
    let name = member.map_or("?", |m| m.nickname.as_str());
    let (bg, fg) = st::avatar_colors(id);
    el().size(size, size)
        .radius(size / 2.0)
        .center()
        .fill(bg)
        .child(
            text(model::initials(name))
                .font(TextStyle::new((size * 0.38).round(), 700.0))
                .color(fg),
        )
}

fn tag(s: &str, p: &Palette) -> El {
    row()
        .key(format!("tag-{}", s.to_lowercase()))
        .h(18.0)
        .px(6.0)
        .radius(9.0)
        .center()
        .fill(p.amber_soft)
        .border(1.0, p.amber)
        .child(label(s.to_owned(), st::TAG, p.amber))
}

fn group_el(chat: &Chat, room: &Room, group: &Group, p: &Palette) -> El {
    let first = &group.messages[0];
    let author = room.member(group.author);
    let mine = group.author == room.me;
    let is_owner = room.member(room.me).is_some_and(|m| m.role == Role::Owner);
    let sender_col = if mine {
        p.accent
    } else {
        st::sender_color(group.author)
    };

    let face = if !mine {
        Some(avatar(chat, author, group.author, AVATAR))
    } else {
        None
    };

    let mut rows = col().key(format!("group-{}", first.id)).w_full().gap(4.0);

    for (i, m) in group.messages.iter().enumerate() {
        let is_bookmarked = chat.is_bookmarked(&room.key, m.id);
        let actions = message_actions(m.id, mine, is_owner, is_bookmarked, p);

        let mut bubble = col()
            .min_w(0.0)
            .max_w(BODY_MAX_W)
            .px(14.0)
            .py(9.0)
            .gap(4.0)
            .radius(16.0)
            .fill(if mine { p.own_row } else { p.bubble_theirs })
            .border(
                1.0,
                if mine {
                    p.accent_line
                } else {
                    p.bubble_theirs_border
                },
            );

        if !mine && i == 0 {
            let mut name_row = row().gap(6.0).center_y().child(label(
                room.nickname(group.author).to_owned(),
                st::NAME,
                sender_col,
            ));
            if author.is_some_and(|m| m.role == Role::Owner) {
                name_row = name_row.child(tag("OWNER", p));
            }
            bubble = bubble.child(name_row);
        }

        bubble = bubble.child(message_el(chat, room, m, mine, p));

        let mut meta = row().gap(4.0).center_y().justify_end().pt(2.0);
        if m.edited {
            meta = meta.child(label("edited", st::GUTTER_TIME, p.text_muted));
        }
        meta = meta.child(label(model::clock(m.time), st::GUTTER_TIME, p.text_muted));
        if mine {
            meta = meta.child(label("✓✓", st::GUTTER_TIME, p.accent));
        }
        bubble = bubble.child(meta);

        let line = if mine {
            let bubble_stack = col().items_end().child(bubble).child(actions.pin(
                None,
                Some(-10.0),
                Some(12.0),
                None,
            ));
            row()
                .key(format!("row-{}", m.id))
                .w_full()
                .pl(64.0)
                .pr(16.0)
                .items_end()
                .hover_group()
                .child(spacer())
                .child(bubble_stack)
        } else {
            let gutter = if i == 0 {
                row()
                    .w(GUTTER)
                    .justify_center()
                    .pt(2.0)
                    .child(face.clone().unwrap_or_else(el))
            } else {
                row().w(GUTTER)
            };
            let bubble_stack = col().items_start().child(bubble).child(actions.pin(
                Some(12.0),
                Some(-10.0),
                None,
                None,
            ));
            row()
                .key(format!("row-{}", m.id))
                .w_full()
                .pl(14.0)
                .pr(64.0)
                .items_start()
                .hover_group()
                .child(gutter)
                .child(bubble_stack)
        };
        rows = rows.child(line);
    }
    rows
}

fn message_el(chat: &Chat, room: &Room, m: &Message, mine: bool, p: &Palette) -> El {
    let msg_id = m.id;
    let mut c = col().key(format!("msg-{}", m.id)).w_full().gap(6.0);
    if let Some(reply) = &m.reply_to {
        let author = room.nickname(reply.author).to_owned();
        c = c.child(
            row()
                .key("reply")
                .w_full()
                .px(10.0)
                .py(6.0)
                .gap(8.0)
                .radius(8.0)
                .center_y()
                .min_w(0.0)
                .fill(if mine { p.quote_mine_bg } else { p.quote_bg })
                .border(1.0, if mine { p.accent_line } else { p.line_strong })
                .child(icon(&icons::REPLY, 12.0).color(p.accent))
                .child(
                    col()
                        .gap(2.0)
                        .min_w(0.0)
                        .grow(1.0)
                        .child(label(author, st::SMALL_STRONG, p.accent).truncate())
                        .child(label(reply.preview.clone(), st::QUOTE, p.quote).truncate()),
                ),
        );
    }
    let (items, caption) = media::parse(&m.text);
    for item in &items {
        c = c.child(attachment_el(chat, item, p));
    }
    if items.is_empty() || !caption.is_empty() {
        let shown = if items.is_empty() {
            m.text.clone()
        } else {
            caption
        };
        let shown = model::plain_mentions(&shown, |pk| {
            room.members
                .iter()
                .find(|mb| mb.pubkey.as_deref() == Some(pk))
                .map(|mb| mb.nickname.clone())
        });
        c = c.child(message_body(m, &shown, p));
    }

    if !m.reactions.is_empty() {
        let mut pills = row().key("reactions").gap(5.0).pt(2.0).flex_wrap();
        for r in &m.reactions {
            let my_react = r.by.contains(&room.me);
            let emoji_str = r.emoji.clone();
            pills = pills.child(
                row()
                    .key(format!("reaction-{}", r.emoji))
                    .role("button")
                    .label(format!("React {}", r.emoji))
                    .h(24.0)
                    .px(8.0)
                    .gap(4.0)
                    .radius(12.0)
                    .center_y()
                    .fill(if my_react { p.accent_soft } else { p.rail })
                    .border(1.0, if my_react { p.accent_line } else { p.line })
                    .hover(p.surface_hover)
                    .cursor(rune::Cursor::Pointer)
                    .on_press(move |s: &mut RadicaApp| s.react_msg(msg_id, &emoji_str))
                    .child(label(r.emoji.clone(), st::EMOJI, p.text))
                    .child(label(
                        r.by.len().to_string(),
                        st::SMALL_STRONG,
                        if my_react { p.accent } else { p.text_secondary },
                    )),
            );
        }
        c = c.child(pills);
    }
    c
}

fn message_actions(msg_id: u32, mine: bool, is_owner: bool, bookmarked: bool, p: &Palette) -> El {
    let mut actions = row()
        .key(format!("actions-{msg_id}"))
        .gap(4.0)
        .px(6.0)
        .py(2.0)
        .radius(10.0)
        .fill(p.surface)
        .border(1.0, p.line)
        .center_y()
        .group_opacity(0.0, 1.0);
    for quick in ["👍", "❤️", "🔥"] {
        let e_str = quick.to_owned();
        actions = actions.child(
            row()
                .key(format!("react-{quick}-{msg_id}"))
                .role("button")
                .label(format!("React {quick}"))
                .help(format!("React {quick}"))
                .size(18.0, 18.0)
                .radius(9.0)
                .center()
                .hover(p.surface_hover)
                .cursor(rune::Cursor::Pointer)
                .on_press(move |s: &mut RadicaApp| s.react_msg(msg_id, &e_str))
                .child(label(quick, st::GUTTER_TIME, p.text)),
        );
    }
    actions = actions
        .child(
            row()
                .key(format!("bookmark-btn-{msg_id}"))
                .role("button")
                .label(if bookmarked { "Saved" } else { "Save" })
                .help("Save / Bookmark message")
                .h(18.0)
                .px(6.0)
                .radius(9.0)
                .center()
                .hover(p.surface_hover)
                .cursor(rune::Cursor::Pointer)
                .on_press(move |s: &mut RadicaApp| {
                    s.chat.toggle_bookmark(msg_id);
                })
                .child(label(
                    if bookmarked { "🔖 Saved" } else { "Save" },
                    st::GUTTER_TIME,
                    if bookmarked {
                        p.amber
                    } else {
                        p.text_secondary
                    },
                )),
        )
        .child(
            row()
                .key(format!("reply-btn-{msg_id}"))
                .role("button")
                .label("Reply")
                .help("Reply to message")
                .h(18.0)
                .px(6.0)
                .gap(3.0)
                .radius(9.0)
                .center_y()
                .hover(p.surface_hover)
                .cursor(rune::Cursor::Pointer)
                .on_press(move |s: &mut RadicaApp| s.chat.start_reply(msg_id))
                .child(icon(&icons::REPLY, 10.0).color(p.text_secondary))
                .child(label("Reply", st::GUTTER_TIME, p.text_secondary)),
        );
    if mine || is_owner {
        if mine {
            actions = actions.child(
                row()
                    .key(format!("edit-btn-{msg_id}"))
                    .role("button")
                    .label("Edit")
                    .help("Edit message")
                    .h(18.0)
                    .px(6.0)
                    .radius(9.0)
                    .center()
                    .hover(p.surface_hover)
                    .cursor(rune::Cursor::Pointer)
                    .on_press(move |s: &mut RadicaApp| s.chat.start_edit(msg_id))
                    .child(label("Edit", st::GUTTER_TIME, p.text_secondary)),
            );
        }
        actions = actions.child(
            row()
                .key(format!("del-btn-{msg_id}"))
                .role("button")
                .label("Delete")
                .help("Delete message")
                .h(18.0)
                .px(6.0)
                .radius(9.0)
                .center()
                .hover(p.surface_hover)
                .cursor(rune::Cursor::Pointer)
                .on_press(move |s: &mut RadicaApp| s.delete_msg(msg_id))
                .child(label("Delete", st::GUTTER_TIME, p.amber)),
        );
    }
    actions
}

fn message_body(m: &Message, content: &str, p: &Palette) -> El {
    let content = content.to_owned();
    let links = model::links(&content);
    let spans: Vec<rune::Span> = links
        .iter()
        .map(|r| {
            rune::Span::new(r.start, r.end)
                .color(p.accent)
                .underline(p.accent_line)
        })
        .collect();
    let mut body = rune::rich(content.clone(), spans)
        .key(format!("body-{}", m.id))
        .font(st::MESSAGE)
        .color(p.text)
        .wrap_anywhere()
        .max_w(BODY_MAX_W)
        .selectable(true);
    for r in links {
        let url = content[r.clone()].to_owned();
        body = body.link(rune::Link::new(r, url).hover(rune::LinkPaint::new().underline(p.accent)));
    }
    body.on_link(|_: &mut RadicaApp, url: &str, tx: &mut rune::Tx| {
        let _ = tx.open_url(url);
    })
}

/// Largest side an image attachment is drawn at, in points.
const MEDIA_MAX: f32 = 280.0;

/// An attachment in a message: an image once the node has opened it, else a card that saves the file.
/// shortcut: audio and voice notes are saved and played outside the app; play them inline once Rune has a player.
fn attachment_el(chat: &Chat, item: &media::MediaItem, p: &Palette) -> El {
    let key = format!("media-{}", &item.hash[..16]);
    if item.kind == media::MediaKind::Img
        && let Some(img) = chat.media_images.get(&item.hash)
        && let Some([w, h]) = img.size()
        && w > 0
        && h > 0
    {
        let scale = (MEDIA_MAX / w.max(h) as f32).min(1.0);
        return el()
            .key(key)
            .role("img")
            .label("Photo")
            .size(w as f32 * scale, h as f32 * scale)
            .radius(10.0)
            .pixels(img.pixels());
    }
    let path = chat.media_path(&item.hash);
    let title = match item.kind {
        media::MediaKind::Img => "📷 Photo".to_owned(),
        media::MediaKind::Voice => format!("🎤 Voice message · {:.0}s", item.duration_sec),
        media::MediaKind::Audio => "🎵 Audio".to_owned(),
        media::MediaKind::File => format!("📎 {}", item.filename),
    };
    let detail = match (&path, item.size_bytes) {
        (None, _) => "Downloading from Freenet…".to_owned(),
        (Some(_), 0) => "Sealed end to end".to_owned(),
        (Some(_), n) if n >= 1024 * 1024 => format!("{:.1} MB", n as f64 / 1024.0 / 1024.0),
        (Some(_), n) => format!("{} KB", n.div_ceil(1024)),
    };
    let mut card = row()
        .key(key)
        .min_w(220.0)
        .max_w(BODY_MAX_W)
        .px(12.0)
        .py(8.0)
        .gap(10.0)
        .radius(10.0)
        .center_y()
        .fill(p.rail)
        .border(1.0, p.line)
        .child(
            col()
                .gap(2.0)
                .grow(1.0)
                .min_w(0.0)
                .child(label(title, st::SMALL_STRONG, p.text).truncate())
                .child(label(detail, st::GUTTER_TIME, p.text_secondary)),
        );
    if let Some(src) = path {
        let name = if item.filename.is_empty() {
            let ext = item.mime.rsplit('/').next().unwrap_or("bin");
            format!("radica-{}.{ext}", &item.hash[..8])
        } else {
            item.filename.clone()
        };
        card = card.child(
            row()
                .key("save")
                .role("button")
                .label("Save attachment")
                .px(10.0)
                .h(28.0)
                .radius(14.0)
                .center()
                .fill(p.surface)
                .border(1.0, p.line_strong)
                .hover(p.surface_hover)
                .cursor(rune::Cursor::Pointer)
                .on_press_tx(move |_: &mut RadicaApp, tx: &mut rune::Tx| {
                    let src = src.clone();
                    let options = rune::FileDialogOptions {
                        title: "Save attachment".into(),
                        file_name: Some(name.clone()),
                        ..Default::default()
                    };
                    tx.save_file(options, move |s: &mut RadicaApp, result, _| {
                        if let Ok(Some(dest)) = result
                            && let Err(e) = std::fs::copy(&src, &dest)
                        {
                            s.chat.identity_status =
                                Some(format!("Could not save the attachment: {e}"));
                        }
                    });
                })
                .child(label("Save…", st::SMALL_STRONG, p.accent)),
        );
    }
    card
}

fn composer(chat: &Chat, room: &Room, p: &Palette, k: &Kit) -> El {
    let has_text = !chat.composer.text.trim().is_empty();
    let placeholder = if chat.editing_id.is_some() {
        "Edit your message…".to_owned()
    } else if chat.replying_to.is_some() {
        format!("Write a reply in {}…", room.name)
    } else {
        format!("Write a message in {}…", room.name)
    };
    let field = TextInput::new(&chat.composer)
        .plain()
        .width(None)
        .height(42.0)
        .text_style(st::MESSAGE.lh(22.0))
        .placeholder(placeholder)
        .label("Message")
        .on_edit(|s: &mut RadicaApp| &mut s.chat.composer)
        .on_submit(|s: &mut RadicaApp, _| {
            s.send_chat();
        })
        .build(k)
        .key("composer-field")
        .grow(1.0)
        .min_w(0.0);

    let sprout = row()
        .key("quick-sprout")
        .role("button")
        .label("Insert sprout")
        .help("Insert 🌱")
        .size(32.0, 32.0)
        .radius(16.0)
        .center()
        .hover(p.surface_hover)
        .cursor(rune::Cursor::Pointer)
        .on_press(|s: &mut RadicaApp| {
            let next = format!("{}🌱", s.chat.composer.text);
            s.chat.composer.replace_text(&next);
        })
        .child(label("🌱", st::EMOJI, p.text));

    let send = row()
        .key("send")
        .role("button")
        .label("Send")
        .help("Send")
        .size(38.0, 38.0)
        .radius(19.0)
        .center()
        .fill(if has_text { p.accent } else { p.surface_hover })
        .hover(p.own_row_hover)
        .cursor(rune::Cursor::Pointer)
        .on_press(|s: &mut RadicaApp| {
            s.send_chat();
        })
        .child(icon(&icons::SEND, 18.0).color(if has_text { p.on_accent } else { p.text_muted }));

    let attach = row()
        .key("attach")
        .role("button")
        .label("Attach a file")
        .help("Attach a photo, audio or file: sealed end to end, up to 25 MB")
        .size(36.0, 36.0)
        .radius(18.0)
        .center()
        .fill(p.surface)
        .border(1.0, p.line)
        .hover(p.surface_hover)
        .cursor(rune::Cursor::Pointer)
        .on_press_tx(|_: &mut RadicaApp, tx: &mut rune::Tx| {
            let options = rune::FileDialogOptions {
                title: "Attach to the conversation".into(),
                ..Default::default()
            };
            tx.open_file(options, |s: &mut RadicaApp, result, _| {
                if let Ok(Some(path)) = result {
                    s.send_attachment(path);
                }
            });
        })
        .child(label("📎", st::EMOJI, p.text));

    let emoji = row()
        .key("emoji")
        .role("button")
        .label("Emoji and Freenet actions")
        .help("Emoji & Freenet actions")
        .size(36.0, 36.0)
        .radius(18.0)
        .center()
        .fill(if chat.emoji_open {
            p.accent_soft
        } else {
            p.surface
        })
        .border(
            1.0,
            if chat.emoji_open {
                p.accent_line
            } else {
                p.line
            },
        )
        .hover(p.surface_hover)
        .cursor(rune::Cursor::Pointer)
        .on_press(|s: &mut RadicaApp| s.chat.emoji_open = !s.chat.emoji_open)
        .child(icon(&icons::PLUS, 16.0).color(if chat.emoji_open {
            p.accent
        } else {
            p.text_secondary
        }));

    let mut outer = col()
        .key("composer")
        .w_full()
        .max_w(COLUMN_MAX_W)
        .self_center()
        .px(20.0)
        .pt(6.0)
        .pb(16.0)
        .gap(6.0);

    let candidates = chat.mention_candidates();
    if !candidates.is_empty() {
        let mut chips = row()
            .key("mention-picker")
            .role("listbox")
            .label("Mention")
            .gap(6.0)
            .flex_wrap();
        for m in candidates {
            let id = m.id;
            chips = chips.child(
                row()
                    .key(format!("mention-{id}"))
                    .role("option")
                    .label(format!("Mention {}", m.nickname))
                    .h(28.0)
                    .px(10.0)
                    .radius(14.0)
                    .center_y()
                    .fill(p.surface)
                    .border(1.0, p.line_strong)
                    .hover(p.surface_hover)
                    .cursor(rune::Cursor::Pointer)
                    .on_press(move |s: &mut RadicaApp| s.chat.pick_mention(id))
                    .child(label(
                        format!("@{}", m.nickname),
                        st::SMALL_STRONG,
                        p.accent,
                    )),
            );
        }
        outer = outer.child(chips);
    }

    if let Some(reply) = &chat.replying_to {
        let who = room.nickname(reply.author).to_owned();
        outer = outer.child(
            row()
                .key("reply-banner")
                .w_full()
                .h(34.0)
                .px(12.0)
                .gap(8.0)
                .center_y()
                .radius(12.0)
                .fill(p.surface)
                .border(1.0, p.accent_line)
                .child(icon(&icons::REPLY, 13.0).color(p.accent))
                .child(
                    label(
                        format!("Replying to {who}: {}", reply.preview),
                        st::SMALL,
                        p.text_secondary,
                    )
                    .truncate()
                    .grow(1.0)
                    .min_w(0.0),
                )
                .child(
                    row()
                        .key("cancel-reply")
                        .role("button")
                        .label("Cancel reply")
                        .size(22.0, 22.0)
                        .radius(11.0)
                        .center()
                        .hover(p.surface_hover)
                        .cursor(rune::Cursor::Pointer)
                        .on_press(|s: &mut RadicaApp| s.chat.cancel_reply())
                        .child(icon(&rune_kit::glyphs::CLOSE, 11.0).color(p.text_muted)),
                ),
        );
    }

    if chat.editing_id.is_some() {
        outer = outer.child(
            row()
                .key("edit-banner")
                .w_full()
                .h(34.0)
                .px(12.0)
                .gap(8.0)
                .center_y()
                .radius(12.0)
                .fill(p.amber_soft)
                .border(1.0, p.amber)
                .child(
                    label("✎ Editing your message", st::SMALL_STRONG, p.amber)
                        .grow(1.0)
                        .min_w(0.0),
                )
                .child(
                    row()
                        .key("cancel-edit")
                        .role("button")
                        .label("Cancel edit")
                        .size(22.0, 22.0)
                        .radius(11.0)
                        .center()
                        .hover(p.surface_hover)
                        .cursor(rune::Cursor::Pointer)
                        .on_press(|s: &mut RadicaApp| s.chat.cancel_edit())
                        .child(icon(&rune_kit::glyphs::CLOSE, 11.0).color(p.amber)),
                ),
        );
    }

    if chat.emoji_open {
        let mut tray = row()
            .key("emoji-tray")
            .w_full()
            .h(38.0)
            .px(10.0)
            .gap(6.0)
            .center_y()
            .radius(14.0)
            .fill(p.surface)
            .border(1.0, p.line_strong);
        for em in ["🌱", "❤️", "🔥", "🎉", "👍", "😂", "🚀", "✨"] {
            let e_str = em.to_owned();
            tray = tray.child(
                row()
                    .key(format!("tray-emoji-{em}"))
                    .role("button")
                    .label(format!("Insert {em}"))
                    .size(28.0, 28.0)
                    .radius(14.0)
                    .center()
                    .hover(p.surface_hover)
                    .cursor(rune::Cursor::Pointer)
                    .on_press(move |s: &mut RadicaApp| {
                        let next = format!("{}{e_str}", s.chat.composer.text);
                        s.chat.composer.replace_text(&next);
                        s.chat.emoji_open = false;
                    })
                    .child(label(em, st::EMOJI, p.text)),
            );
        }
        tray = tray
            .child(spacer())
            .child(
                row()
                    .key("insert-poll")
                    .role("button")
                    .label("Insert Poll Template")
                    .h(26.0)
                    .px(10.0)
                    .radius(13.0)
                    .center()
                    .fill(p.surface)
                    .border(1.0, p.line_strong)
                    .hover(p.surface_hover)
                    .cursor(rune::Cursor::Pointer)
                    .on_press(|s: &mut RadicaApp| {
                        s.chat.insert_poll_template();
                    })
                    .child(label("📊 Poll", st::GUTTER_TIME, p.text)),
            )
            .child(
                row()
                    .key("open-wormhole")
                    .role("button")
                    .label("Open Wormhole Transfer")
                    .h(26.0)
                    .px(10.0)
                    .radius(13.0)
                    .center()
                    .fill(p.surface)
                    .border(1.0, p.line_strong)
                    .hover(p.surface_hover)
                    .cursor(rune::Cursor::Pointer)
                    .on_press_tx(|s: &mut RadicaApp, tx: &mut rune::Tx| {
                        s.chat.emoji_open = false;
                        let _ = tx.open_url(
                            "http://127.0.0.1:7509/v1/contract/web/A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V2/",
                        );
                    })
                    .child(label("🌀 Wormhole", st::GUTTER_TIME, p.text)),
            )
            .child(
                row()
                    .key("insert-invite-link")
                    .role("button")
                    .label("Insert Room Invite Link")
                    .h(26.0)
                    .px(10.0)
                    .radius(13.0)
                    .center()
                    .fill(p.accent_soft)
                    .border(1.0, p.accent_line)
                    .hover(p.surface_hover)
                    .cursor(rune::Cursor::Pointer)
                    .on_press(|s: &mut RadicaApp| {
                        s.chat.invite_to_current_room();
                        s.chat.emoji_open = false;
                    })
                    .child(label("🔗 Room Link", st::GUTTER_TIME, p.accent)),
            );
        outer = outer.child(tray);
    }

    outer.child(
        row()
            .key("composer-box")
            .w_full()
            .h(50.0)
            .px(8.0)
            .gap(8.0)
            .center_y()
            .radius(25.0)
            .fill(p.surface)
            .border(
                1.0,
                if chat.composer.focused {
                    p.accent_line
                } else {
                    p.line_strong
                },
            )
            .shadow(8.0, 24.0, p.shadow)
            .child(attach)
            .child(emoji)
            .child(field)
            .child(sprout)
            .child(send),
    )
}
