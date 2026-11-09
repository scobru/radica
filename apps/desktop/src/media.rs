//! Chat attachments on the node, like `ui/src/chatMedia.ts`: each blob is sealed with the attachment's AES-256-GCM key
//! (a fresh IV first) and published to Radica's content-addressed media contract (`media-contract/`, ≤ 768 KB).
//! Bigger files are split into sealed chunks named by a sealed manifest.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use radica_app::chat::media::{MediaItem, MediaKind};
use serde_json::Value;

use crate::{host, live};

const MEDIA_CODE: &[u8] = include_bytes!("../../../ui/src/wasm/media.wasm");
const MEDIA_CODE_HASH: &str = "393faa96c8109d08700643c3bc419266dce25a0f380db6e16ce4ee6a125d0762";
/// `MAX_MEDIA` in media-contract/src/lib.rs, and the plain bytes that fit once sealed (12-byte IV + 16-byte tag).
const MAX_SEALED: usize = 768 * 1024;
const MAX_PLAIN: usize = MAX_SEALED - 28;
pub const MAX_FILE: usize = 25 * 1024 * 1024;
const CHUNKS_MAGIC: &[u8] = b"radica-chunks1\n";
const FEC_MAGIC: &[u8] = b"radica-fec1\n";

fn hash_of(bytes: &[u8]) -> String {
    blake3::hash(bytes).to_hex().to_string()
}

fn key32(key_hex: &str) -> Option<[u8; 32]> {
    hex::decode(key_hex).ok()?.try_into().ok()
}

fn seal(plain: &[u8], key: &[u8; 32]) -> Option<Vec<u8>> {
    let iv: [u8; 12] = live::entropy_32("radica-media-iv")[..12].try_into().ok()?;
    let mut out = iv.to_vec();
    out.extend(live::aes_gcm_encrypt(key, &iv, plain)?);
    Some(out)
}

/// The plain bytes, if `sealed` is what `hash` names and `key` opens it (`openChatMedia`).
fn open(sealed: &[u8], hash: &str, key: &[u8; 32]) -> Option<Vec<u8>> {
    if sealed.len() <= 28 || sealed.len() > MAX_SEALED || hash_of(sealed) != hash {
        return None;
    }
    live::aes_gcm_decrypt(key, sealed[..12].try_into().ok()?, &sealed[12..])
}

fn contract_key(hash: &str) -> Option<String> {
    Some(live::contract_key(
        MEDIA_CODE_HASH,
        &hex::decode(hash).ok().filter(|h| h.len() == 32)?,
    ))
}

fn temp_with(bytes: &[u8]) -> Result<tempfile::NamedTempFile, String> {
    let tmp = tempfile::NamedTempFile::new().map_err(|e| e.to_string())?;
    fs::write(tmp.path(), bytes).map_err(|e| e.to_string())?;
    Ok(tmp)
}

/// Publish one sealed blob; its BLAKE3 hash is both its address and its contract's parameters.
fn put_blob(sealed: &[u8]) -> Result<String, String> {
    let hash = hash_of(sealed);
    let code = temp_with(MEDIA_CODE)?;
    let params = temp_with(&hex::decode(&hash).map_err(|e| e.to_string())?)?;
    let state = temp_with(sealed)?;
    let mut cmd = Command::new(live::find_fdev());
    cmd.args(["execute", "put", "--timeout", "60", "--code"])
        .arg(code.path())
        .arg("--parameters")
        .arg(params.path())
        .args(["contract", "--state"])
        .arg(state.path());
    // a node can miss a put the first time; the web tries each blob twice as well
    host::run(&mut cmd).or_else(|_| host::run(&mut cmd))?;
    Ok(hash)
}

fn get_blob(hash: &str) -> Option<Vec<u8>> {
    let key = contract_key(hash)?;
    let tmp = tempfile::NamedTempFile::new().ok()?;
    let mut cmd = Command::new(live::find_fdev());
    cmd.args(["execute", "get", "--timeout", "10", "-o"])
        .arg(tmp.path())
        .arg(&key);
    host::run(&mut cmd).ok()?;
    fs::read(tmp.path()).ok().filter(|b| hash_of(b) == hash)
}

/// Seal and publish `plain`, split into chunks when it does not fit one blob. Returns the hash and key that name it.
/// shortcut: big files go out with the plain chunk manifest the web still reads (`radica-chunks1`), without the
/// Reed-Solomon parity shards the web adds (`radica-fec1`); add them if lost chunks show up in practice.
pub fn upload(plain: &[u8]) -> Result<(String, String), String> {
    if plain.is_empty() {
        return Err("The file is empty".into());
    }
    if plain.len() > MAX_FILE {
        return Err(format!(
            "The file is over the {} MB chat attachment limit",
            MAX_FILE / 1024 / 1024
        ));
    }
    let key = live::entropy_32("radica-media-key");
    let sealed =
        |bytes: &[u8]| seal(bytes, &key).ok_or_else(|| "Could not seal the attachment".to_owned());
    let hash = if plain.len() <= MAX_PLAIN {
        put_blob(&sealed(plain)?)?
    } else {
        let mut manifest = CHUNKS_MAGIC.to_vec();
        let hashes = plain
            .chunks(MAX_PLAIN)
            .map(|chunk| put_blob(&sealed(chunk)?))
            .collect::<Result<Vec<_>, _>>()?;
        manifest.extend(hashes.join("\n").into_bytes());
        put_blob(&sealed(&manifest)?)?
    };
    Ok((hash, hex::encode(key)))
}

/// What a fetched manifest (or blob) opens to: the file, its chunks joined.
fn assemble(
    plain: Vec<u8>,
    key: &[u8; 32],
    get: &dyn Fn(&str) -> Option<Vec<u8>>,
) -> Option<Vec<u8>> {
    let part = |h: &str| {
        get(h)
            .and_then(|s| open(&s, h, key))
            .or_else(|| get(h).and_then(|s| open(&s, h, key)))
    };
    if let Some(json) = plain.strip_prefix(FEC_MAGIC) {
        // freenet-blob's code is systematic: the first k shards are the file. shortcut: no Reed-Solomon recovery, so a
        // lost data shard loses the file; port freenet-blob's decoder if that shows up.
        let m: Value = serde_json::from_slice(json).ok()?;
        let (k, shard, size) = (
            m["k"].as_u64()? as usize,
            m["shardSize"].as_u64()? as usize,
            m["originalSize"].as_u64()? as usize,
        );
        let hashes = m["hashes"].as_array()?;
        if k > hashes.len() || size > MAX_FILE || k.checked_mul(shard)? < size {
            return None;
        }
        let mut out = Vec::with_capacity(size);
        for h in &hashes[..k] {
            let mut p = part(h.as_str()?)?;
            p.truncate(shard);
            out.extend(p);
        }
        out.truncate(size);
        return Some(out);
    }
    let Some(list) = plain.strip_prefix(CHUNKS_MAGIC) else {
        return Some(plain);
    };
    let mut out = Vec::new();
    for h in std::str::from_utf8(list).ok()?.split('\n') {
        if h.len() != 64 || out.len() > MAX_FILE {
            return None;
        }
        out.extend(part(h)?);
    }
    (out.len() <= MAX_FILE).then_some(out)
}

/// Fetch and open an attachment from the node.
pub fn fetch(hash: &str, key_hex: &str) -> Option<Vec<u8>> {
    let key = key32(key_hex)?;
    let plain = open(&get_blob(hash)?, hash, &key)?;
    assemble(plain, &key, &get_blob)
}

/// Where opened attachments are kept on this device: Radica's private data dir, by hash (the UI reads them there).
pub fn dir() -> Option<PathBuf> {
    live::data_dir().map(|d| d.join("media"))
}

/// Keep `plain` as the attachment `hash` names, so it shows at once (what I send, or what I fetched).
pub fn keep(hash: &str, plain: &[u8]) {
    if let Some(d) = dir() {
        live::make_private_dir(&d);
        let _ = fs::write(d.join(hash), plain);
    }
}

/// Fetch the attachments named in `texts` that are not here yet, newest first, at most `budget` per call.
pub fn fetch_missing<'a>(texts: impl Iterator<Item = &'a str>, budget: usize) {
    let Some(d) = dir() else { return };
    let mut wanted: Vec<MediaItem> = Vec::new();
    for t in texts {
        for item in radica_app::chat::media::parse(t).0 {
            if !d.join(&item.hash).exists() && !wanted.iter().any(|w| w.hash == item.hash) {
                wanted.push(item);
            }
        }
    }
    std::thread::scope(|s| {
        for item in wanted.iter().take(budget) {
            s.spawn(move || {
                if let Some(plain) = fetch(&item.hash, &item.key_hex) {
                    keep(&item.hash, &plain);
                }
            });
        }
    });
}

/// What a file is, from its extension: an image or audio type the web shows inline, else a plain file.
pub fn kind_of(path: &Path) -> (MediaKind, String) {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let image = match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        _ => None,
    };
    let audio = match ext.as_str() {
        "mp3" => Some("audio/mpeg"),
        "ogg" | "oga" | "opus" => Some("audio/ogg"),
        "m4a" => Some("audio/mp4"),
        "webm" => Some("audio/webm"),
        "wav" => Some("audio/wav"),
        "aac" => Some("audio/aac"),
        _ => None,
    };
    match (image, audio) {
        (Some(m), _) => (MediaKind::Img, m.into()),
        (_, Some(m)) => (MediaKind::Audio, m.into()),
        _ => (
            MediaKind::File,
            if ext == "pdf" {
                "application/pdf".into()
            } else {
                "application/octet-stream".into()
            },
        ),
    }
}

/// Send `path` as an attachment: seal, publish, keep a copy here, and return the message token.
pub fn send_file(path: &Path) -> Result<String, String> {
    let plain = fs::read(path).map_err(|e| format!("Could not read the file: {e}"))?;
    let (hash, key_hex) = upload(&plain)?;
    keep(&hash, &plain);
    let (kind, mime) = kind_of(path);
    let mut item = MediaItem::new(kind, &mime, &hash, &key_hex);
    item.size_bytes = plain.len() as u64;
    item.filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file")
        .to_owned();
    Ok(item.token())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn bundled_code_is_the_media_contract_the_web_uses() {
        assert_eq!(hash_of(MEDIA_CODE), MEDIA_CODE_HASH);
    }

    #[test]
    fn sealed_blobs_open_only_with_their_hash_and_key() {
        let key = [9u8; 32];
        let sealed = seal(b"ciao", &key).unwrap();
        let h = hash_of(&sealed);
        assert_eq!(open(&sealed, &h, &key).unwrap(), b"ciao");
        assert!(open(&sealed, &h, &[8u8; 32]).is_none());
        assert!(open(&sealed, &"0".repeat(64), &key).is_none());
    }

    /// A store standing in for the media contract.
    fn store(blobs: &[Vec<u8>]) -> HashMap<String, Vec<u8>> {
        blobs.iter().map(|b| (hash_of(b), b.clone())).collect()
    }

    #[test]
    fn chunked_and_fec_manifests_assemble() {
        let key = [3u8; 32];
        let file: Vec<u8> = (0..2500u32).map(|i| (i % 251) as u8).collect();
        let chunks: Vec<Vec<u8>> = file.chunks(1000).map(|c| seal(c, &key).unwrap()).collect();
        let hashes: Vec<String> = chunks.iter().map(|c| hash_of(c)).collect();
        let s = store(&chunks);
        let get = |h: &str| s.get(h).cloned();

        let mut linear = CHUNKS_MAGIC.to_vec();
        linear.extend(hashes.join("\n").into_bytes());
        assert_eq!(assemble(linear, &key, &get).unwrap(), file);

        // the web's FEC manifest: data shards padded to shardSize, then parity (here a dummy one)
        let mut padded = file.clone();
        padded.resize(3000, 0);
        let mut shards: Vec<Vec<u8>> = padded
            .chunks(1000)
            .map(|c| seal(c, &key).unwrap())
            .collect();
        shards.push(seal(&[0u8; 1000], &key).unwrap());
        let s = store(&shards);
        let get = |h: &str| s.get(h).cloned();
        let hs: Vec<String> = shards.iter().map(|c| hash_of(c)).collect();
        let manifest = serde_json::json!({ "k": 3, "m": 1, "total": 4, "shardSize": 1000, "originalSize": 2500, "hashes": hs });
        let mut fec = FEC_MAGIC.to_vec();
        fec.extend(manifest.to_string().into_bytes());
        assert_eq!(assemble(fec, &key, &get).unwrap(), file);

        assert_eq!(assemble(b"plain".to_vec(), &key, &get).unwrap(), b"plain");
    }
}
