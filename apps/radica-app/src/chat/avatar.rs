//! Deterministic, offline avatar generation and data URI decoding for Radica.
//! Matches Radica Web's `ui/src/avatar.ts` 1:1.

use base64::Engine;

/// Generates a deterministic SVG identicon matching Radica Web's `generateDefaultAvatar(seed)`.
pub fn generate_default_avatar_svg(seed: &str) -> String {
    let safe_seed = if seed.trim().is_empty() {
        "radica"
    } else {
        seed.trim()
    };

    let mut hash: i32 = 0;
    for b in safe_seed.as_bytes() {
        hash = (hash << 5).wrapping_sub(hash).wrapping_add(*b as i32);
    }
    let abs_hash = hash.unsigned_abs();

    let hue1 = abs_hash % 360;
    let hue2 = (hue1 + 40 + (abs_hash % 80)) % 360;
    let hue3 = (hue1 + 180) % 360;

    let color1 = format!("hsl({hue1}, 78%, 48%)");
    let color2 = format!("hsl({hue2}, 85%, 32%)");
    let color3 = format!("hsl({hue3}, 75%, 58%)");

    let cx1 = 20 + (abs_hash % 35);
    let cy1 = 20 + ((abs_hash >> 3) % 35);
    let r1 = 25 + ((abs_hash >> 5) % 20);

    let cx2 = 65 + ((abs_hash >> 7) % 25);
    let cy2 = 65 + ((abs_hash >> 9) % 25);
    let r2 = 20 + ((abs_hash >> 11) % 20);

    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="g_{abs_hash}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{color1}"/>
      <stop offset="100%" stop-color="{color2}"/>
    </linearGradient>
    <clipPath id="c_{abs_hash}">
      <circle cx="50" cy="50" r="50"/>
    </clipPath>
  </defs>
  <g clip-path="url(#c_{abs_hash})">
    <rect width="100" height="100" fill="url(#g_{abs_hash})"/>
    <circle cx="{cx1}" cy="{cy1}" r="{r1}" fill="{color3}" opacity="0.35"/>
    <circle cx="{cx2}" cy="{cy2}" r="{r2}" fill="#ffffff" opacity="0.2"/>
    <circle cx="50" cy="38" r="16" fill="#ffffff" opacity="0.94"/>
    <ellipse cx="50" cy="82" rx="28" ry="20" fill="#ffffff" opacity="0.94"/>
  </g>
</svg>"##
    )
}

/// Decodes an avatar URI string into `(image_bytes, is_svg)`.
/// Supports:
/// - Data URIs: `data:image/jpeg;base64,...`, `data:image/png;base64,...`, `data:image/svg+xml;base64,...`
/// - UTF-8 SVG data URIs: `data:image/svg+xml;utf8,...`
/// - Raw SVG strings `<svg...`
/// - Plain base64 strings
pub fn decode_avatar_uri(uri: &str) -> Option<(Vec<u8>, bool)> {
    let raw = uri.trim();
    if raw.is_empty() {
        return None;
    }
    if raw.starts_with("<svg") {
        return Some((raw.as_bytes().to_vec(), true));
    }
    if let Some(rest) = raw.strip_prefix("data:image/svg+xml;utf8,") {
        let decoded = urlencoding_decode(rest);
        return Some((decoded.into_bytes(), true));
    }
    if let Some(rest) = raw.strip_prefix("data:image/svg+xml;base64,") {
        let clean = rest.trim();
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(clean)
            .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(clean))
            .ok()?;
        return Some((bytes, true));
    }
    if let Some(idx) = raw.find(";base64,") {
        let b64 = raw[idx + 8..].trim();
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(b64)
            .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(b64))
            .ok()?;
        let is_svg = raw.contains("image/svg+xml")
            || bytes.starts_with(b"<svg")
            || bytes.starts_with(b"<?xml");
        return Some((bytes, is_svg));
    }
    if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(raw) {
        let is_svg = bytes.starts_with(b"<svg") || bytes.starts_with(b"<?xml");
        return Some((bytes, is_svg));
    }
    None
}

fn urlencoding_decode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '%' {
            let h1 = chars.next();
            let h2 = chars.next();
            if let (Some(c1), Some(c2)) = (h1, h2) {
                let hex_str = format!("{c1}{c2}");
                if let Ok(byte) = u8::from_str_radix(&hex_str, 16) {
                    out.push(byte as char);
                    continue;
                }
            }
        }
        out.push(c);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deterministic_avatar_svg_contains_persona_silhouette() {
        let svg = generate_default_avatar_svg("Agent.69");
        assert!(svg.contains("<svg"));
        assert!(svg.contains("ellipse cx=\"50\" cy=\"82\""));
        assert!(svg.contains("linearGradient"));
    }

    #[test]
    fn decode_avatar_base64_data_uri() {
        let raw = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=";
        let (bytes, is_svg) = decode_avatar_uri(raw).expect("decodes");
        assert!(is_svg);
        assert_eq!(String::from_utf8(bytes).unwrap(), "<svg></svg>");
    }
}
