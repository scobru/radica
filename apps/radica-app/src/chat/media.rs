//! Chat attachment tokens, as `ui/src/chatMedia.ts` writes and reads them:
//! `[radica-cm1:<kind>:<mime>:<hash>:<key>:<meta>(:<meta2>)]` inside a message's text. The hash names the sealed
//! blob on Radica's media contract, the key opens it (AES-256-GCM), so only who can read the message can open it.

/// What the web accepts as an image or audio type (`SAFE_IMAGE_MIMES`, `SAFE_AUDIO_MIMES`).
pub const SAFE_IMAGE_MIMES: [&str; 4] = ["image/webp", "image/jpeg", "image/png", "image/gif"];
pub const SAFE_AUDIO_MIMES: [&str; 6] = [
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/mpeg",
    "audio/wav",
    "audio/aac",
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MediaKind {
    Img,
    Voice,
    Audio,
    File,
}

impl MediaKind {
    fn as_str(self) -> &'static str {
        match self {
            MediaKind::Img => "img",
            MediaKind::Voice => "voice",
            MediaKind::Audio => "audio",
            MediaKind::File => "file",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct MediaItem {
    pub kind: MediaKind,
    pub mime: String,
    /// BLAKE3 of the sealed blob, 64 hex.
    pub hash: String,
    /// The AES-256-GCM key, 64 hex.
    pub key_hex: String,
    pub width: u32,
    pub height: u32,
    pub duration_sec: f32,
    pub size_bytes: u64,
    pub filename: String,
}

impl MediaItem {
    pub fn new(kind: MediaKind, mime: &str, hash: &str, key_hex: &str) -> Self {
        MediaItem {
            kind,
            mime: mime.to_owned(),
            hash: hash.to_owned(),
            key_hex: key_hex.to_owned(),
            width: 0,
            height: 0,
            duration_sec: 0.0,
            size_bytes: 0,
            filename: String::new(),
        }
    }

    /// The token for a message, like `encodeChatMediaToken`.
    pub fn token(&self) -> String {
        let (h, k, m) = (&self.hash, &self.key_hex, &self.mime);
        match self.kind {
            MediaKind::Img => format!(
                "[radica-cm1:img:{m}:{h}:{k}:{}x{}]",
                self.width.min(9999),
                self.height.min(9999)
            ),
            MediaKind::File => {
                let name: String = if self.filename.is_empty() {
                    "file".into()
                } else {
                    self.filename.chars().take(120).collect()
                };
                format!(
                    "[radica-cm1:file:{m}:{h}:{k}:{}:{}]",
                    self.size_bytes,
                    to_hex(name.as_bytes())
                )
            }
            kind => {
                let dur = (self.duration_sec.clamp(0.0, 3600.0) * 10.0).round() / 10.0;
                format!("[radica-cm1:{}:{m}:{h}:{k}:{dur}]", kind.as_str())
            }
        }
    }
}

fn is_hex(s: &str) -> bool {
    s.bytes().all(|c| c.is_ascii_hexdigit())
}

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn from_hex(s: &str) -> Option<Vec<u8>> {
    (s.len() % 2 == 0 && is_hex(s)).then(|| {
        (0..s.len())
            .step_by(2)
            .filter_map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok())
            .collect()
    })
}

/// One token's inside (between `[radica-cm1:` and `]`), checked as the web's `TOKEN_RE` and `parseMatchedToken` do.
fn parse_token(inner: &str) -> Option<MediaItem> {
    let parts: Vec<&str> = inner.split(':').collect();
    if !(5..=6).contains(&parts.len()) {
        return None;
    }
    let kind = match parts[0].to_ascii_lowercase().as_str() {
        "img" => MediaKind::Img,
        "voice" => MediaKind::Voice,
        "audio" => MediaKind::Audio,
        "file" => MediaKind::File,
        _ => return None,
    };
    let mime = parts[1].to_ascii_lowercase();
    let (hash, key) = (parts[2].to_ascii_lowercase(), parts[3].to_ascii_lowercase());
    let meta = parts[4].to_ascii_lowercase();
    let meta2 = parts.get(5).copied();
    let mime_ok = !mime.is_empty()
        && mime
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"/+.-".contains(&c));
    if !mime_ok
        || hash.len() != 64
        || key.len() != 64
        || !is_hex(&hash)
        || !is_hex(&key)
        || meta.is_empty()
        || !meta.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'.')
        || meta2.is_some_and(|m| m.is_empty() || !is_hex(m))
    {
        return None;
    }
    let mut item = MediaItem::new(kind, &mime, &hash, &key);
    match kind {
        MediaKind::Img => {
            if !SAFE_IMAGE_MIMES.contains(&mime.as_str()) {
                return None;
            }
            if let Some((w, h)) = meta.split_once('x')
                && let (Ok(w), Ok(h)) = (w.parse(), h.parse())
            {
                (item.width, item.height) = (w, h);
            }
        }
        MediaKind::File => {
            item.size_bytes = meta.parse().unwrap_or(0);
            item.filename = meta2
                .and_then(from_hex)
                .and_then(|b| String::from_utf8(b).ok())
                .unwrap_or_else(|| "file".into());
        }
        MediaKind::Voice | MediaKind::Audio => {
            if !SAFE_AUDIO_MIMES.contains(&mime.as_str()) {
                return None;
            }
            item.duration_sec = meta
                .parse()
                .ok()
                .filter(|d: &f32| (0.0..=3600.0).contains(d))?;
        }
    }
    Some(item)
}

/// The attachments in a message and the text left around them (`parseChatMedia`).
pub fn parse(text: &str) -> (Vec<MediaItem>, String) {
    const OPEN: &str = "[radica-cm1:";
    let (mut items, mut caption, mut rest) = (Vec::new(), String::new(), text);
    while let Some(start) = rest.find(OPEN) {
        let after = &rest[start + OPEN.len()..];
        let Some(end) = after.find(']') else { break };
        caption.push_str(&rest[..start]);
        match parse_token(&after[..end]) {
            Some(item) => items.push(item),
            None => caption.push_str(&rest[start..start + OPEN.len() + end + 1]),
        }
        rest = &after[end + 1..];
    }
    caption.push_str(rest);
    (items, caption.trim().to_owned())
}

/// A one-line stand-in for previews and reply quotes (`summarizeChatMediaText`).
pub fn summary(text: &str) -> String {
    let (items, caption) = parse(text);
    let Some(first) = items.first() else {
        return text.to_owned();
    };
    let label = match first.kind {
        MediaKind::Img => "📷 Photo".to_owned(),
        MediaKind::Voice => "🎤 Voice message".to_owned(),
        MediaKind::Audio => "🎵 Audio".to_owned(),
        MediaKind::File => format!("📎 {}", first.filename),
    };
    if caption.is_empty() {
        label
    } else {
        format!("{label} · {caption}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const H: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const K: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    #[test]
    fn tokens_round_trip_like_the_web() {
        let mut img = MediaItem::new(MediaKind::Img, "image/png", H, K);
        (img.width, img.height) = (640, 480);
        let mut file = MediaItem::new(MediaKind::File, "application/pdf", H, K);
        (file.size_bytes, file.filename) = (1234, "conti.pdf".into());
        let mut voice = MediaItem::new(MediaKind::Voice, "audio/ogg", H, K);
        voice.duration_sec = 12.5;
        let text = format!(
            "guarda {} e {} {}",
            img.token(),
            file.token(),
            voice.token()
        );
        assert_eq!(
            file.token(),
            format!("[radica-cm1:file:application/pdf:{H}:{K}:1234:636f6e74692e706466]")
        );
        let (items, caption) = parse(&text);
        assert_eq!(items, vec![img, file, voice]);
        assert_eq!(caption, "guarda  e");
        assert_eq!(
            summary(&format!("[radica-cm1:img:image/png:{H}:{K}:0x0]")),
            "📷 Photo"
        );
    }

    #[test]
    fn the_web_s_webp_photos_decode() {
        // the web sends chat photos as WebP; Rune finds the format from the bytes
        let mut webp = Vec::new();
        image::codecs::webp::WebPEncoder::new_lossless(&mut webp)
            .encode(
                &[255, 0, 0, 255, 0, 255, 0, 255],
                2,
                1,
                image::ExtendedColorType::Rgba8,
            )
            .unwrap();
        let img = image::ImageReader::new(std::io::Cursor::new(&webp))
            .with_guessed_format()
            .unwrap()
            .decode()
            .unwrap();
        assert_eq!((img.width(), img.height()), (2, 1));
    }

    #[test]
    fn unsafe_or_malformed_tokens_stay_text() {
        for bad in [
            format!("[radica-cm1:img:image/svg+xml:{H}:{K}:1x1]"),
            format!("[radica-cm1:audio:audio/x-evil:{H}:{K}:3]"),
            format!("[radica-cm1:img:image/png:{}:{K}:1x1]", &H[..60]),
            format!("[radica-cm1:exe:image/png:{H}:{K}:1x1]"),
        ] {
            let (items, caption) = parse(&bad);
            assert!(items.is_empty(), "{bad}");
            assert_eq!(caption, bad);
        }
    }
}
