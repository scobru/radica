//! The chat screen's colours and type, taken from Radica Messenger's "Radici Dark Soil"
//! palette (`ui/src/messengerChat.css`) so the native app and web Messenger share one UX.

use rune::tok::TextStyle;
use rune::{Color, oklch};

pub struct Palette {
    /// The conversation canvas (`--rm-bg-canvas`).
    pub bg: Color,
    /// The inbox sidebar and info drawer (`--rm-bg-inbox`).
    pub rail: Color,
    /// Elevated cards, inputs, pills (`--rm-bg-elevated`).
    pub surface: Color,
    pub surface_hover: Color,
    /// Subtle hover on inbox rows (`--rm-bg-subtle`).
    pub row_hover: Color,
    /// Outgoing message bubble (`--rm-bubble-mine`).
    pub own_row: Color,
    pub own_row_hover: Color,
    /// Incoming message bubble (`--rm-bubble-theirs`).
    pub bubble_theirs: Color,
    pub bubble_theirs_border: Color,
    /// Reply quote box inside bubbles (`--rm-bubble-theirs-quote` / `--rm-bubble-mine-quote`).
    pub quote_bg: Color,
    pub quote_mine_bg: Color,
    /// Community monogram amber (`--rm-amber-comm` / `--rm-amber-soft`).
    pub amber: Color,
    pub amber_soft: Color,
    pub line: Color,
    pub line_strong: Color,
    pub shadow: Color,
    /// Over the conversation behind a modal drawer.
    pub scrim: Color,
    pub text: Color,
    pub text_secondary: Color,
    pub text_muted: Color,
    pub quote: Color,
    pub accent: Color,
    /// Dark text on solid accent buttons (`--rm-on-accent`).
    pub on_accent: Color,
    /// The accent at 15% over dark surfaces (`--rm-accent-soft`).
    pub accent_soft: Color,
    pub accent_line: Color,
}

fn hex(s: &str) -> Color {
    rune::color::hex(s).expect("a valid colour")
}

pub fn palette() -> Palette {
    Palette {
        bg: hex("#0f0d0a"),
        rail: hex("#14110d"),
        surface: hex("#1d1913"),
        surface_hover: hex("#2b251c"),
        row_hover: hex("#221d16"),
        own_row: hex("#2b5417"),
        own_row_hover: hex("#32611b"),
        bubble_theirs: hex("#1e1a14"),
        bubble_theirs_border: hex("#2c261d"),
        quote_bg: hex("#27221a"),
        quote_mine_bg: hex("#1f3d10"),
        amber: hex("#e6a653"),
        amber_soft: hex("#2b2012"),
        line: hex("#2a241b"),
        line_strong: hex("#3a3226"),
        shadow: Color {
            r: 0.0,
            g: 0.0,
            b: 0.0,
            a: 0.45,
        },
        scrim: Color {
            r: 0.0,
            g: 0.0,
            b: 0.0,
            a: 0.55,
        },
        text: hex("#ede6da"),
        text_secondary: hex("#b8ae9e"),
        text_muted: hex("#857b6b"),
        quote: hex("#b8ae9e"),
        accent: hex("#8ec962"),
        on_accent: hex("#122009"),
        accent_soft: hex("#212f16"),
        accent_line: hex("#527a34"),
    }
}

pub const BRAND: TextStyle = TextStyle::new(18.0, 700.0).tracking(-0.18);
pub const ROOM: TextStyle = TextStyle::new(14.0, 500.0);
pub const ROOM_STRONG: TextStyle = TextStyle::new(14.0, 600.0);
pub const HEADER: TextStyle = TextStyle::new(16.0, 600.0).lh(22.0);
pub const HEADER_SMALL: TextStyle = TextStyle::new(14.5, 700.0);
pub const TITLE: TextStyle = TextStyle::new(17.0, 600.0);
pub const BODY: TextStyle = TextStyle::new(14.0, 400.0);
pub const NAME: TextStyle = TextStyle::new(13.5, 700.0);
pub const MESSAGE: TextStyle = TextStyle::new(14.5, 400.0).lh(21.0);
pub const QUOTE: TextStyle = TextStyle::new(12.5, 400.0).lh(17.0);
pub const SMALL: TextStyle = TextStyle::new(12.0, 400.0);
pub const SMALL_STRONG: TextStyle = TextStyle::new(12.0, 600.0);
pub const TAG: TextStyle = TextStyle::new(10.5, 700.0).tracking(0.25);
pub const GUTTER_TIME: TextStyle = TextStyle::new(11.0, 400.0);
pub const BADGE: TextStyle = TextStyle::new(11.0, 700.0);
pub const EMOJI: TextStyle = TextStyle::new(14.5, 400.0);
pub const MONOGRAM: TextStyle = TextStyle::new(14.0, 700.0);

pub fn avatar_colors(id: u32) -> (Color, Color) {
    let hue = id.wrapping_mul(7) % 10;
    let h = hue as f32 * 36.0;
    (oklch(0.42, 0.07, h), oklch(0.93, 0.045, h))
}

/// Distinct sender name colors inside incoming group bubbles (`SENDER_COLORS` in `messengerChat.ts`).
pub fn sender_color(id: u32) -> Color {
    const COLORS: [&str; 6] = [
        "#52b788", "#e6a653", "#63b3ed", "#b794f4", "#f687b3", "#f6ad55",
    ];
    hex(COLORS[(id as usize) % COLORS.len()])
}

/// Community or room monogram (`#R` for communities, `📢` for Feed, initials for groups).
pub fn room_monogram(key: &str, name: &str) -> String {
    if key.starts_with("feed") {
        return "📢".into();
    }
    let clean = name
        .trim_start_matches("📢")
        .trim_start_matches("#r/")
        .trim_start_matches("r/")
        .trim();
    let ch = clean
        .chars()
        .find(|c| c.is_alphanumeric())
        .unwrap_or('R')
        .to_ascii_uppercase();
    if key.starts_with("c_") {
        format!("#{ch}")
    } else {
        super::model::initials(clean)
    }
}
