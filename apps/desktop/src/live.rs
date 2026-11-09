//! Live Freenet contract sync & signed message publishing for Radica desktop.
//!
//! Queries and updates Radica's real `log-contract` (`communities`, `directory`,
//! `community-chat/<id>`) and `feed-contract` (`feed:<pubkey>`) on the local Freenet node
//! (`127.0.0.1:7509`), using the exact same BLAKE3 contract keys and Ed25519 signature formats
//! as the web dApp (`ui/src/network.ts`, `ui/src/crypto.ts`, `log-contract/src/lib.rs`).
// ponytail: reuses `fdev execute get/update` + pure-Rust blake3/ed25519-dalek without pulling heavy async ws stacks

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use radica_app::chat::{Member, Message, Reaction, ReplyTo, Role, Room};
use radica_app::{IdentityInfo, LiveAction, LiveSnapshot};
use ring::aead::{AES_256_GCM, Aad, LessSafeKey, Nonce, UnboundKey};
use serde_json::{Value, json};

use crate::host;

static WIRE_IDS: OnceLock<Mutex<HashMap<(String, u32), String>>> = OnceLock::new();
static PEER_PUBKEYS: OnceLock<Mutex<HashMap<u32, String>>> = OnceLock::new();
static PEER_ENC_PUBS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn wire_ids() -> &'static Mutex<HashMap<(String, u32), String>> {
    WIRE_IDS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn peer_pubkeys() -> &'static Mutex<HashMap<u32, String>> {
    PEER_PUBKEYS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn peer_enc_pubs() -> &'static Mutex<HashMap<String, String>> {
    PEER_ENC_PUBS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn remember_wire_id(room_key: &str, num_id: u32, str_id: &str) {
    if let Ok(mut map) = wire_ids().lock() {
        map.insert((room_key.to_owned(), num_id), str_id.to_owned());
    }
}

fn lookup_wire_id(room_key: &str, num_id: u32) -> Option<String> {
    wire_ids()
        .lock()
        .ok()
        .and_then(|m| m.get(&(room_key.to_owned(), num_id)).cloned())
}

fn remember_peer(id: u32, pubkey: &str) {
    if let Ok(mut map) = peer_pubkeys().lock() {
        map.insert(id, pubkey.to_owned());
    }
}

fn lookup_peer(id: u32) -> Option<String> {
    peer_pubkeys().lock().ok().and_then(|m| m.get(&id).cloned())
}

fn remember_peer_enc_pub(pubkey: &str, enc_pub: &str) {
    if enc_pub.len() == 64
        && let Ok(mut map) = peer_enc_pubs().lock()
    {
        map.insert(pubkey.to_owned(), enc_pub.to_owned());
    }
}

fn lookup_peer_enc_pub(pubkey: &str) -> String {
    peer_enc_pubs()
        .lock()
        .ok()
        .and_then(|m| m.get(pubkey).cloned())
        .unwrap_or_else(|| pubkey.to_owned())
}

#[derive(Clone, Debug)]
struct StoredPrivateRoom {
    id: String,
    name: String,
    key_hex: String,
    creator: String,
}

fn private_rooms_path() -> Option<PathBuf> {
    directories::ProjectDirs::from("", "Freenet", "Radica")
        .map(|d| d.data_local_dir().join("private-rooms.json"))
}

fn load_private_rooms() -> Vec<StoredPrivateRoom> {
    let Some(p) = private_rooms_path() else {
        return Vec::new();
    };
    let Ok(raw) = fs::read_to_string(p) else {
        return Vec::new();
    };
    let Ok(arr) = serde_json::from_str::<Vec<Value>>(&raw) else {
        return Vec::new();
    };
    arr.into_iter()
        .filter_map(|v| {
            Some(StoredPrivateRoom {
                id: v.get("id")?.as_str()?.to_owned(),
                name: v.get("name")?.as_str()?.to_owned(),
                key_hex: v.get("key_hex")?.as_str()?.to_owned(),
                creator: v
                    .get("creator")
                    .and_then(Value::as_str)
                    .unwrap_or(MAINTAINER_PK)
                    .to_owned(),
            })
        })
        .collect()
}

fn save_private_room(room: &StoredPrivateRoom) {
    let Some(p) = private_rooms_path() else {
        return;
    };
    let mut list = load_private_rooms();
    if let Some(existing) = list.iter_mut().find(|r| r.id == room.id) {
        *existing = room.clone();
    } else {
        list.push(room.clone());
    }
    let val: Vec<Value> = list
        .iter()
        .map(|r| {
            json!({
                "id": r.id,
                "name": r.name,
                "key_hex": r.key_hex,
                "creator": r.creator,
            })
        })
        .collect();
    if let Some(parent) = p.parent() {
        make_private_dir(parent);
    }
    let _ = fs::write(p, serde_json::to_string_pretty(&val).unwrap_or_default());
}

fn remove_private_room(room_id: &str) {
    let Some(p) = private_rooms_path() else {
        return;
    };
    let mut list = load_private_rooms();
    let prev_len = list.len();
    list.retain(|r| r.id != room_id);
    if list.len() != prev_len {
        let val: Vec<Value> = list
            .iter()
            .map(|r| {
                json!({
                    "id": r.id,
                    "name": r.name,
                    "key_hex": r.key_hex,
                    "creator": r.creator,
                })
            })
            .collect();
        let _ = fs::write(p, serde_json::to_string_pretty(&val).unwrap_or_default());
    }
}

fn following_path() -> Option<PathBuf> {
    directories::ProjectDirs::from("", "Freenet", "Radica")
        .map(|d| d.data_local_dir().join("following.json"))
}

fn load_following() -> BTreeSet<String> {
    let Some(p) = following_path() else {
        return BTreeSet::new();
    };
    let Ok(raw) = fs::read_to_string(p) else {
        return BTreeSet::new();
    };
    serde_json::from_str::<Vec<String>>(&raw)
        .unwrap_or_default()
        .into_iter()
        .collect()
}

fn save_following(set: &BTreeSet<String>) {
    let Some(p) = following_path() else {
        return;
    };
    if let Some(parent) = p.parent() {
        make_private_dir(parent);
    }
    let vec: Vec<&String> = set.iter().collect();
    let _ = fs::write(p, serde_json::to_string(&vec).unwrap_or_default());
}

// -----------------------------------------------------------------------------
// X25519 ECDH + AES-256-GCM End-to-End Encryption (`e2e:` & `sym:`)
// Matches `getSharedKey`, `encryptDirectMessage`, `decryptDirectMessage`,
// `encryptWithSymmetricKey` & `decryptWithSymmetricKey` in `ui/src/crypto.ts`.
// -----------------------------------------------------------------------------

/// Compute the 32-byte X25519 shared secret between an Ed25519 32-byte seed (`my_seed`) and a
/// peer's 64-hex Ed25519 public key (`peer_pubkey_hex`), matching `@noble/curves/ed25519`.
pub fn x25519_shared_secret(my_seed: &[u8; 32], peer_pubkey_hex: &str) -> Option<[u8; 32]> {
    let peer_bytes = hex::decode(peer_pubkey_hex).ok()?;
    let peer_arr: [u8; 32] = peer_bytes.as_slice().try_into().ok()?;
    let vk = VerifyingKey::from_bytes(&peer_arr).ok()?;
    let peer_mont = vk.to_montgomery();
    let sk = SigningKey::from_bytes(my_seed);
    let my_scalar = sk.to_scalar_bytes();
    Some(peer_mont.mul_clamped(my_scalar).to_bytes())
}

fn aes_gcm_encrypt(key_bytes: &[u8; 32], iv: &[u8; 12], plaintext: &[u8]) -> Option<Vec<u8>> {
    let unbound = UnboundKey::new(&AES_256_GCM, key_bytes).ok()?;
    let key = LessSafeKey::new(unbound);
    let nonce = Nonce::assume_unique_for_key(*iv);
    let mut in_out = plaintext.to_vec();
    key.seal_in_place_append_tag(nonce, Aad::empty(), &mut in_out)
        .ok()?;
    Some(in_out)
}

fn aes_gcm_decrypt(
    key_bytes: &[u8; 32],
    iv: &[u8; 12],
    ciphertext_and_tag: &[u8],
) -> Option<Vec<u8>> {
    let unbound = UnboundKey::new(&AES_256_GCM, key_bytes).ok()?;
    let key = LessSafeKey::new(unbound);
    let nonce = Nonce::assume_unique_for_key(*iv);
    let mut in_out = ciphertext_and_tag.to_vec();
    let plain = key.open_in_place(nonce, Aad::empty(), &mut in_out).ok()?;
    Some(plain.to_vec())
}

fn random_iv_12(tag: &str) -> [u8; 12] {
    let full = entropy_32(tag);
    let mut iv = [0u8; 12];
    iv.copy_from_slice(&full[..12]);
    iv
}

pub fn encrypt_direct_message_with_iv(
    my_seed: &[u8; 32],
    peer_pubkey_hex: &str,
    iv: &[u8; 12],
    plaintext: &str,
) -> Option<String> {
    let shared = x25519_shared_secret(my_seed, peer_pubkey_hex)?;
    let ct = aes_gcm_encrypt(&shared, iv, plaintext.as_bytes())?;
    Some(format!("e2e:{}:{}", hex::encode(iv), hex::encode(ct)))
}

pub fn encrypt_direct_message(
    my_seed: &[u8; 32],
    peer_pubkey_hex: &str,
    plaintext: &str,
) -> Option<String> {
    let iv = random_iv_12("radica-e2e-dm-iv");
    encrypt_direct_message_with_iv(my_seed, peer_pubkey_hex, &iv, plaintext)
}

pub fn decrypt_direct_message(
    my_seed: &[u8; 32],
    peer_pubkey_hex: &str,
    text: &str,
) -> Option<String> {
    let rest = text.strip_prefix("e2e:")?;
    let (iv_hex, ct_hex) = rest.split_once(':')?;
    let iv_bytes = hex::decode(iv_hex).ok()?;
    let iv: [u8; 12] = iv_bytes.as_slice().try_into().ok()?;
    let ct = hex::decode(ct_hex).ok()?;
    let shared = x25519_shared_secret(my_seed, peer_pubkey_hex)?;
    let plain = aes_gcm_decrypt(&shared, &iv, &ct)?;
    String::from_utf8(plain).ok()
}

pub fn encrypt_with_symmetric_key(key_bytes: &[u8; 32], plaintext: &str) -> Option<String> {
    let iv = random_iv_12("radica-sym-room-iv");
    let ct = aes_gcm_encrypt(key_bytes, &iv, plaintext.as_bytes())?;
    Some(format!("sym:{}:{}", hex::encode(iv), hex::encode(ct)))
}

pub fn decrypt_with_symmetric_key(key_bytes: &[u8; 32], text: &str) -> Option<String> {
    let rest = text.strip_prefix("sym:")?;
    let (iv_hex, ct_hex) = rest.split_once(':')?;
    let iv_bytes = hex::decode(iv_hex).ok()?;
    let iv: [u8; 12] = iv_bytes.as_slice().try_into().ok()?;
    let ct = hex::decode(ct_hex).ok()?;
    let plain = aes_gcm_decrypt(key_bytes, &iv, &ct)?;
    String::from_utf8(plain).ok()
}

fn joined_communities_path() -> Option<PathBuf> {
    directories::ProjectDirs::from("", "Freenet", "Radica")
        .map(|d| d.data_local_dir().join("joined-communities.json"))
}

fn load_extra_communities() -> Vec<String> {
    let Some(p) = joined_communities_path() else {
        return Vec::new();
    };
    let Ok(raw) = fs::read_to_string(p) else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<String>>(&raw).unwrap_or_default()
}

fn remember_joined_community(comm_id: &str) {
    let Some(p) = joined_communities_path() else {
        return;
    };
    let mut list = load_extra_communities();
    if !list.iter().any(|x| x == comm_id) {
        list.push(comm_id.to_owned());
        if let Some(parent) = p.parent() {
            make_private_dir(parent);
        }
        let _ = fs::write(p, serde_json::to_string(&list).unwrap_or_default());
    }
}

fn remove_extra_community(comm_id: &str) {
    let Some(p) = joined_communities_path() else {
        return;
    };
    let mut list = load_extra_communities();
    let prev_len = list.len();
    list.retain(|id| id != comm_id);
    if list.len() != prev_len {
        let _ = fs::write(p, serde_json::to_string(&list).unwrap_or_default());
    }
}

/// Canonical Radica web container path bound into every contract's parameters.
pub const APP_PATH: &str = "/v1/contract/web/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/";

/// Official Viso sovereign identity web contract on Freenet (`ui/src/whoiam.ts`).
pub const VISO_KEY: &str = "GzHy3jnEtj26EoGqMsBpoawcY378hK9kp91rTcNYiAac";

/// Current `log-contract` (`ui/src/wasm/log.wasm`) BLAKE3 code hash (`ui/src/legacy.ts`).
pub const LOG_CODE_HASH: &str = "4c17282a893595cb167387b785554e0bd100990d8b2a14a3fea290d65e306437";

/// Current `feed-contract` (`ui/src/wasm/contract.wasm`) BLAKE3 code hash (`ui/src/legacy.ts`).
pub const FEED_CODE_HASH: &str = "6eed3cbfb9e9931660dc86c13834a1e24c4e14e547cd66cd2eb1f7a59950d5b6";

/// Radica maintainer public key (Scobru).
pub const MAINTAINER_PK: &str = "464b576da4cc5bcf31febd41a863ac251d04024c19f1786b24ca6620a0cce53b";

/// The reactions a message can get, same closed set as the web (`CHAT_REACTIONS` in `ui/src/logfold.ts`),
/// so a log entry cannot put arbitrary text on someone's message.
const CHAT_REACTIONS: [&str; 16] = [
    "👍", "❤️", "😂", "👀", "🔥", "😮", "😢", "😡", "🎉", "🤔", "👏", "✅", "💯", "🙏", "😍", "🥳",
];

/// Defaultcommunities to sync from the live Freenet network.
const SYNC_COMMUNITIES: &[(&str, &str, &str)] = &[
    (
        "c_radica",
        "Radica Hub",
        "Decentralized social commons, Freenet dApps, and network updates.",
    ),
    ("c_freenet", "Freenet", "Talking about Freenet stuff."),
    (
        "c_radicatester",
        "radicatester",
        "Suggest features and report bugs in Radica together.",
    ),
    (
        "c_tech",
        "Tech & P2P",
        "Peer-to-peer protocols, cryptography, and Web3 decentralization.",
    ),
    ("c_italy", "Italy", "All about Italy!"),
    ("c_music", "Music", "All about music!"),
];

const B58: &[u8; 58] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/// Bitcoin-alphabet Base58 encoding, matching `toBase58` in `ui/src/whoiam.ts`.
pub fn to_base58(bytes: &[u8]) -> String {
    let mut digits: Vec<u8> = Vec::new();
    for &b in bytes {
        let mut carry = u32::from(b);
        for d in &mut digits {
            carry += u32::from(*d) << 8;
            *d = (carry % 58) as u8;
            carry /= 58;
        }
        while carry > 0 {
            digits.push((carry % 58) as u8);
            carry /= 58;
        }
    }
    let mut out = String::new();
    for &b in bytes {
        if b != 0 {
            break;
        }
        out.push('1');
    }
    for &d in digits.iter().rev() {
        out.push(B58[d as usize] as char);
    }
    out
}

/// Compute `BLAKE3(code_hash || params)` in Base58, matching `contractKey` in `ui/src/network.ts`.
pub fn contract_key(code_hash_hex: &str, params: &[u8]) -> String {
    let code_hash = hex::decode(code_hash_hex).expect("valid 32-byte code hash hex");
    let mut hasher = blake3::Hasher::new();
    hasher.update(&code_hash);
    hasher.update(params);
    to_base58(hasher.finalize().as_bytes())
}

pub fn log_params(log_name: &str) -> String {
    format!("radica/{log_name}|{APP_PATH}")
}

pub fn log_contract_key(log_name: &str) -> String {
    contract_key(LOG_CODE_HASH, log_params(log_name).as_bytes())
}

pub fn feed_contract_key(pubkey_hex: &str) -> Option<String> {
    let mut params = hex::decode(pubkey_hex).ok()?;
    params.extend_from_slice(APP_PATH.as_bytes());
    Some(contract_key(FEED_CODE_HASH, &params))
}

fn find_fdev() -> PathBuf {
    let bin = if cfg!(windows) { "fdev.exe" } else { "fdev" };
    if let Some(localappdata) = std::env::var_os("LOCALAPPDATA") {
        let p = PathBuf::from(localappdata)
            .join("Freenet")
            .join("bin")
            .join(bin);
        if p.is_file() {
            return p;
        }
    }
    if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
        let candidates = [
            PathBuf::from(&home)
                .join("AppData")
                .join("Local")
                .join("Freenet")
                .join("bin")
                .join(bin),
            PathBuf::from(&home).join(".cargo").join("bin").join(bin),
            PathBuf::from(&home)
                .join(".local")
                .join("share")
                .join("freenet")
                .join("bin")
                .join(bin),
            PathBuf::from(&home).join(".freenet").join("bin").join(bin),
        ];
        for c in candidates {
            if c.is_file() {
                return c;
            }
        }
    }
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            let candidate = dir.join(bin);
            if candidate.is_file() {
                return candidate;
            }
        }
    }
    PathBuf::from(bin)
}

fn fetch_contract_json(key: &str) -> Option<Value> {
    let tmp = tempfile::NamedTempFile::new().ok()?;
    let out_path = tmp.path().to_path_buf();
    let mut cmd = Command::new(find_fdev());
    cmd.args([
        "execute",
        "get",
        "--timeout",
        "3",
        "-o",
        &out_path.to_string_lossy(),
        key,
    ]);
    host::run(&mut cmd).ok()?;
    let raw = fs::read_to_string(&out_path).ok()?;
    serde_json::from_str(&raw).ok()
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VisoCert {
    pub base: String,
    pub challenge: String,
    pub ts: u64,
    pub sig: String,
}

impl VisoCert {
    fn to_json(&self) -> Value {
        json!({
            "base": self.base,
            "challenge": self.challenge,
            "ts": self.ts,
            "sig": self.sig,
        })
    }

    fn from_json(v: &Value) -> Option<Self> {
        Some(VisoCert {
            base: v.get("base")?.as_str()?.to_owned(),
            challenge: v.get("challenge")?.as_str()?.to_owned(),
            ts: v.get("ts")?.as_u64()?,
            sig: v.get("sig")?.as_str()?.to_owned(),
        })
    }
}

#[derive(Clone, Debug)]
struct StoredDesktopIdentity {
    /// `"local"` or `"viso"`
    kind: String,
    /// 64-char hex Ed25519 public key (Viso persona pubkey or local keypair pubkey)
    pubkey: String,
    /// 64-char hex Ed25519 signing secret key (delegated `app_sk` for Viso, or local seed)
    signing_sk: String,
    display_name: Option<String>,
    cert: Option<VisoCert>,
}

impl StoredDesktopIdentity {
    fn to_json(&self) -> Value {
        let mut obj = json!({
            "kind": self.kind,
            "pubkey": self.pubkey,
            "signing_sk": self.signing_sk,
        });
        if let Some(map) = obj.as_object_mut() {
            if let Some(name) = &self.display_name {
                map.insert("display_name".into(), Value::String(name.clone()));
            }
            if let Some(cert) = &self.cert {
                map.insert("cert".into(), cert.to_json());
            }
        }
        obj
    }

    fn from_json(v: &Value) -> Option<Self> {
        let kind = v
            .get("kind")
            .or_else(|| v.get("type"))
            .and_then(Value::as_str)
            .unwrap_or("local")
            .to_owned();
        let pubkey = v
            .get("pubkey")
            .or_else(|| v.get("persona"))
            .and_then(Value::as_str)?
            .to_owned();
        let signing_sk = v
            .get("signing_sk")
            .or_else(|| v.get("app_key"))
            .or_else(|| v.get("sk"))
            .or_else(|| v.get("secret_key"))
            .and_then(Value::as_str)?
            .to_owned();
        let display_name = v
            .get("display_name")
            .and_then(Value::as_str)
            .map(str::to_owned);
        let cert = v.get("cert").and_then(VisoCert::from_json);
        Some(StoredDesktopIdentity {
            kind,
            pubkey,
            signing_sk,
            display_name,
            cert,
        })
    }
}

/// 32 bytes from the OS CSPRNG. Seeds keys, room keys and AES-GCM IVs, so it must be unpredictable.
fn entropy_32(_tag: &str) -> [u8; 32] {
    use ring::rand::{SecureRandom, SystemRandom};
    let mut out = [0u8; 32];
    SystemRandom::new()
        .fill(&mut out)
        .expect("OS random number generator unavailable");
    out
}

/// Create Radica's data dir readable by this user only: it holds the signing key and room keys.
fn make_private_dir(dir: &std::path::Path) {
    let _ = fs::create_dir_all(dir);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(dir, fs::Permissions::from_mode(0o700));
    }
}

fn identity_json_path() -> Option<PathBuf> {
    directories::ProjectDirs::from("", "Freenet", "Radica")
        .map(|d| d.data_local_dir().join("desktop-identity.json"))
}

fn legacy_identity_hex_path() -> Option<PathBuf> {
    directories::ProjectDirs::from("", "Freenet", "Radica")
        .map(|d| d.data_local_dir().join("desktop-identity.hex"))
}

fn save_stored_identity(id: &StoredDesktopIdentity) {
    if let Some(p) = identity_json_path() {
        if let Some(parent) = p.parent() {
            make_private_dir(parent);
        }
        let _ = fs::write(
            p,
            serde_json::to_string_pretty(&id.to_json()).unwrap_or_default(),
        );
    }
}

fn is_identity_valid(id: &StoredDesktopIdentity) -> bool {
    let Ok(sk_bytes) = hex::decode(&id.signing_sk) else {
        return false;
    };
    let Ok(sk_arr) = <[u8; 32]>::try_from(sk_bytes.as_slice()) else {
        return false;
    };
    let sk = SigningKey::from_bytes(&sk_arr);
    let my_pk = hex::encode(sk.verifying_key().to_bytes());
    if id.kind == "viso" {
        if let Some(cert) = &id.cert {
            let mut cert_clone = cert.clone();
            if !cert.challenge.contains(&my_pk)
                || !verify_viso_cert_multi(&id.pubkey, &mut cert_clone, &[])
            {
                return false;
            }
        } else {
            return false;
        }
    } else if id.pubkey != my_pk {
        return false;
    }
    true
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct PendingMessage {
    pub room_key: String,
    pub text: String,
    pub reply_to: Option<u32>,
    pub ts: u64,
}

fn pending_messages_path() -> Option<PathBuf> {
    directories::ProjectDirs::from("", "Freenet", "Radica")
        .map(|d| d.data_local_dir().join("pending-messages.json"))
}

fn load_pending_messages() -> Vec<PendingMessage> {
    let Some(p) = pending_messages_path() else {
        return Vec::new();
    };
    let Ok(raw) = fs::read_to_string(p) else {
        return Vec::new();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn save_pending_messages(list: &[PendingMessage]) {
    let Some(p) = pending_messages_path() else {
        return;
    };
    if let Some(parent) = p.parent() {
        make_private_dir(parent);
    }
    let _ = fs::write(p, serde_json::to_string_pretty(list).unwrap_or_default());
}

fn remember_pending_message(room_key: &str, text: &str, reply_to: Option<u32>, ts: u64) {
    let mut list = load_pending_messages();
    list.push(PendingMessage {
        room_key: room_key.to_owned(),
        text: text.to_owned(),
        reply_to,
        ts,
    });
    save_pending_messages(&list);
}

fn clean_confirmed_pending(room_key: &str, confirmed_texts: &BTreeSet<String>) {
    let mut list = load_pending_messages();
    let prev_len = list.len();
    list.retain(|m| m.room_key != room_key || !confirmed_texts.contains(&m.text));
    if list.len() != prev_len {
        save_pending_messages(&list);
    }
}

fn remove_pending_message(room_key: &str, text_opt: Option<&str>) {
    let mut list = load_pending_messages();
    let prev_len = list.len();
    list.retain(|m| {
        if m.room_key != room_key {
            return true;
        }
        if let Some(t) = text_opt {
            if m.text == t {
                return false;
            }
        }
        true
    });
    if list.len() != prev_len {
        save_pending_messages(&list);
    }
}

fn deleted_messages_path() -> Option<PathBuf> {
    directories::ProjectDirs::from("", "Freenet", "Radica")
        .map(|d| d.data_local_dir().join("deleted-messages.json"))
}

fn load_deleted_messages() -> BTreeSet<String> {
    let Some(p) = deleted_messages_path() else {
        return BTreeSet::new();
    };
    let Ok(raw) = fs::read_to_string(p) else {
        return BTreeSet::new();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn remember_deleted_message(wire_id: &str) {
    let Some(p) = deleted_messages_path() else {
        return;
    };
    let mut set = load_deleted_messages();
    set.insert(wire_id.to_owned());
    if let Some(parent) = p.parent() {
        make_private_dir(parent);
    }
    let _ = fs::write(p, serde_json::to_string_pretty(&set).unwrap_or_default());
}

fn hidden_rooms_path() -> Option<PathBuf> {
    directories::ProjectDirs::from("", "Freenet", "Radica")
        .map(|d| d.data_local_dir().join("hidden-rooms.json"))
}

fn load_hidden_rooms() -> BTreeSet<String> {
    let Some(p) = hidden_rooms_path() else {
        return BTreeSet::new();
    };
    let Ok(raw) = fs::read_to_string(p) else {
        return BTreeSet::new();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn remember_hidden_room(room_key: &str) {
    let Some(p) = hidden_rooms_path() else {
        return;
    };
    let mut set = load_hidden_rooms();
    set.insert(room_key.to_owned());
    if let Some(parent) = p.parent() {
        make_private_dir(parent);
    }
    let _ = fs::write(p, serde_json::to_string_pretty(&set).unwrap_or_default());
}

fn unhide_room(room_key: &str) {
    let Some(p) = hidden_rooms_path() else {
        return;
    };
    let mut set = load_hidden_rooms();
    if set.remove(room_key) {
        let _ = fs::write(p, serde_json::to_string_pretty(&set).unwrap_or_default());
    }
}

fn profiles_cache_path() -> Option<PathBuf> {
    directories::ProjectDirs::from("", "Freenet", "Radica")
        .map(|d| d.data_local_dir().join("profiles-cache.json"))
}

fn load_profiles_cache() -> HashMap<String, String> {
    let Some(p) = profiles_cache_path() else {
        return HashMap::new();
    };
    let Ok(raw) = fs::read_to_string(p) else {
        return HashMap::new();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn save_profiles_cache(cache: &HashMap<String, String>) {
    let Some(p) = profiles_cache_path() else {
        return;
    };
    if let Some(parent) = p.parent() {
        make_private_dir(parent);
    }
    let _ = fs::write(p, serde_json::to_string_pretty(cache).unwrap_or_default());
}

fn load_stored_identity() -> StoredDesktopIdentity {
    if let Some(p) = identity_json_path()
        && let Ok(raw) = fs::read_to_string(&p)
        && let Ok(val) = serde_json::from_str::<Value>(&raw)
        && let Some(mut id) = StoredDesktopIdentity::from_json(&val)
        && id.pubkey.len() == 64
        && id.signing_sk.len() == 64
    {
        if is_identity_valid(&id) {
            return id;
        }
        if id.kind != "viso"
            && let Ok(sk_bytes) = hex::decode(&id.signing_sk)
            && let Ok(sk_arr) = <[u8; 32]>::try_from(sk_bytes.as_slice())
        {
            let sk = SigningKey::from_bytes(&sk_arr);
            let my_pk = hex::encode(sk.verifying_key().to_bytes());
            id.kind = "local".into();
            id.pubkey = my_pk;
            id.cert = None;
            save_stored_identity(&id);
            return id;
        }
    }
    if let Some(p) = legacy_identity_hex_path()
        && let Ok(hex_str) = fs::read_to_string(&p)
        && let Ok(bytes) = hex::decode(hex_str.trim())
        && let Ok(arr) = <[u8; 32]>::try_from(bytes.as_slice())
    {
        let sk = SigningKey::from_bytes(&arr);
        let pk = hex::encode(sk.verifying_key().to_bytes());
        let id = StoredDesktopIdentity {
            kind: "local".into(),
            pubkey: pk,
            signing_sk: hex::encode(arr),
            display_name: None,
            cert: None,
        };
        save_stored_identity(&id);
        return id;
    }
    generate_fresh_local_identity()
}

fn generate_fresh_local_identity() -> StoredDesktopIdentity {
    let seed = entropy_32("radica-desktop-local-seed");
    let sk = SigningKey::from_bytes(&seed);
    let pk = hex::encode(sk.verifying_key().to_bytes());
    let id = StoredDesktopIdentity {
        kind: "local".into(),
        pubkey: pk,
        signing_sk: hex::encode(seed),
        display_name: None,
        cert: None,
    };
    save_stored_identity(&id);
    id
}

/// Persistent local or Viso Ed25519 identity for desktop messages.
fn local_identity() -> (SigningKey, String) {
    let id = load_stored_identity();
    let sk_bytes = hex::decode(&id.signing_sk)
        .ok()
        .and_then(|b| <[u8; 32]>::try_from(b.as_slice()).ok())
        .unwrap_or([1u8; 32]);
    (SigningKey::from_bytes(&sk_bytes), id.pubkey)
}

/// Deterministic non-zero `MemberId` (`u32`) from a hex pubkey.
fn member_id_of(pubkey: &str) -> u32 {
    let hash = blake3::hash(pubkey.as_bytes());
    let b = hash.as_bytes();
    let id = u32::from_le_bytes([b[0], b[1], b[2], b[3]]);
    if id == 0 { 1 } else { id }
}

fn short_persona(pubkey: &str) -> String {
    if let Ok(bytes) = hex::decode(pubkey) {
        let b58 = to_base58(&bytes);
        let prefix: String = b58.chars().take(6).collect();
        return format!("Persona @{prefix}");
    }
    format!("Persona @{}", &pubkey[..pubkey.len().min(6)])
}

/// Convert a unix timestamp in milliseconds into minutes since `day_zero` (days since 1970-01-01).
fn ms_to_minutes(ts_ms: u64, day_zero: i64) -> u32 {
    let total_minutes = (ts_ms / 60_000) as i64;
    let zero_minutes = day_zero * 24 * 60;
    total_minutes.saturating_sub(zero_minutes).max(0) as u32
}

pub fn load_live() -> Option<LiveSnapshot> {
    let (_sk, my_pk) = local_identity();
    let me_id = member_id_of(&my_pk);

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let today_days = (now_ms / 86_400_000) as i64;
    // Anchor day_zero 30 days back so recent history fits comfortably in positive `u32` minutes.
    let day_zero = today_days - 30;
    let today = 30u32;
    let now = ms_to_minutes(now_ms, day_zero);

    // 1. Fetch directory, communities, maintainer & user feeds, private rooms, and community chats in parallel
    let dir_key = log_contract_key("directory");
    let comms_key = log_contract_key("communities");
    let inbox_key = log_contract_key(&format!("inbox/{my_pk}"));
    let feed_key = feed_contract_key(MAINTAINER_PK);
    let my_feed_key = if my_pk != MAINTAINER_PK {
        feed_contract_key(&my_pk)
    } else {
        None
    };
    let mut active_comm_ids: Vec<(String, String, String)> = SYNC_COMMUNITIES
        .iter()
        .map(|&(id, n, d)| (id.to_owned(), n.to_owned(), d.to_owned()))
        .collect();
    for extra in load_extra_communities() {
        if !active_comm_ids.iter().any(|(id, _, _)| id == &extra) {
            let name = extra.trim_start_matches("c_").to_owned();
            let desc = format!("Public Freenet community #r/{name}");
            active_comm_ids.push((extra, name, desc));
        }
    }
    let chat_keys: Vec<(String, String)> = active_comm_ids
        .iter()
        .map(|(id, _, _)| {
            (
                id.clone(),
                log_contract_key(&format!("community-chat/{id}")),
            )
        })
        .collect();
    let priv_rooms_cfg = load_private_rooms();
    let priv_keys: Vec<(String, String)> = priv_rooms_cfg
        .iter()
        .map(|r| (r.id.clone(), log_contract_key(&format!("room/{}", r.id))))
        .collect();

    let (dir_json, comms_json, inbox_json, feed_json, my_feed_json, chat_jsons, priv_jsons) =
        std::thread::scope(|s| {
            let h_dir = s.spawn(|| fetch_contract_json(&dir_key));
            let h_comms = s.spawn(|| fetch_contract_json(&comms_key));
            let h_inbox = s.spawn(|| fetch_contract_json(&inbox_key));
            let h_feed = s.spawn(|| feed_key.as_deref().and_then(fetch_contract_json));
            let h_my_feed = s.spawn(|| my_feed_key.as_deref().and_then(fetch_contract_json));
            let h_chats: Vec<_> = chat_keys
                .iter()
                .map(|(id, k)| s.spawn(move || (id.as_str(), fetch_contract_json(k))))
                .collect();
            let h_privs: Vec<_> = priv_keys
                .iter()
                .map(|(id, k)| s.spawn(move || (id.as_str(), fetch_contract_json(k))))
                .collect();

            let chats: HashMap<&str, Option<Value>> =
                h_chats.into_iter().filter_map(|h| h.join().ok()).collect();
            let privs: HashMap<&str, Option<Value>> =
                h_privs.into_iter().filter_map(|h| h.join().ok()).collect();
            (
                h_dir.join().ok().flatten(),
                h_comms.join().ok().flatten(),
                h_inbox.join().ok().flatten(),
                h_feed.join().ok().flatten(),
                h_my_feed.join().ok().flatten(),
                chats,
                privs,
            )
        });

    // 2. Directory: pubkey -> display_name & avatars
    let stored = load_stored_identity();
    let deleted_msgs = load_deleted_messages();
    let hidden_rooms = load_hidden_rooms();
    let mut avatars = load_profiles_cache();
    let mut names: HashMap<String, String> = HashMap::new();
    names.insert(MAINTAINER_PK.to_owned(), "Scobru".to_owned());
    let default_me_name = stored
        .display_name
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| short_persona(&my_pk));
    names.insert(my_pk.clone(), default_me_name);

    // Harvest profile display_name, avatar_url & enc_pub from feed contracts
    for (owner_pk, f_json) in [
        (MAINTAINER_PK, feed_json.as_ref()),
        (my_pk.as_str(), my_feed_json.as_ref()),
    ] {
        if let Some(fj) = f_json
            && let Some(prof) = fj.get("profile")
        {
            if let Some(enc_pub) = prof.get("enc_pub").and_then(Value::as_str) {
                remember_peer_enc_pub(owner_pk, enc_pub);
            }
            if let Some(dn) = prof.get("display_name").and_then(Value::as_str)
                && !dn.trim().is_empty()
            {
                names.insert(owner_pk.to_owned(), dn.trim().chars().take(40).collect());
            }
            if let Some(av) = prof.get("avatar_url").and_then(Value::as_str)
                && !av.trim().is_empty()
            {
                avatars.insert(owner_pk.to_owned(), av.to_owned());
            }
        }
    }

    if let Some(dir_json) = dir_json
        && let Some(entries) = dir_json.get("entries").and_then(Value::as_object)
    {
        let mut sorted: Vec<&Value> = entries.values().collect();
        sorted.sort_by_key(|e| e.get("ts").and_then(Value::as_u64).unwrap_or(0));
        for e in sorted {
            let Some(author) = e.get("author").and_then(Value::as_str) else {
                continue;
            };
            let Some(body_str) = e.get("body").and_then(Value::as_str) else {
                continue;
            };
            if let Ok(body) = serde_json::from_str::<Value>(body_str)
                && body.get("type").and_then(Value::as_str) == Some("hello")
            {
                if let Some(name) = body.get("display_name").and_then(Value::as_str) {
                    let clean = name.trim();
                    if !clean.is_empty()
                        && (!names.contains_key(author) || !clean.starts_with("Persona @"))
                    {
                        names.insert(author.to_owned(), clean.chars().take(40).collect());
                    }
                }
                if let Some(av) = body.get("avatar_url").and_then(Value::as_str)
                    && !av.trim().is_empty()
                {
                    avatars.insert(author.to_owned(), av.to_owned());
                } else if let Some(prof) = body.get("profile")
                    && let Some(av) = prof.get("avatar_url").and_then(Value::as_str)
                    && !av.trim().is_empty()
                {
                    avatars.insert(author.to_owned(), av.to_owned());
                }
            }
        }
    }
    save_profiles_cache(&avatars);

    // 3. Communities: creator, moderators and bans, folded the way the web does.
    let comm_folds = fold_communities(&ordered_bodies(comms_json.as_ref()));

    let mut rooms: Vec<Room> = Vec::new();

    // 4. Community chat logs
    for (comm_id, default_name, default_desc) in &active_comm_ids {
        // A community missing from the log keeps the built-in name, owned by the maintainer.
        let fold = comm_folds
            .get(comm_id)
            .cloned()
            .unwrap_or_else(|| CommFold {
                name: default_name.clone(),
                desc: default_desc.clone(),
                creator: MAINTAINER_PK.to_owned(),
                moderators: BTreeSet::new(),
                banned: BTreeSet::new(),
            });
        let chat_json = chat_jsons.get(comm_id.as_str()).and_then(|v| v.as_ref());
        let room = build_community_room(
            comm_id,
            &fold,
            &my_pk,
            me_id,
            day_zero,
            &names,
            &avatars,
            &deleted_msgs,
            chat_json,
        );
        rooms.push(room);
    }

    // 5. E2EE Private Group Rooms (`priv:<id>` / `log:room/<id>`)
    for priv_room in build_private_rooms(
        &my_pk,
        me_id,
        day_zero,
        &names,
        &avatars,
        &deleted_msgs,
        &priv_rooms_cfg,
        &priv_jsons,
    ) {
        rooms.push(priv_room);
    }

    // 6. 1-on-1 E2EE Direct Message (DM) rooms from `inbox/<my_pk>`
    for dm_room in build_dm_rooms(
        &my_pk,
        me_id,
        day_zero,
        &names,
        &avatars,
        &deleted_msgs,
        inbox_json.as_ref(),
    ) {
        rooms.push(dm_room);
    }

    // Filter out contacts and rooms hidden by the user
    rooms.retain(|r| !hidden_rooms.contains(&r.key));
    let total_msgs: usize = rooms.iter().map(|r| r.messages.len()).sum();

    if total_msgs == 0 && priv_rooms_cfg.is_empty() && rooms.is_empty() {
        return None;
    }

    let status = format!("{} rooms · {} msgs", rooms.len(), total_msgs);
    let my_display_name = stored
        .display_name
        .clone()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| names.get(&my_pk).cloned())
        .unwrap_or_else(|| short_persona(&my_pk));
    let is_viso = stored.kind == "viso" && stored.cert.is_some();
    let identity = Some(IdentityInfo {
        pubkey: my_pk.clone(),
        persona_b58: short_persona(&my_pk),
        display_name: my_display_name,
        is_viso,
        secret_key_hex: if is_viso {
            None
        } else {
            Some(stored.signing_sk.clone())
        },
    });
    Some(LiveSnapshot {
        rooms,
        today,
        day_zero,
        now,
        status,
        identity,
    })
}

/// A log's entries as `(author, ts, body)`, in the web's order (`ordered` in `ui/src/logfold.ts`):
/// by time, then author and id. Entries whose body is not JSON are skipped.
fn ordered_bodies(json: Option<&Value>) -> Vec<(String, u64, Value)> {
    let Some(entries) = json
        .and_then(|j| j.get("entries"))
        .and_then(Value::as_object)
    else {
        return Vec::new();
    };
    let mut out: Vec<(String, String, u64, Value)> = entries
        .values()
        .filter_map(|e| {
            let author = e.get("author")?.as_str()?.to_owned();
            let id = e.get("id").and_then(Value::as_str).unwrap_or("").to_owned();
            let ts = e.get("ts").and_then(Value::as_u64).unwrap_or(0);
            let body = serde_json::from_str(e.get("body")?.as_str()?).ok()?;
            Some((author, id, ts, body))
        })
        .collect();
    out.sort_by(|a, b| {
        a.2.cmp(&b.2)
            .then_with(|| (a.0.clone() + &a.1).cmp(&(b.0.clone() + &b.1)))
    });
    out.into_iter().map(|(a, _, ts, b)| (a, ts, b)).collect()
}

#[derive(Clone, Debug)]
struct CommFold {
    name: String,
    desc: String,
    creator: String,
    moderators: BTreeSet<String>,
    banned: BTreeSet<String>,
}

impl CommFold {
    fn is_mod(&self, pk: &str) -> bool {
        pk == self.creator || self.moderators.contains(pk)
    }
}

fn valid_community_id(id: &str) -> bool {
    id.strip_prefix("c_").is_some_and(|rest| {
        (1..=40).contains(&rest.len())
            && rest
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_')
    })
}

/// Communities from the `communities` log, like `foldCommunities` in `ui/src/logfold.ts`: the first
/// `community_create` names the creator and only the creator renames it; moderators and bans follow
/// the signed `community_mod_*` / `community_ban` entries of moderators.
fn fold_communities(bodies: &[(String, u64, Value)]) -> HashMap<String, CommFold> {
    let genesis = |name: &str, desc: &str, mods: &[&str]| CommFold {
        name: name.into(),
        desc: desc.into(),
        creator: "system".into(),
        moderators: mods.iter().map(|m| (*m).to_owned()).collect(),
        banned: BTreeSet::new(),
    };
    let mut map: HashMap<String, CommFold> = HashMap::from([
        (
            "c_radica".to_owned(),
            genesis(
                "Radica Hub",
                "Decentralized social commons, Freenet dApps, and network updates.",
                &["system", MAINTAINER_PK],
            ),
        ),
        (
            "c_tech".to_owned(),
            genesis(
                "Tech & P2P",
                "Peer-to-peer protocols, cryptography, and Web3 decentralization.",
                &["system"],
            ),
        ),
    ]);
    let s = |v: &Value, k: &str| v.get(k).and_then(Value::as_str).map(str::to_owned);
    for (a, _, b) in bodies {
        match b.get("type").and_then(Value::as_str) {
            Some("community_create") => {
                let m = b.get("community").cloned().unwrap_or(Value::Null);
                let Some(id) = s(&m, "id").filter(|id| valid_community_id(id)) else {
                    continue;
                };
                let first_line = |d: String| d.lines().next().unwrap_or("").to_owned();
                match map.get_mut(&id) {
                    None => {
                        map.insert(
                            id.clone(),
                            CommFold {
                                name: s(&m, "name").unwrap_or_else(|| id.clone()),
                                desc: first_line(s(&m, "description").unwrap_or_default()),
                                creator: a.clone(),
                                moderators: BTreeSet::from([a.clone()]),
                                banned: BTreeSet::new(),
                            },
                        );
                    }
                    Some(cur) if &cur.creator == a => {
                        if let Some(n) = s(&m, "name") {
                            cur.name = n;
                        }
                        if let Some(d) = s(&m, "description") {
                            cur.desc = first_line(d);
                        }
                    }
                    Some(_) => {}
                }
            }
            Some(t) => {
                let Some(c) = s(b, "community_id").and_then(|id| map.get_mut(&id)) else {
                    continue;
                };
                let target = s(b, "target").unwrap_or_default();
                match t {
                    "community_mod_add"
                        if c.is_mod(a) && !target.is_empty() && !c.banned.contains(&target) =>
                    {
                        c.moderators.insert(target);
                    }
                    "community_mod_remove"
                        if target != c.creator && (a == &c.creator || a == &target) =>
                    {
                        c.moderators.remove(&target);
                    }
                    "community_ban" if c.is_mod(a) && !target.is_empty() && target != c.creator => {
                        c.moderators.remove(&target);
                        c.banned.insert(target);
                    }
                    "community_unban" if c.is_mod(a) => {
                        c.banned.remove(&target);
                    }
                    _ => {}
                }
            }
            None => {}
        }
    }
    if let Some(c) = map.get_mut("c_radica") {
        c.moderators.insert(MAINTAINER_PK.to_owned());
    }
    map
}

#[allow(clippy::too_many_arguments)]
fn build_community_room(
    comm_id: &str,
    comm: &CommFold,
    my_pk: &str,
    me_id: u32,
    day_zero: i64,
    names: &HashMap<String, String>,
    avatars: &HashMap<String, String>,
    deleted_msgs: &BTreeSet<String>,
    chat_json: Option<&Value>,
) -> Room {
    let room_id = format!("comm_{comm_id}");

    struct RawMsg {
        str_id: String,
        num_id: u32,
        sender: String,
        time: u32,
        ts: u64,
        text: String,
        reply_to_str: Option<String>,
        edited: bool,
    }

    let mut raw_msgs: BTreeMap<String, RawMsg> = BTreeMap::new();
    let mut edits: Vec<(String, String, String, u64)> = Vec::new();
    let mut deletes: Vec<(String, String)> = Vec::new();
    let mut reacts: BTreeMap<(String, String, String), (bool, u64)> = BTreeMap::new();
    let mut participants: BTreeSet<String> = BTreeSet::new();
    if comm.creator != "system" {
        participants.insert(comm.creator.clone());
    }
    participants.insert(my_pk.to_owned());

    if let Some(json) = chat_json
        && let Some(entries) = json.get("entries").and_then(Value::as_object)
    {
        let mut sorted: Vec<&Value> = entries.values().collect();
        sorted.sort_by_key(|e| e.get("ts").and_then(Value::as_u64).unwrap_or(0));
        let mut next_id = 1u32;
        for e in sorted {
            let Some(author) = e.get("author").and_then(Value::as_str) else {
                continue;
            };
            let e_ts = e.get("ts").and_then(Value::as_u64).unwrap_or(0);
            let Some(body_str) = e.get("body").and_then(Value::as_str) else {
                continue;
            };
            let Ok(b) = serde_json::from_str::<Value>(body_str) else {
                continue;
            };
            match b.get("type").and_then(Value::as_str) {
                Some("chat") => {
                    let Some(m) = b.get("message") else {
                        continue;
                    };
                    let sender = m.get("sender").and_then(Value::as_str).unwrap_or("");
                    let m_room = m.get("room_id").and_then(Value::as_str).unwrap_or("");
                    let Some(m_id) = m.get("id").and_then(Value::as_str) else {
                        continue;
                    };
                    if deleted_msgs.contains(m_id) {
                        continue;
                    }
                    let Some(text) = m.get("text").and_then(Value::as_str) else {
                        continue;
                    };
                    if sender != author
                        || m_room != room_id
                        || text.trim().is_empty()
                        || comm.banned.contains(sender)
                    {
                        continue;
                    }
                    let ts = m.get("timestamp").and_then(Value::as_u64).unwrap_or(e_ts);
                    let reply_to_str = m.get("reply_to").and_then(Value::as_str).map(str::to_owned);
                    participants.insert(sender.to_owned());
                    let num_id = next_id;
                    next_id += 1;
                    raw_msgs.insert(
                        m_id.to_owned(),
                        RawMsg {
                            str_id: m_id.to_owned(),
                            num_id,
                            sender: sender.to_owned(),
                            time: ms_to_minutes(ts, day_zero),
                            ts,
                            text: text.to_owned(),
                            reply_to_str,
                            edited: false,
                        },
                    );
                }
                Some("chat_edit") => {
                    if b.get("roomId").and_then(Value::as_str) == Some(&room_id)
                        && let (Some(m_id), Some(text)) = (
                            b.get("messageId").and_then(Value::as_str),
                            b.get("text").and_then(Value::as_str),
                        )
                    {
                        edits.push((author.to_owned(), m_id.to_owned(), text.to_owned(), e_ts));
                    }
                }
                Some("chat_delete" | "chat_burn") => {
                    if b.get("roomId").and_then(Value::as_str) == Some(&room_id)
                        && let Some(m_id) = b.get("messageId").and_then(Value::as_str)
                    {
                        deletes.push((author.to_owned(), m_id.to_owned()));
                    }
                }
                Some("chat_react") => {
                    if b.get("roomId").and_then(Value::as_str) == Some(&room_id)
                        && let (Some(m_id), Some(emoji)) = (
                            b.get("messageId").and_then(Value::as_str),
                            b.get("emoji").and_then(Value::as_str),
                        )
                        && CHAT_REACTIONS.contains(&emoji)
                        && !comm.banned.contains(author)
                    {
                        let on = b.get("on").and_then(Value::as_bool).unwrap_or(false);
                        let k = (m_id.to_owned(), emoji.to_owned(), author.to_owned());
                        if reacts.get(&k).is_none_or(|&(_, prev_ts)| e_ts >= prev_ts) {
                            reacts.insert(k, (on, e_ts));
                        }
                        participants.insert(author.to_owned());
                    }
                }
                _ => {}
            }
        }
    }

    for (author, m_id, new_text, _) in edits {
        if let Some(m) = raw_msgs.get_mut(&m_id)
            && m.sender == author
        {
            m.text = new_text;
            m.edited = true;
        }
    }
    // Like the web: only the sender or a community moderator can delete a message.
    for (by, m_id) in &deletes {
        if raw_msgs
            .get(m_id)
            .is_some_and(|m| &m.sender == by || comm.is_mod(by))
        {
            raw_msgs.remove(m_id);
        }
    }

    let mut ordered: Vec<&RawMsg> = raw_msgs.values().collect();
    ordered.sort_by_key(|m| (m.ts, m.num_id));

    let mut messages: Vec<Message> = Vec::with_capacity(ordered.len());
    for m in &ordered {
        let reply_to = m.reply_to_str.as_ref().and_then(|target_id| {
            let target = raw_msgs.get(target_id)?;
            Some(ReplyTo {
                message: target.num_id,
                author: member_id_of(&target.sender),
                preview: radica_app::chat::model::preview(&target.text, 64),
            })
        });
        let mut emoji_map: BTreeMap<String, Vec<u32>> = BTreeMap::new();
        for ((r_msg, emoji, who), &(on, _)) in &reacts {
            if on && r_msg == &m.str_id {
                emoji_map
                    .entry(emoji.clone())
                    .or_default()
                    .push(member_id_of(who));
            }
        }
        let reactions = emoji_map
            .into_iter()
            .map(|(emoji, by)| Reaction { emoji, by })
            .collect();
        messages.push(Message {
            id: m.num_id,
            author: member_id_of(&m.sender),
            time: m.time,
            text: m.text.clone(),
            reply_to,
            reactions,
            edited: m.edited,
        });
        remember_wire_id(comm_id, m.num_id, &m.str_id);
    }

    let pending = load_pending_messages();
    let mut confirmed = BTreeSet::new();
    for m in &messages {
        confirmed.insert(m.text.clone());
    }
    clean_confirmed_pending(comm_id, &confirmed);
    for p_msg in pending {
        if p_msg.room_key == comm_id && !confirmed.contains(&p_msg.text) {
            let next_id = messages
                .iter()
                .map(|m| m.id)
                .max()
                .unwrap_or(0)
                .saturating_add(1);
            messages.push(Message {
                id: next_id,
                author: me_id,
                time: ms_to_minutes(p_msg.ts, day_zero),
                text: p_msg.text.clone(),
                reply_to: None,
                reactions: Vec::new(),
                edited: false,
            });
        }
    }

    messages.sort_by_key(|m| (m.time, m.id));

    let mut members: Vec<Member> = Vec::new();
    let mut seen_ids: BTreeSet<u32> = BTreeSet::new();
    for pk in participants {
        let id = member_id_of(&pk);
        if !seen_ids.insert(id) {
            continue;
        }
        remember_peer(id, &pk);
        let nickname = names
            .get(&pk)
            .cloned()
            .unwrap_or_else(|| short_persona(&pk));
        let role = if pk == comm.creator || pk == MAINTAINER_PK {
            Role::Owner
        } else {
            Role::Member
        };
        let av = avatars.get(&pk).cloned();
        members.push(Member::new(id, nickname, role).with_avatar(Some(pk.clone()), av));
    }

    Room {
        key: comm_id.to_owned(),
        name: comm.name.clone(),
        description: comm.desc.clone(),
        private: false,
        members,
        messages,
        me: me_id,
        unread: 0,
    }
}

fn decode_sym_key(key_hex: &str) -> Option<[u8; 32]> {
    let bytes = hex::decode(key_hex).ok()?;
    bytes.as_slice().try_into().ok()
}

fn build_private_rooms(
    my_pk: &str,
    me_id: u32,
    day_zero: i64,
    names: &HashMap<String, String>,
    avatars: &HashMap<String, String>,
    deleted_msgs: &BTreeSet<String>,
    priv_rooms_cfg: &[StoredPrivateRoom],
    priv_jsons: &HashMap<&str, Option<Value>>,
) -> Vec<Room> {
    let mut out = Vec::new();
    for pr in priv_rooms_cfg {
        let room_key = format!("priv:{}", pr.id);
        let sym_key = decode_sym_key(&pr.key_hex);
        let json_opt = priv_jsons.get(pr.id.as_str()).and_then(|v| v.as_ref());
        let mut participants: BTreeSet<String> = BTreeSet::new();
        participants.insert(my_pk.to_owned());
        participants.insert(pr.creator.clone());

        let mut raw_msgs: Vec<(String, String, u64, String, Option<String>)> = Vec::new();
        let mut edits: HashMap<String, (String, u64, String)> = HashMap::new();
        let mut deletes: HashMap<String, (String, u64)> = HashMap::new();
        let mut reacts: HashMap<String, BTreeMap<String, BTreeMap<String, (u64, bool)>>> =
            HashMap::new();

        if let Some(json) = json_opt
            && let Some(entries) = json.get("entries").and_then(Value::as_object)
        {
            let mut sorted: Vec<&Value> = entries.values().collect();
            sorted.sort_by_key(|e| e.get("ts").and_then(Value::as_u64).unwrap_or(0));

            for e in sorted {
                let Some(author) = e.get("author").and_then(Value::as_str) else {
                    continue;
                };
                let e_ts = e.get("ts").and_then(Value::as_u64).unwrap_or(0);
                let Some(body_str) = e.get("body").and_then(Value::as_str) else {
                    continue;
                };
                let Ok(b) = serde_json::from_str::<Value>(body_str) else {
                    continue;
                };
                match b.get("type").and_then(Value::as_str) {
                    Some("chat") => {
                        let Some(m) = b.get("message") else { continue };
                        let Some(id) = m.get("id").and_then(Value::as_str) else {
                            continue;
                        };
                        let sender = m.get("sender").and_then(Value::as_str).unwrap_or("");
                        let Some(raw_text) = m.get("text").and_then(Value::as_str) else {
                            continue;
                        };
                        if sender != author || raw_text.trim().is_empty() {
                            continue;
                        }
                        let text = sym_key
                            .as_ref()
                            .and_then(|k| decrypt_with_symmetric_key(k, raw_text))
                            .unwrap_or_else(|| raw_text.to_owned());
                        let ts = m.get("timestamp").and_then(Value::as_u64).unwrap_or(e_ts);
                        let reply = m
                            .get("reply_to")
                            .and_then(Value::as_str)
                            .map(ToOwned::to_owned);
                        participants.insert(author.to_owned());
                        remember_peer(member_id_of(author), author);
                        raw_msgs.push((id.to_owned(), author.to_owned(), ts, text, reply));
                    }
                    Some("chat_edit") => {
                        let Some(mid) = b.get("messageId").and_then(Value::as_str) else {
                            continue;
                        };
                        let Some(raw_text) = b.get("text").and_then(Value::as_str) else {
                            continue;
                        };
                        let text = sym_key
                            .as_ref()
                            .and_then(|k| decrypt_with_symmetric_key(k, raw_text))
                            .unwrap_or_else(|| raw_text.to_owned());
                        if !text.trim().is_empty()
                            && edits
                                .get(mid)
                                .is_none_or(|(_, prev_ts, _)| e_ts >= *prev_ts)
                        {
                            edits.insert(mid.to_owned(), (author.to_owned(), e_ts, text));
                        }
                    }
                    Some("chat_delete" | "chat_burn") => {
                        let Some(mid) = b.get("messageId").and_then(Value::as_str) else {
                            continue;
                        };
                        if deletes.get(mid).is_none_or(|(_, prev_ts)| e_ts >= *prev_ts) {
                            deletes.insert(mid.to_owned(), (author.to_owned(), e_ts));
                        }
                    }
                    Some("chat_react") => {
                        let Some(mid) = b.get("messageId").and_then(Value::as_str) else {
                            continue;
                        };
                        let Some(emoji) = b
                            .get("emoji")
                            .and_then(Value::as_str)
                            .filter(|e| CHAT_REACTIONS.contains(e))
                        else {
                            continue;
                        };
                        let on = b.get("on").and_then(Value::as_bool).unwrap_or(false);
                        participants.insert(author.to_owned());
                        remember_peer(member_id_of(author), author);
                        let by_user = reacts
                            .entry(mid.to_owned())
                            .or_default()
                            .entry(emoji.to_owned())
                            .or_default();
                        if by_user
                            .get(author)
                            .is_none_or(|(prev_ts, _)| e_ts >= *prev_ts)
                        {
                            by_user.insert(author.to_owned(), (e_ts, on));
                        }
                    }
                    _ => {}
                }
            }
        }

        let mut id_map: HashMap<String, (u32, u32, String)> = HashMap::new();
        let mut messages: Vec<Message> = Vec::new();
        let mut next_id = 1u32;

        for (wire_id, author, ts, orig_text, reply_wire) in raw_msgs {
            if deleted_msgs.contains(&wire_id) {
                continue;
            }
            // Like the web, only the sender deletes a message in a private room.
            if deletes
                .get(&wire_id)
                .is_some_and(|(del_by, _)| del_by == &author)
            {
                continue;
            }
            let (text, edited) = match edits.get(&wire_id) {
                Some((ed_by, _, new_text)) if ed_by == &author => (new_text.clone(), true),
                _ => (orig_text, false),
            };
            let author_id = member_id_of(&author);
            let num_id = next_id;
            next_id += 1;

            let reply_to = reply_wire.and_then(|rw| {
                id_map
                    .get(&rw)
                    .map(|(target_id, target_author, target_text)| ReplyTo {
                        message: *target_id,
                        author: *target_author,
                        preview: radica_app::chat::model::preview(target_text, 64),
                    })
            });

            let mut msg_reactions: Vec<Reaction> = Vec::new();
            if let Some(emoji_map) = reacts.get(&wire_id) {
                for (emoji, users) in emoji_map {
                    let by: Vec<u32> = users
                        .iter()
                        .filter_map(|(pk, (_, on))| (*on).then(|| member_id_of(pk)))
                        .collect();
                    if !by.is_empty() {
                        msg_reactions.push(Reaction {
                            emoji: emoji.clone(),
                            by,
                        });
                    }
                }
            }

            id_map.insert(wire_id.clone(), (num_id, author_id, text.clone()));
            remember_wire_id(&room_key, num_id, &wire_id);
            messages.push(Message {
                id: num_id,
                author: author_id,
                time: ms_to_minutes(ts, day_zero),
                text,
                reply_to,
                reactions: msg_reactions,
                edited,
            });
        }

        let mut members: Vec<Member> = Vec::new();
        let mut seen_ids: BTreeSet<u32> = BTreeSet::new();
        for pk in participants {
            let id = member_id_of(&pk);
            if !seen_ids.insert(id) {
                continue;
            }
            let nickname = names
                .get(&pk)
                .cloned()
                .unwrap_or_else(|| short_persona(&pk));
            let role = if pk == pr.creator {
                Role::Owner
            } else {
                Role::Member
            };
            let av = avatars.get(&pk).cloned();
            members.push(Member::new(id, nickname, role).with_avatar(Some(pk.clone()), av));
        }

        let invite_link = format!(
            "#join_room={}&key={}&name={}",
            pr.id,
            pr.key_hex,
            percent_encode(&pr.name)
        );
        out.push(Room {
            key: room_key,
            name: format!("🔒 {}", pr.name),
            description: format!("E2EE Private Group Room · AES-256-GCM · Invite: {invite_link}"),
            private: true,
            members,
            messages,
            me: me_id,
            unread: 0,
        });
    }
    out
}

fn build_dm_rooms(
    my_pk: &str,
    me_id: u32,
    day_zero: i64,
    names: &HashMap<String, String>,
    avatars: &HashMap<String, String>,
    deleted_msgs: &BTreeSet<String>,
    inbox_json: Option<&Value>,
) -> Vec<Room> {
    let Some(json) = inbox_json else {
        return Vec::new();
    };
    let Some(entries) = json.get("entries").and_then(Value::as_object) else {
        return Vec::new();
    };
    let (sk, _) = local_identity();
    let my_seed = sk.to_bytes();

    // (message id, who deleted it): a delete counts only from me or the message's sender.
    let mut dm_deletes: BTreeSet<(String, String)> = BTreeSet::new();
    for e in entries.values() {
        let Some(deleter) = e.get("author").and_then(Value::as_str) else {
            continue;
        };
        let Some(body_str) = e.get("body").and_then(Value::as_str) else {
            continue;
        };
        let Ok(b) = serde_json::from_str::<Value>(body_str) else {
            continue;
        };
        let b_type = b.get("type").and_then(Value::as_str).unwrap_or("");
        if b_type == "chat_delete" || b_type == "chat_burn" {
            if let Some(mid) = b.get("messageId").and_then(Value::as_str) {
                dm_deletes.insert((mid.to_owned(), deleter.to_owned()));
            } else if let Some(m) = b.get("message")
                && let Some(mid) = m.get("id").and_then(Value::as_str)
            {
                dm_deletes.insert((mid.to_owned(), deleter.to_owned()));
            }
        }
    }

    let mut by_peer: BTreeMap<String, Vec<(u64, String, String, String)>> = BTreeMap::new();
    for e in entries.values() {
        let Some(author) = e.get("author").and_then(Value::as_str) else {
            continue;
        };
        let e_ts = e.get("ts").and_then(Value::as_u64).unwrap_or(0);
        let Some(body_str) = e.get("body").and_then(Value::as_str) else {
            continue;
        };
        let Ok(b) = serde_json::from_str::<Value>(body_str) else {
            continue;
        };
        if b.get("type").and_then(Value::as_str) != Some("chat") {
            continue;
        }
        let Some(m) = b.get("message") else {
            continue;
        };
        let msg_id = m.get("id").and_then(Value::as_str).unwrap_or("").to_owned();
        let sender = m.get("sender").and_then(Value::as_str).unwrap_or("");
        let deleted_by = |who: &str| dm_deletes.contains(&(msg_id.clone(), who.to_owned()));
        if !msg_id.is_empty()
            && (deleted_msgs.contains(&msg_id) || deleted_by(my_pk) || deleted_by(sender))
        {
            continue;
        }
        let recipient = m.get("recipient").and_then(Value::as_str).unwrap_or("");
        let Some(text) = m.get("text").and_then(Value::as_str) else {
            continue;
        };
        if sender != author || text.trim().is_empty() {
            continue;
        }
        let peer_pk = if sender == my_pk {
            recipient
        } else if recipient == my_pk {
            sender
        } else {
            continue;
        };
        if peer_pk.is_empty() || peer_pk == "community" || peer_pk == my_pk {
            continue;
        }
        let ts = m.get("timestamp").and_then(Value::as_u64).unwrap_or(e_ts);
        let display_text = if text.starts_with("e2e:") {
            let peer_enc = lookup_peer_enc_pub(peer_pk);
            decrypt_direct_message(&my_seed, &peer_enc, text)
                .or_else(|| decrypt_direct_message(&my_seed, peer_pk, text))
                .unwrap_or_else(|| "🔒 Encrypted E2EE message".to_owned())
        } else {
            text.to_owned()
        };
        by_peer.entry(peer_pk.to_owned()).or_default().push((
            ts,
            sender.to_owned(),
            display_text,
            msg_id,
        ));
    }

    let me_nick = names
        .get(my_pk)
        .cloned()
        .unwrap_or_else(|| short_persona(my_pk));
    let mut out = Vec::new();
    for (peer_pk, mut list) in by_peer {
        list.sort_by_key(|(ts, _, _, _)| *ts);
        let peer_id = member_id_of(&peer_pk);
        remember_peer(peer_id, &peer_pk);
        let peer_nick = names
            .get(&peer_pk)
            .cloned()
            .unwrap_or_else(|| short_persona(&peer_pk));
        let room_key = format!("dm:{peer_id}");
        let mut messages = Vec::with_capacity(list.len());
        for (i, (ts, sender, text, wire_id)) in list.into_iter().enumerate() {
            let num_id = (i as u32) + 1;
            if !wire_id.is_empty() {
                remember_wire_id(&room_key, num_id, &wire_id);
            }
            messages.push(Message {
                id: num_id,
                author: member_id_of(&sender),
                time: ms_to_minutes(ts, day_zero),
                text,
                reply_to: None,
                reactions: Vec::new(),
                edited: false,
            });
        }
        out.push(Room {
            key: room_key,
            name: peer_nick.clone(),
            description: format!("Direct E2EE session with {peer_nick} · X25519 + AES-256-GCM"),
            private: true,
            members: vec![
                Member::new(me_id, me_nick.clone(), Role::Member)
                    .with_avatar(Some(my_pk.to_owned()), avatars.get(my_pk).cloned()),
                Member::new(peer_id, peer_nick, Role::Member)
                    .with_avatar(Some(peer_pk.clone()), avatars.get(&peer_pk).cloned()),
            ],
            messages,
            me: me_id,
            unread: 0,
        });
    }
    out
}

fn append_log_entry(log_name: &str, body_val: &Value) -> Result<(), String> {
    let stored = load_stored_identity();
    let (sk, pubkey) = local_identity();
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let body = serde_json::to_string(body_val).map_err(|e| e.to_string())?;
    let params_hex = hex::encode(log_params(log_name).as_bytes());
    let entry_id = format!("dsk_{ts}");
    // Matches `entry_msg` in `log-contract/src/lib.rs`.
    let entry_msg = format!("radica/log/v1:{params_hex}:{pubkey}:{entry_id}:{ts}:{body}");
    let entry_sig = hex::encode(sk.sign(entry_msg.as_bytes()).to_bytes());

    let mut entry_obj = json!({
        "author": pubkey,
        "id": entry_id,
        "ts": ts,
        "body": body,
        "sig": entry_sig,
    });
    if stored.kind == "viso"
        && let Some(cert) = &stored.cert
        && let Some(map) = entry_obj.as_object_mut()
    {
        map.insert("cert".into(), cert.to_json());
    }

    let delta = json!({
        "entries": {
            format!("{pubkey}:{entry_id}"): entry_obj
        }
    });

    let tmp = tempfile::NamedTempFile::new().map_err(|e| e.to_string())?;
    fs::write(tmp.path(), delta.to_string()).map_err(|e| e.to_string())?;

    let key = log_contract_key(log_name);
    let mut cmd = Command::new(find_fdev());
    cmd.args([
        "execute",
        "update",
        "--timeout",
        "15",
        &key,
        &tmp.path().to_string_lossy(),
    ]);
    host::run(&mut cmd)
}

fn update_feed_contract(owner_pk: &str, mut delta_val: Value) -> Result<(), String> {
    let stored = load_stored_identity();
    if stored.kind == "viso"
        && let Some(cert) = &stored.cert
        && let Some(map) = delta_val.as_object_mut()
    {
        let mut certs = BTreeMap::new();
        certs.insert(stored.pubkey, cert.to_json());
        map.insert("certs".into(), json!(certs));
    }
    let Some(key) = feed_contract_key(owner_pk) else {
        return Err("Invalid feed owner pubkey".into());
    };
    let tmp = tempfile::NamedTempFile::new().map_err(|e| e.to_string())?;
    fs::write(tmp.path(), delta_val.to_string()).map_err(|e| e.to_string())?;
    let mut cmd = Command::new(find_fdev());
    cmd.args([
        "execute",
        "update",
        "--timeout",
        "15",
        &key,
        &tmp.path().to_string_lossy(),
    ]);
    host::run(&mut cmd)
}

/// Sign and push a live message to `community-chat/<room_key>` on the local Freenet node.
pub fn send_live(room_key: &str, text: &str) -> Result<(), String> {
    act_live(LiveAction::SendMessage {
        room_key: room_key.to_owned(),
        text: text.to_owned(),
        reply_to: None,
    })
}

/// Execute any signed Messenger action (`SendMessage`, `ReactMessage`, `EditMessage`,
/// `DeleteMessage`, `CreateRoom`, `CreatePrivateRoom`, `JoinRoom`, `ToggleFollow`, etc.)
/// against the local Freenet node.
pub fn act_live(action: LiveAction) -> Result<(), String> {
    let (sk, pubkey) = local_identity();
    let my_seed = sk.to_bytes();
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    match action {
        LiveAction::SendMessage {
            room_key,
            text,
            reply_to,
        } => {
            remember_pending_message(&room_key, &text, reply_to, ts);
            if let Some(peer_id_str) = room_key.strip_prefix("dm:")
                && let Ok(peer_id) = peer_id_str.parse::<u32>()
                && let Some(peer_pk) = lookup_peer(peer_id)
            {
                let (a, b) = if pubkey <= peer_pk {
                    (&pubkey, &peer_pk)
                } else {
                    (&peer_pk, &pubkey)
                };
                let dm_room_id = format!("{a}:{b}");
                let msg_id = format!("msg_{ts}_dsk");
                let peer_enc = lookup_peer_enc_pub(&peer_pk);
                let wire_text = encrypt_direct_message(&my_seed, &peer_enc, &text)
                    .or_else(|| encrypt_direct_message(&my_seed, &peer_pk, &text))
                    .unwrap_or_else(|| text.clone());
                let sig_msg = format!("{msg_id}:{dm_room_id}:{pubkey}:{peer_pk}:{wire_text}:{ts}");
                let msg_sig = hex::encode(sk.sign(sig_msg.as_bytes()).to_bytes());
                let payload = json!({
                    "type": "chat",
                    "message": {
                        "id": msg_id,
                        "room_id": dm_room_id,
                        "sender": pubkey,
                        "recipient": peer_pk,
                        "text": wire_text,
                        "timestamp": ts,
                        "sig": msg_sig,
                    }
                });
                let _ = append_log_entry(&format!("inbox/{pubkey}"), &payload);
                return append_log_entry(&format!("inbox/{peer_pk}"), &payload);
            }
            if let Some(priv_id) = room_key.strip_prefix("priv:") {
                let priv_room = load_private_rooms()
                    .into_iter()
                    .find(|r| r.id == priv_id)
                    .ok_or_else(|| "Unknown private room".to_owned())?;
                let sym_key = decode_sym_key(&priv_room.key_hex)
                    .ok_or_else(|| "Invalid private room key".to_owned())?;
                let wire_text = encrypt_with_symmetric_key(&sym_key, &text)
                    .ok_or_else(|| "Failed to encrypt message for private room".to_owned())?;
                let room_id = format!("room_{priv_id}");
                let msg_id = format!("msg_{ts}_dsk");
                let sig_msg = format!("{msg_id}:{room_id}:{pubkey}:private:{wire_text}:{ts}");
                let msg_sig = hex::encode(sk.sign(sig_msg.as_bytes()).to_bytes());
                let mut msg_obj = json!({
                    "id": msg_id,
                    "room_id": room_id,
                    "sender": pubkey,
                    "text": wire_text,
                    "timestamp": ts,
                    "sig": msg_sig,
                });
                if let Some(rep_num) = reply_to
                    && let Some(rep_wire) = lookup_wire_id(&room_key, rep_num)
                    && let Some(obj) = msg_obj.as_object_mut()
                {
                    obj.insert("reply_to".into(), Value::String(rep_wire));
                }
                return append_log_entry(
                    &format!("room/{priv_id}"),
                    &json!({ "type": "chat", "message": msg_obj }),
                );
            }
            if !room_key.starts_with("c_") {
                return Err(
                    "Only community, private, and DM rooms accept direct chat messages".into(),
                );
            }
            let room_id = format!("comm_{room_key}");
            let msg_id = format!("msg_{ts}_dsk");
            let sig_msg = format!("{msg_id}:{room_id}:{pubkey}:community:{text}:{ts}");
            let msg_sig = hex::encode(sk.sign(sig_msg.as_bytes()).to_bytes());
            let mut msg_obj = json!({
                "id": msg_id,
                "room_id": room_id,
                "sender": pubkey,
                "community_id": room_key,
                "text": text,
                "timestamp": ts,
                "sig": msg_sig,
            });
            if let Some(rep_num) = reply_to
                && let Some(rep_wire) = lookup_wire_id(&room_key, rep_num)
                && let Some(obj) = msg_obj.as_object_mut()
            {
                obj.insert("reply_to".into(), Value::String(rep_wire));
            }
            append_log_entry(
                &format!("community-chat/{room_key}"),
                &json!({ "type": "chat", "message": msg_obj }),
            )
        }
        LiveAction::ReactMessage {
            room_key,
            msg_id,
            emoji,
            on,
        } => {
            if let Some(priv_id) = room_key.strip_prefix("priv:") {
                let wire_id =
                    lookup_wire_id(&room_key, msg_id).unwrap_or_else(|| format!("msg_{msg_id}"));
                return append_log_entry(
                    &format!("room/{priv_id}"),
                    &json!({
                        "type": "chat_react",
                        "roomId": format!("room_{priv_id}"),
                        "messageId": wire_id,
                        "emoji": emoji,
                        "on": on,
                    }),
                );
            }
            if !room_key.starts_with("c_") {
                return Ok(());
            }
            let wire_id =
                lookup_wire_id(&room_key, msg_id).unwrap_or_else(|| format!("msg_{msg_id}"));
            append_log_entry(
                &format!("community-chat/{room_key}"),
                &json!({
                    "type": "chat_react",
                    "roomId": format!("comm_{room_key}"),
                    "messageId": wire_id,
                    "emoji": emoji,
                    "on": on,
                }),
            )
        }
        LiveAction::EditMessage {
            room_key,
            msg_id,
            new_text,
        } => {
            if let Some(priv_id) = room_key.strip_prefix("priv:") {
                let priv_room = load_private_rooms()
                    .into_iter()
                    .find(|r| r.id == priv_id)
                    .ok_or_else(|| "Unknown private room".to_owned())?;
                let sym_key = decode_sym_key(&priv_room.key_hex)
                    .ok_or_else(|| "Invalid private room key".to_owned())?;
                let wire_text = encrypt_with_symmetric_key(&sym_key, &new_text)
                    .ok_or_else(|| "Failed to encrypt edit for private room".to_owned())?;
                let wire_id =
                    lookup_wire_id(&room_key, msg_id).unwrap_or_else(|| format!("msg_{msg_id}"));
                return append_log_entry(
                    &format!("room/{priv_id}"),
                    &json!({
                        "type": "chat_edit",
                        "roomId": format!("room_{priv_id}"),
                        "messageId": wire_id,
                        "text": wire_text,
                    }),
                );
            }
            if !room_key.starts_with("c_") {
                return Ok(());
            }
            let wire_id =
                lookup_wire_id(&room_key, msg_id).unwrap_or_else(|| format!("msg_{msg_id}"));
            append_log_entry(
                &format!("community-chat/{room_key}"),
                &json!({
                    "type": "chat_edit",
                    "roomId": format!("comm_{room_key}"),
                    "messageId": wire_id,
                    "text": new_text,
                }),
            )
        }
        LiveAction::DeleteMessage { room_key, msg_id } => {
            let wire_id =
                lookup_wire_id(&room_key, msg_id).unwrap_or_else(|| format!("msg_{msg_id}"));
            remember_deleted_message(&wire_id);
            remove_pending_message(&room_key, None);

            if let Some(priv_id) = room_key.strip_prefix("priv:") {
                return append_log_entry(
                    &format!("room/{priv_id}"),
                    &json!({
                        "type": "chat_delete",
                        "roomId": format!("room_{priv_id}"),
                        "messageId": wire_id,
                    }),
                );
            }
            if let Some(peer_id_str) = room_key.strip_prefix("dm:")
                && let Ok(peer_id) = peer_id_str.parse::<u32>()
            {
                let peer_pk = lookup_peer(peer_id);
                let (a, b) = if let Some(ref pk) = peer_pk {
                    if pubkey <= *pk {
                        (&pubkey, pk)
                    } else {
                        (pk, &pubkey)
                    }
                } else {
                    (&pubkey, &pubkey)
                };
                let dm_room_id = format!("{a}:{b}");
                let payload = json!({
                    "type": "chat_delete",
                    "roomId": dm_room_id,
                    "messageId": wire_id,
                });
                let _ = append_log_entry(&format!("inbox/{pubkey}"), &payload);
                if let Some(ref pk) = peer_pk {
                    let _ = append_log_entry(&format!("inbox/{pk}"), &payload);
                }
                return Ok(());
            }
            if room_key.starts_with("c_") {
                return append_log_entry(
                    &format!("community-chat/{room_key}"),
                    &json!({
                        "type": "chat_delete",
                        "roomId": format!("comm_{room_key}"),
                        "messageId": wire_id,
                    }),
                );
            }
            Ok(())
        }
        LiveAction::CreateRoom { slug, name } => {
            let comm_id = format!("c_{slug}");
            remember_joined_community(&comm_id);
            append_log_entry(
                "communities",
                &json!({
                    "type": "community_create",
                    "community": {
                        "id": comm_id,
                        "name": name,
                        "description": format!("Public Freenet community #r/{slug}"),
                    }
                }),
            )
        }
        LiveAction::CreatePrivateRoom { name } => {
            let slug: String = name
                .trim()
                .trim_start_matches("🔒")
                .trim()
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
                .to_owned();
            let id_bytes = entropy_32("radica-private-room-id");
            let id_suffix = hex::encode(&id_bytes[..4]);
            let id = if slug.is_empty() {
                id_suffix
            } else {
                format!("{slug}-{id_suffix}")
            };
            let key_hex = hex::encode(entropy_32("radica-private-room-aes256"));
            save_private_room(&StoredPrivateRoom {
                id,
                name: name.trim().trim_start_matches("🔒").trim().to_owned(),
                key_hex,
                creator: pubkey,
            });
            Ok(())
        }
        LiveAction::JoinRoom { code } => {
            let trimmed = code.trim();
            if trimmed.contains("join_room=") {
                let fragment = trimmed
                    .split_once('#')
                    .map_or(trimmed, |(_, f)| f)
                    .trim_start_matches('#');
                let params = parse_query_params(fragment);
                if let (Some(id), Some(key_hex)) = (params.get("join_room"), params.get("key"))
                    && !id.is_empty()
                    && key_hex.len() == 64
                {
                    let name = params
                        .get("name")
                        .cloned()
                        .unwrap_or_else(|| format!("Private Room {id}"));
                    save_private_room(&StoredPrivateRoom {
                        id: id.clone(),
                        name,
                        key_hex: key_hex.clone(),
                        creator: MAINTAINER_PK.to_owned(),
                    });
                    unhide_room(&format!("priv:{id}"));
                    return Ok(());
                }
            }
            if trimmed.starts_with("c_") {
                remember_joined_community(trimmed);
                unhide_room(trimmed);
            } else if let Some(slug) = trimmed.strip_prefix("#r/") {
                let comm_id = format!("c_{slug}");
                remember_joined_community(&comm_id);
                unhide_room(&comm_id);
            }
            Ok(())
        }
        LiveAction::RemoveRoom { room_key } => {
            remember_hidden_room(&room_key);
            if let Some(priv_id) = room_key.strip_prefix("priv:") {
                remove_private_room(priv_id);
            }
            if room_key.starts_with("c_") {
                remove_extra_community(&room_key);
            }
            Ok(())
        }
        LiveAction::ToggleFollow { member_id, follow } => {
            let Some(peer_pk) = lookup_peer(member_id) else {
                return Ok(());
            };
            let mut list = load_following();
            if follow {
                list.insert(peer_pk);
            } else {
                list.remove(&peer_pk);
            }
            save_following(&list);
            let sorted_pks: Vec<String> = list.into_iter().collect();
            let joined = sorted_pks.join(",");
            let sig_msg = format!("radica/following/v2:{pubkey}:{ts}:{joined}");
            let sig = hex::encode(sk.sign(sig_msg.as_bytes()).to_bytes());
            update_feed_contract(
                &pubkey,
                json!({
                    "following": {
                        "pubkeys": sorted_pks,
                        "updated_at": ts,
                        "sig": sig,
                    }
                }),
            )
        }
        LiveAction::SignInWithViso => sign_in_with_viso_flow(),
        LiveAction::CreateLocalIdentity => {
            generate_fresh_local_identity();
            Ok(())
        }
        LiveAction::ImportIdentity { raw } => import_identity_raw(&raw),
        LiveAction::UpdateDisplayName { display_name } => {
            let mut stored = load_stored_identity();
            stored.display_name = Some(display_name.clone());
            save_stored_identity(&stored);
            let enc_sk = SigningKey::from_bytes(&my_seed);
            let enc_pk = hex::encode(enc_sk.verifying_key().to_bytes());
            let prof_msg = format!("radica/profile/v3:{pubkey}:{display_name}:::{enc_pk}:{ts}");
            let prof_sig = hex::encode(sk.sign(prof_msg.as_bytes()).to_bytes());
            let _ = update_feed_contract(
                &pubkey,
                json!({
                    "profile": {
                        "display_name": display_name,
                        "bio": "",
                        "avatar_url": null,
                        "enc_pub": enc_pk,
                        "updated_at": ts,
                        "sig": prof_sig,
                    }
                }),
            );
            append_log_entry(
                "directory",
                &json!({
                    "type": "hello",
                    "display_name": display_name,
                    "ts": ts,
                }),
            )
        }
        LiveAction::SignOutIdentity => {
            generate_fresh_local_identity();
            Ok(())
        }
    }
}

fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 2);
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && i + 2 < bytes.len()
            && let Ok(hex_str) = std::str::from_utf8(&bytes[i + 1..i + 3])
            && let Ok(val) = u8::from_str_radix(hex_str, 16)
        {
            out.push(val);
            i += 3;
        } else if bytes[i] == b'+' {
            out.push(b' ');
            i += 1;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn parse_query_params(q: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for pair in q.split('&') {
        let pair = pair.trim();
        if pair.is_empty() {
            continue;
        }
        if let Some((k, v)) = pair.split_once('=') {
            let key = k.strip_prefix("amp;").unwrap_or(k);
            map.insert(percent_decode(key), percent_decode(v));
        }
    }
    map
}

/// Build `"whoiam-connect-v1" || pk(32) || u32le len || base || u32le len || challenge || u64le ts`
/// matching `connectMessage` in `ui/src/whoiam.ts` and `viso_core::connect`.
pub fn viso_connect_message(pk: &[u8; 32], base: &str, challenge: &str, ts: u64) -> Vec<u8> {
    let mut out = Vec::with_capacity(17 + 32 + 8 + base.len() + challenge.len() + 8);
    out.extend_from_slice(b"whoiam-connect-v1");
    out.extend_from_slice(pk);
    for f in [base, challenge] {
        out.extend_from_slice(&(f.len() as u32).to_le_bytes());
        out.extend_from_slice(f.as_bytes());
    }
    out.extend_from_slice(&ts.to_le_bytes());
    out
}

/// Multi-base certificate verification: tries base as given, trailing slash variants, and
/// any candidate bases (e.g. canonical base or link/return URL base). Updates `cert.base` to
/// the matching base on success.
pub fn verify_viso_cert_multi(
    persona_hex: &str,
    cert: &mut VisoCert,
    extra_bases: &[&str],
) -> bool {
    let Ok(pk_bytes) = hex::decode(persona_hex) else {
        return false;
    };
    let Ok(pk_arr) = <[u8; 32]>::try_from(pk_bytes.as_slice()) else {
        return false;
    };
    let Ok(vk) = VerifyingKey::from_bytes(&pk_arr) else {
        return false;
    };
    let Ok(sig_bytes) = hex::decode(&cert.sig) else {
        return false;
    };
    let Ok(sig_arr) = <[u8; 64]>::try_from(sig_bytes.as_slice()) else {
        return false;
    };
    let sig = Signature::from_bytes(&sig_arr);

    let mut candidates: Vec<String> = Vec::new();
    let mut add_candidate = |b: &str| {
        let trimmed = b.trim();
        if trimmed.is_empty() {
            return;
        }
        let no_slash = trimmed.trim_end_matches('/').to_owned();
        let with_slash = format!("{no_slash}/");
        if !candidates.contains(&trimmed.to_owned()) {
            candidates.push(trimmed.to_owned());
        }
        if !candidates.contains(&no_slash) {
            candidates.push(no_slash);
        }
        if !candidates.contains(&with_slash) {
            candidates.push(with_slash);
        }
    };

    add_candidate(&cert.base);
    for eb in extra_bases {
        add_candidate(eb);
    }

    for cand in candidates {
        let msg = viso_connect_message(&pk_arr, &cand, &cert.challenge, cert.ts);
        if vk.verify_strict(&msg, &sig).is_ok() {
            cert.base = cand;
            return true;
        }
    }

    false
}

pub fn verify_viso_cert(persona_hex: &str, cert: &VisoCert) -> bool {
    let mut c = cert.clone();
    let canonical = format!("http://127.0.0.1:7509{APP_PATH}");
    verify_viso_cert_multi(persona_hex, &mut c, &[&canonical])
}

fn open_in_browser(url: &str) {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", url])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open").arg(url).spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = Command::new("xdg-open").arg(url).spawn();
    }
}

/// 1-click Login with Viso: binds a temporary local callback listener on `127.0.0.1:0`, opens
/// Viso on the local Freenet node (`127.0.0.1:7509/v1/contract/web/<VISO_KEY>/`), and receives
/// the signed persona delegation certificate (`whoiam-connect-v1`) + shared app key (`#sk=`).
fn sign_in_with_viso_flow() -> Result<(), String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let _ = listener.set_nonblocking(true);

    let nonce_full = entropy_32("radica-desktop-viso-nonce");
    let nonce_hex = hex::encode(&nonce_full[..16]);
    let fallback_sk = entropy_32("radica-desktop-viso-app-sk");
    let fallback_app_pk = hex::encode(
        SigningKey::from_bytes(&fallback_sk)
            .verifying_key()
            .to_bytes(),
    );
    let challenge = format!("wd1.{fallback_app_pk}.{nonce_hex}");

    let return_url = format!("http://127.0.0.1:{port}{APP_PATH}");
    let canonical_base = format!("http://127.0.0.1:7509{APP_PATH}");
    let viso_url = format!(
        "http://127.0.0.1:7509/v1/contract/web/{VISO_KEY}/?connect=v1&challenge={challenge}&return={}&base={}&key=v1",
        percent_encode(&return_url),
        percent_encode(&canonical_base),
    );
    open_in_browser(&viso_url);

    let start = Instant::now();
    let mut captured_params: Option<HashMap<String, String>> = None;
    let mut captured_sk: Option<String> = None;

    while start.elapsed() < Duration::from_secs(120) {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
                let mut buf = [0u8; 8192];
                let n = stream.read(&mut buf).unwrap_or(0);
                let req = String::from_utf8_lossy(&buf[..n]);
                let first_line = req.lines().next().unwrap_or("");
                let mut parts = first_line.split_whitespace();
                let method = parts.next().unwrap_or("");
                let path_and_query = parts.next().unwrap_or("");

                // Handle CORS preflight
                if method == "OPTIONS" {
                    let resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n";
                    let _ = stream.write_all(resp.as_bytes());
                    let _ = stream.flush();
                    continue;
                }

                // Check query string and request body for parameters
                let mut params = HashMap::new();
                if let Some((_, q)) = path_and_query.split_once('?') {
                    params.extend(parse_query_params(q));
                }
                if method == "POST"
                    && let Some((_, body)) = req.split_once("\r\n\r\n")
                {
                    let body_trimmed = body.trim();
                    if body_trimmed.starts_with('{') {
                        if let Ok(json_val) = serde_json::from_str::<Value>(body_trimmed) {
                            if let Some(obj) = json_val.as_object() {
                                for (k, v) in obj {
                                    if let Some(s) = v.as_str() {
                                        params.insert(k.clone(), s.to_string());
                                    }
                                }
                            }
                        }
                    } else if body_trimmed.contains('=') {
                        params.extend(parse_query_params(body_trimmed));
                    }
                }

                if let Some(sk) = params.get("sk").filter(|s| s.len() == 64) {
                    captured_sk = Some(sk.clone());
                }
                if params.contains_key("pk") && params.contains_key("sig") {
                    if let Some(ref mut existing) = captured_params {
                        existing.extend(params.clone());
                    } else {
                        captured_params = Some(params.clone());
                    }
                } else if let Some(ref mut existing) = captured_params {
                    existing.extend(params.clone());
                }

                // If user denied access in Viso
                if params.get("viso").map(String::as_str) == Some("denied")
                    || params.get("whoiam").map(String::as_str) == Some("denied")
                {
                    let html = concat!(
                        "<!doctype html><html><head><meta charset='utf-8'><title>Radica Desktop · Sign-in Cancelled</title>",
                        "<style>body{background:#12110e;color:#f3efe6;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}",
                        ".card{background:#1c1a16;border:1px solid #78350f;border-radius:16px;padding:28px 36px;text-align:center;max-width:420px}",
                        "h2{color:#f59e0b;margin:0 0 10px 0}p{color:#b6afa2;margin:0;font-size:14px}</style></head><body>",
                        "<div class='card'><h2>Connection Cancelled</h2><p>You chose not to share a persona in Viso. You can close this browser tab.</p></div></body></html>"
                    );
                    let resp = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        html.len(),
                        html
                    );
                    let _ = stream.write_all(resp.as_bytes());
                    let _ = stream.flush();
                    return Err("You chose not to share a persona in Viso.".into());
                }

                // Check if this request is /__viso_complete or /__viso_sk
                let is_complete_endpoint = path_and_query.starts_with("/__viso_complete")
                    || path_and_query.starts_with("/__viso_sk");

                // Check if we now have both cert params and captured_sk
                let current_sk = captured_sk.clone();
                let current_params = captured_params.clone();

                if let (Some(sk), Some(p)) = (current_sk, current_params) {
                    let pk = p.get("pk").cloned().unwrap_or_default();
                    let sig = p.get("sig").cloned().unwrap_or_default();
                    let cert_challenge = p.get("challenge").cloned().unwrap_or(challenge.clone());
                    let ts: u64 = p.get("ts").and_then(|s| s.parse().ok()).unwrap_or(0);
                    let base = p
                        .get("base")
                        .cloned()
                        .unwrap_or_else(|| canonical_base.clone());

                    let mut cert = VisoCert {
                        base,
                        challenge: cert_challenge,
                        ts,
                        sig,
                    };

                    let sk_bytes_res = hex::decode(&sk);
                    let sk_arr_res: Result<[u8; 32], _> = sk_bytes_res
                        .as_ref()
                        .map_err(|_| ())
                        .and_then(|b| b.as_slice().try_into().map_err(|_| ()));

                    if let Ok(sk_arr) = sk_arr_res {
                        let app_pk =
                            hex::encode(SigningKey::from_bytes(&sk_arr).verifying_key().to_bytes());
                        if !cert.challenge.contains(&app_pk) {
                            let json = r#"{"ok":false,"error":"Challenge does not match delegated app key"}"#;
                            let resp = format!(
                                "HTTP/1.1 400 Bad Request\r\nContent-Type: application/json; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                json.len(),
                                json
                            );
                            let _ = stream.write_all(resp.as_bytes());
                            let _ = stream.flush();
                            return Err(
                                "Viso callback challenge does not match the app's signing key."
                                    .into(),
                            );
                        }

                        if !verify_viso_cert_multi(&pk, &mut cert, &[&canonical_base, &return_url])
                        {
                            let json =
                                r#"{"ok":false,"error":"Viso signature verification failed"}"#;
                            let resp = format!(
                                "HTTP/1.1 400 Bad Request\r\nContent-Type: application/json; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                json.len(),
                                json
                            );
                            let _ = stream.write_all(resp.as_bytes());
                            let _ = stream.flush();
                            return Err("Viso signature verification failed.".into());
                        }

                        // Success!
                        let id = StoredDesktopIdentity {
                            kind: "viso".into(),
                            pubkey: pk.clone(),
                            signing_sk: sk,
                            display_name: None,
                            cert: Some(cert),
                        };
                        save_stored_identity(&id);

                        let persona_name = short_persona(&pk);
                        if is_complete_endpoint {
                            let json = format!(r#"{{"ok":true,"persona":"{persona_name}"}}"#);
                            let resp = format!(
                                "HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                json.len(),
                                json
                            );
                            let _ = stream.write_all(resp.as_bytes());
                            let _ = stream.flush();
                        } else {
                            let html = format!(
                                concat!(
                                    "<!doctype html><html><head><meta charset='utf-8'><title>Radica Desktop · Viso Connected</title>",
                                    "<style>body{{background:#12110e;color:#f3efe6;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}}",
                                    ".card{{background:#1c1a16;border:1px solid #35583a;border-radius:16px;padding:28px 36px;text-align:center;max-width:420px}}",
                                    "h2{{color:#4ade80;margin:0 0 10px 0}}p{{color:#b6afa2;margin:0;font-size:14px}}",
                                    ".p{{background:#26231d;padding:6px 12px;border-radius:6px;font-family:monospace;color:#4ade80;margin:12px 0;display:inline-block}}</style></head><body>",
                                    "<div class='card'><h2>✓ Viso Persona Connected</h2><div class='p'>{}</div><p>Radica Desktop is now signed in with your Viso Persona. You can close this browser tab.</p></div>",
                                    "</body></html>"
                                ),
                                persona_name
                            );
                            let resp = format!(
                                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                html.len(),
                                html
                            );
                            let _ = stream.write_all(resp.as_bytes());
                            let _ = stream.flush();
                        }
                        return Ok(());
                    }
                }

                // Transitional HTML page that extracts #sk and calls /__viso_complete
                let html = concat!(
                    "<!doctype html><html><head><meta charset='utf-8'><title>Radica Desktop · Connecting Viso</title>",
                    "<style>body{background:#12110e;color:#f3efe6;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}",
                    ".card{background:#1c1a16;border:1px solid #35583a;border-radius:16px;padding:28px 36px;text-align:center;max-width:440px;box-shadow:0 10px 30px rgba(0,0,0,0.5)}",
                    "h2{margin:0 0 12px 0;color:#e2b340}p{color:#b6afa2;margin:0 0 12px 0;font-size:14px;line-height:1.4}",
                    ".hint{font-size:12px;color:#8c8577;margin-top:16px;text-align:left;background:#161512;padding:10px;border-radius:8px;border:1px solid #2b2823;word-break:break-all}</style></head><body>",
                    "<div class='card' id='box'><h2 id='t'>Connecting Viso…</h2><p id='d'>Transferring keys to Radica Desktop…</p>",
                    "<div class='hint'><strong>Tip:</strong> If not connected in a few seconds, copy this page URL from your address bar and paste into <em>Identity &rarr; Import</em> in Radica Desktop.</div></div>",
                    "<script>",
                    "(async function(){",
                    "try{",
                    "var h=location.hash||'';var s=location.search||'';",
                    "var m=/(?:^|[#&])sk=([0-9a-fA-F]{64})/.exec(h+'&'+s);",
                    "var sk=m?m[1]:'';",
                    "var url='/__viso_complete?sk='+encodeURIComponent(sk)+'&'+s.replace(/^\\?/,'');",
                    "var r=await fetch(url,{method:'POST'});",
                    "var d=await r.json();",
                    "if(r.ok&&d.ok){",
                    "document.getElementById('t').style.color='#4ade80';",
                    "document.getElementById('t').textContent='✓ Viso Persona Connected';",
                    "document.getElementById('d').innerHTML=(d.persona?'<strong>'+d.persona+'</strong><br>':'')+'Radica Desktop is now signed in. You can close this tab.';",
                    "}else{throw new Error(d.error||'Failed');}",
                    "}catch(e){",
                    "document.getElementById('t').style.color='#f87171';",
                    "document.getElementById('t').textContent='Key Transfer Incomplete';",
                    "document.getElementById('d').textContent='Please copy the full URL from the browser address bar and paste it into Identity → Import in Radica Desktop.';",
                    "}",
                    "})();",
                    "</script>",
                    "</body></html>"
                );
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    html.len(),
                    html
                );
                let _ = stream.write_all(resp.as_bytes());
                let _ = stream.flush();
            }
            Err(_) => std::thread::sleep(Duration::from_millis(50)),
        }
    }

    Err("Timed out waiting for Viso sign-in. You can copy the full callback URL from your browser into the Identity panel.".into())
}

/// Import either a 64-hex Ed25519 secret key, a JSON session, OR a Viso callback URL.
pub fn import_identity_raw(raw: &str) -> Result<(), String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Import string cannot be empty.".into());
    }

    // 1. Try parsing as JSON session or identity object
    if (trimmed.starts_with('{') && trimmed.ends_with('}'))
        || (trimmed.starts_with("\"{") && trimmed.ends_with("\"}"))
    {
        let unquoted = if trimmed.starts_with('"') {
            serde_json::from_str::<String>(trimmed).unwrap_or_else(|_| trimmed.to_owned())
        } else {
            trimmed.to_owned()
        };
        if let Ok(val) = serde_json::from_str::<Value>(&unquoted) {
            let pubkey = val
                .get("pubkey")
                .or_else(|| val.get("persona"))
                .and_then(Value::as_str)
                .map(str::to_owned);
            let signing_sk = val
                .get("signing_sk")
                .or_else(|| val.get("app_key"))
                .or_else(|| val.get("sk"))
                .or_else(|| val.get("secret_key"))
                .and_then(Value::as_str)
                .map(str::to_owned);
            let cert_val = val.get("cert").and_then(VisoCert::from_json);

            if let Some(mut cert) = cert_val
                && let Some(pk) = pubkey
                && pk.len() == 64
            {
                let sk = signing_sk
                    .or_else(|| {
                        let cur = load_stored_identity();
                        if let Ok(cur_bytes) = hex::decode(&cur.signing_sk)
                            && let Ok(cur_arr) = <[u8; 32]>::try_from(cur_bytes.as_slice())
                        {
                            let cur_pk = hex::encode(
                                SigningKey::from_bytes(&cur_arr).verifying_key().to_bytes(),
                            );
                            if cert.challenge.contains(&cur_pk) {
                                return Some(cur.signing_sk);
                            }
                        }
                        None
                    })
                    .ok_or_else(|| {
                        "Viso JSON import requires the signing secret key (signing_sk or app_key)."
                            .to_owned()
                    })?;

                let sk_bytes = hex::decode(&sk).map_err(|_| "Invalid signing_sk hex")?;
                let sk_arr: [u8; 32] = sk_bytes
                    .as_slice()
                    .try_into()
                    .map_err(|_| "signing_sk must be 32 bytes")?;
                let app_pk =
                    hex::encode(SigningKey::from_bytes(&sk_arr).verifying_key().to_bytes());
                if !cert.challenge.contains(&app_pk) {
                    return Err("Viso challenge does not match the app's signing key.".into());
                }
                let canonical_base = format!("http://127.0.0.1:7509{APP_PATH}");
                if !verify_viso_cert_multi(&pk, &mut cert, &[&canonical_base]) {
                    return Err("Viso certificate signature failed to verify.".into());
                }
                let id = StoredDesktopIdentity {
                    kind: "viso".into(),
                    pubkey: pk,
                    signing_sk: sk,
                    display_name: val
                        .get("display_name")
                        .and_then(Value::as_str)
                        .map(str::to_owned),
                    cert: Some(cert),
                };
                save_stored_identity(&id);
                return Ok(());
            }

            if let Some(sk_hex) = signing_sk
                && sk_hex.len() == 64
                && sk_hex.chars().all(|c| c.is_ascii_hexdigit())
            {
                let sk_lower = sk_hex.to_ascii_lowercase();
                let bytes = hex::decode(&sk_lower).map_err(|_| "Invalid hex key")?;
                let arr: [u8; 32] = bytes.as_slice().try_into().map_err(|_| "Not 32 bytes")?;
                let sk = SigningKey::from_bytes(&arr);
                let pk = hex::encode(sk.verifying_key().to_bytes());
                let id = StoredDesktopIdentity {
                    kind: "local".into(),
                    pubkey: pk,
                    signing_sk: sk_lower,
                    display_name: val
                        .get("display_name")
                        .and_then(Value::as_str)
                        .map(str::to_owned),
                    cert: None,
                };
                save_stored_identity(&id);
                return Ok(());
            }
        }
    }

    // 2. Check for a Viso callback URL (`?viso=ok&pk=...&sig=...&challenge=...&ts=...#sk=...`)
    if trimmed.contains("pk=") && trimmed.contains("sig=") {
        let mut extra_base = None;
        if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            if let Some((url_before_query, _)) = trimmed.split_once('?') {
                extra_base = Some(url_before_query.to_owned());
            }
        }
        let query_and_hash = trimmed
            .split_once('?')
            .map_or(trimmed, |(_, rest)| rest)
            .replace('#', "&");
        let params = parse_query_params(&query_and_hash);
        let pk = params.get("pk").cloned().unwrap_or_default();
        let sig = params.get("sig").cloned().unwrap_or_default();
        let challenge = params.get("challenge").cloned().unwrap_or_default();
        let ts: u64 = params.get("ts").and_then(|s| s.parse().ok()).unwrap_or(0);
        let canonical_base = format!("http://127.0.0.1:7509{APP_PATH}");
        let base = params
            .get("base")
            .cloned()
            .unwrap_or_else(|| canonical_base.clone());
        let mut cert = VisoCert {
            base,
            challenge,
            ts,
            sig,
        };
        let mut candidate_bases = vec![canonical_base.as_str()];
        if let Some(ref eb) = extra_base {
            candidate_bases.push(eb.as_str());
        }
        if !verify_viso_cert_multi(&pk, &mut cert, &candidate_bases) {
            return Err("Viso callback signature failed to verify.".into());
        }
        let signing_sk = params
            .get("sk")
            .filter(|s| s.len() == 64)
            .cloned()
            .or_else(|| {
                let cur = load_stored_identity();
                if let Ok(cur_bytes) = hex::decode(&cur.signing_sk)
                    && let Ok(cur_arr) = <[u8; 32]>::try_from(cur_bytes.as_slice())
                {
                    let cur_pk =
                        hex::encode(SigningKey::from_bytes(&cur_arr).verifying_key().to_bytes());
                    if cert.challenge.contains(&cur_pk) {
                        return Some(cur.signing_sk);
                    }
                }
                None
            })
            .ok_or_else(|| {
                "Viso import requires the application secret key (#sk=... in the URL).".to_owned()
            })?;

        let sk_bytes = hex::decode(&signing_sk).map_err(|_| "Invalid signing_sk hex")?;
        let sk_arr: [u8; 32] = sk_bytes
            .as_slice()
            .try_into()
            .map_err(|_| "signing_sk must be 32 bytes")?;
        let app_pk = hex::encode(SigningKey::from_bytes(&sk_arr).verifying_key().to_bytes());
        if !cert.challenge.contains(&app_pk) {
            return Err(
                "Viso callback challenge does not match the app's signing key (#sk=...).".into(),
            );
        }

        let id = StoredDesktopIdentity {
            kind: "viso".into(),
            pubkey: pk,
            signing_sk,
            display_name: None,
            cert: Some(cert),
        };
        save_stored_identity(&id);
        return Ok(());
    }

    // 3. Check for a 64-hex Ed25519 secret key (alone or inside a backup .txt file)
    let hex_line = trimmed
        .lines()
        .map(str::trim)
        .find(|l| l.len() == 64 && l.chars().all(|c| c.is_ascii_hexdigit()));
    if let Some(sk_hex) = hex_line {
        let sk_lower = sk_hex.to_ascii_lowercase();
        let bytes = hex::decode(&sk_lower).map_err(|_| "Invalid hex key")?;
        let arr: [u8; 32] = bytes.as_slice().try_into().map_err(|_| "Not 32 bytes")?;
        let sk = SigningKey::from_bytes(&arr);
        let pk = hex::encode(sk.verifying_key().to_bytes());
        let id = StoredDesktopIdentity {
            kind: "local".into(),
            pubkey: pk,
            signing_sk: sk_lower,
            display_name: None,
            cert: None,
        };
        save_stored_identity(&id);
        return Ok(());
    }

    Err("Unrecognized identity format: expected a 64-hex secret key, Viso callback URL with #sk=..., or JSON session.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn log(entries: &[(&str, u64, Value)]) -> Value {
        let mut map = serde_json::Map::new();
        for (i, (author, ts, body)) in entries.iter().enumerate() {
            map.insert(
                format!("{author}:{i}"),
                json!({ "author": author, "id": format!("e{i}"), "ts": ts, "body": body.to_string() }),
            );
        }
        json!({ "entries": map })
    }

    const ALICE: &str = "aa";
    const BOB: &str = "bb";
    const MALLORY: &str = "cc";

    #[test]
    fn only_the_first_creator_owns_a_community() {
        let create = |name: &str| json!({ "type": "community_create", "community": { "id": "c_x", "name": name } });
        let l = log(&[
            (ALICE, 1, create("Mine")),
            (MALLORY, 2, create("Stolen")),
            (
                MALLORY,
                3,
                json!({ "type": "community_mod_add", "community_id": "c_x", "target": MALLORY }),
            ),
            (
                ALICE,
                4,
                json!({ "type": "community_ban", "community_id": "c_x", "target": BOB }),
            ),
        ]);
        let f = &fold_communities(&ordered_bodies(Some(&l)))["c_x"];
        assert_eq!(f.creator, ALICE);
        assert_eq!(f.name, "Mine");
        assert!(!f.is_mod(MALLORY));
        assert!(f.banned.contains(BOB));
        assert!(!fold_communities(&[]).contains_key("c_x"));
    }

    #[test]
    fn community_deletes_need_sender_or_moderator_and_reactions_are_a_closed_set() {
        let msg = |id: &str, who: &str| json!({ "type": "chat", "message": { "id": id, "sender": who, "room_id": "comm_c_x", "text": format!("hi from {who}"), "timestamp": 1 } });
        let del =
            |id: &str| json!({ "type": "chat_delete", "roomId": "comm_c_x", "messageId": id });
        let react = |id: &str, e: &str| json!({ "type": "chat_react", "roomId": "comm_c_x", "messageId": id, "emoji": e, "on": true });
        let l = log(&[
            (BOB, 1, msg("m1", BOB)),
            (BOB, 2, msg("m2", BOB)),
            (MALLORY, 3, msg("m3", MALLORY)),
            (MALLORY, 4, del("m1")),
            (ALICE, 5, del("m2")),
            (ALICE, 6, react("m1", "🔥")),
            (ALICE, 7, react("m1", "scam.example")),
        ]);
        let comm = CommFold {
            name: "X".into(),
            desc: String::new(),
            creator: ALICE.into(),
            moderators: BTreeSet::from([ALICE.to_owned()]),
            banned: BTreeSet::from([MALLORY.to_owned()]),
        };
        let room = build_community_room(
            "c_x",
            &comm,
            ALICE,
            member_id_of(ALICE),
            0,
            &HashMap::new(),
            &HashMap::new(),
            &BTreeSet::new(),
            Some(&l),
        );
        let texts: Vec<&str> = room.messages.iter().map(|m| m.text.as_str()).collect();
        // Mallory cannot delete Bob's m1; Alice moderates and removes m2; Mallory is banned.
        assert!(texts.contains(&"hi from bb"));
        assert_eq!(room.messages.len(), 1);
        let emojis: Vec<&str> = room.messages[0]
            .reactions
            .iter()
            .map(|r| r.emoji.as_str())
            .collect();
        assert_eq!(emojis, ["🔥"]);
    }

    #[test]
    fn entropy_is_random_not_derived_from_tag_or_time() {
        let a = entropy_32("same-tag");
        let b = entropy_32("same-tag");
        assert_ne!(a, b);
        assert_ne!(a, [0u8; 32]);
    }

    #[cfg(unix)]
    #[test]
    fn private_dir_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("Radica");
        make_private_dir(&dir);
        let mode = fs::metadata(&dir).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o700);
    }

    #[test]
    fn contract_keys_match_radica_web_app() {
        assert_eq!(
            log_contract_key("communities"),
            "DwwKe5XbrNLyK7F9hZDB5Q7Q6KmVcfeutTqNHAngBv2z"
        );
        assert_eq!(
            log_contract_key("directory"),
            "3gZCWx2M24qvx9N9zJQTsWb37U6QCFgCuTFeYwpdFox1"
        );
        assert_eq!(
            log_contract_key("community-chat/c_radica"),
            "FyD4Kv4i8stPn1GUpezqZGBDtnJDyKqhos8KpH6agW2t"
        );
        assert_eq!(
            log_contract_key("community-chat/c_tech"),
            "D8LYGThz4oARuEpoeEvt2ew1ydVukaQnGKz4BpSqiSJ3"
        );
        assert_eq!(
            feed_contract_key(MAINTAINER_PK).as_deref(),
            Some("EbD9Dqaogoity73VMgPNkq8JH1M9ZekK6WN8RHtktwtQ")
        );
    }

    #[test]
    fn viso_connect_signature_matches_golden_vector() {
        let sk = SigningKey::from_bytes(&[42u8; 32]);
        let pk_bytes = sk.verifying_key().to_bytes();
        let pk_hex = hex::encode(pk_bytes);
        let msg = viso_connect_message(&pk_bytes, "https://example.com/app", "abc123", 12345);
        let sig_hex = hex::encode(sk.sign(&msg).to_bytes());
        assert_eq!(
            sig_hex,
            "122b675bdbc8772f52631524ac2b500dec76721bff7c0b299025df04e18e8e8ddf2b8d0a232a5785e68d5738be4f5111ae7b58106f5458b966b9b365fff5ac09"
        );
        let cert = VisoCert {
            base: "https://example.com/app".into(),
            challenge: "abc123".into(),
            ts: 12345,
            sig: sig_hex,
        };
        assert!(verify_viso_cert(&pk_hex, &cert));
    }

    #[test]
    fn dm_e2ee_matches_web_crypto_golden_vector() {
        let sk_a: [u8; 32] =
            hex::decode("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
                .unwrap()
                .try_into()
                .unwrap();
        let sk_b: [u8; 32] =
            hex::decode("fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210")
                .unwrap()
                .try_into()
                .unwrap();
        let pk_a = hex::encode(SigningKey::from_bytes(&sk_a).verifying_key().to_bytes());
        let pk_b = hex::encode(SigningKey::from_bytes(&sk_b).verifying_key().to_bytes());
        assert_eq!(
            pk_b,
            "568fa5531c7d74d27140d1ae964ff3c0b19f556fc23a879b251495fc1ba78631"
        );
        let shared = x25519_shared_secret(&sk_a, &pk_b).unwrap();
        assert_eq!(
            hex::encode(shared),
            "c328d13a09319f166324a8af160497caa241189b2f6d49f9695ed38b149d533a"
        );
        let iv: [u8; 12] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        let encrypted =
            encrypt_direct_message_with_iv(&sk_a, &pk_b, &iv, "Hello Radica E2EE!").unwrap();
        assert_eq!(
            encrypted,
            "e2e:000102030405060708090a0b:9c7df1b1370caabc13485d6762c5f9d27641bf992fa4ebd97350f62d5ab2af17088d"
        );
        let decrypted = decrypt_direct_message(&sk_b, &pk_a, &encrypted).unwrap();
        assert_eq!(decrypted, "Hello Radica E2EE!");
    }

    #[test]
    fn symmetric_e2ee_roundtrip_matches_web_sym_format() {
        let key_hex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let key_bytes = decode_sym_key(key_hex).unwrap();
        let ct = encrypt_with_symmetric_key(&key_bytes, "Secret group message!").unwrap();
        assert!(ct.starts_with("sym:"));
        let pt = decrypt_with_symmetric_key(&key_bytes, &ct).unwrap();
        assert_eq!(pt, "Secret group message!");
    }

    #[test]
    fn viso_multi_base_verification_handles_slash_variants_and_canonical_base() {
        let sk = SigningKey::from_bytes(&[77u8; 32]);
        let pk_bytes = sk.verifying_key().to_bytes();
        let pk_hex = hex::encode(pk_bytes);
        let signed_base =
            "http://127.0.0.1:7509/v1/contract/web/Ex88TLL4HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/";
        let msg = viso_connect_message(&pk_bytes, signed_base, "wd1.challenge.123", 99999);
        let sig_hex = hex::encode(sk.sign(&msg).to_bytes());

        // 1. Exact match with slash
        let mut cert1 = VisoCert {
            base: signed_base.into(),
            challenge: "wd1.challenge.123".into(),
            ts: 99999,
            sig: sig_hex.clone(),
        };
        assert!(verify_viso_cert_multi(&pk_hex, &mut cert1, &[]));
        assert_eq!(cert1.base, signed_base);

        // 2. Base provided without trailing slash, normalizes and verifies
        let base_no_slash = signed_base.trim_end_matches('/');
        let mut cert2 = VisoCert {
            base: base_no_slash.into(),
            challenge: "wd1.challenge.123".into(),
            ts: 99999,
            sig: sig_hex.clone(),
        };
        assert!(verify_viso_cert_multi(&pk_hex, &mut cert2, &[]));
        assert_eq!(cert2.base, signed_base);

        // 3. Candidate canonical base matches when cert.base was a local return base
        let return_base =
            "http://127.0.0.1:51234/v1/contract/web/Ex88TLL4HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/";
        let mut cert3 = VisoCert {
            base: return_base.into(),
            challenge: "wd1.challenge.123".into(),
            ts: 99999,
            sig: sig_hex.clone(),
        };
        assert!(verify_viso_cert_multi(&pk_hex, &mut cert3, &[signed_base]));
        assert_eq!(cert3.base, signed_base);
    }

    #[test]
    fn import_identity_raw_supports_json_session_and_callback_url() {
        let persona_sk = SigningKey::from_bytes(&[88u8; 32]);
        let persona_pk = hex::encode(persona_sk.verifying_key().to_bytes());

        let app_sk_bytes = [99u8; 32];
        let app_sk = SigningKey::from_bytes(&app_sk_bytes);
        let app_pk = hex::encode(app_sk.verifying_key().to_bytes());
        let challenge = format!("wd1.{app_pk}.nonce12345");
        let base = format!("http://127.0.0.1:7509{APP_PATH}");

        let msg = viso_connect_message(
            &persona_sk.verifying_key().to_bytes(),
            &base,
            &challenge,
            123456,
        );
        let sig = hex::encode(persona_sk.sign(&msg).to_bytes());

        // Test 1: JSON session import
        let json_input = serde_json::json!({
            "persona": persona_pk,
            "type": "viso",
            "app_key": hex::encode(app_sk_bytes),
            "cert": {
                "base": base,
                "challenge": challenge,
                "ts": 123456,
                "sig": sig,
            }
        })
        .to_string();

        assert!(import_identity_raw(&json_input).is_ok());
        let stored = load_stored_identity();
        assert_eq!(stored.kind, "viso");
        assert_eq!(stored.pubkey, persona_pk);
        assert_eq!(stored.signing_sk, hex::encode(app_sk_bytes));
        assert!(stored.cert.is_some());

        // Test 2: Viso callback URL with #sk=...
        let url_input = format!(
            "http://127.0.0.1:54321{APP_PATH}?viso=ok&pk={persona_pk}&sig={sig}&challenge={challenge}&ts=123456#sk={}",
            hex::encode(app_sk_bytes)
        );
        assert!(import_identity_raw(&url_input).is_ok());
        let stored2 = load_stored_identity();
        assert_eq!(stored2.kind, "viso");
        assert_eq!(stored2.pubkey, persona_pk);
        assert_eq!(stored2.signing_sk, hex::encode(app_sk_bytes));
    }

    #[test]
    fn hidden_rooms_and_deleted_messages_roundtrip() {
        remember_hidden_room("dm:test_peer_123");
        let hidden = load_hidden_rooms();
        assert!(hidden.contains("dm:test_peer_123"));
        unhide_room("dm:test_peer_123");
        let hidden2 = load_hidden_rooms();
        assert!(!hidden2.contains("dm:test_peer_123"));

        remember_deleted_message("msg_del_test_456");
        let del = load_deleted_messages();
        assert!(del.contains("msg_del_test_456"));
    }
}
