//! Private rooms on River's room contract, like the web (`ui/src/riverRooms.ts`): the same river-core code the web
//! runs as river.wasm (`river-wasm/`), linked natively. River decides who is in a room and seals what they write.

use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{Value, json};

use crate::{host, live};

/// River's room contract, the generation river-wasm builds deltas for (`BUNDLED_ROOM_CODE` in `ui/src/riverPointer.ts`).
/// shortcut: River's pointer record is not resolved, so when River re-keys its room contract the desktop keeps writing
/// under this one; resolve the pointer like `resolveRoomContract` once River moves past version 7.
const ROOM_CODE: &[u8] = include_bytes!("../../../ui/src/wasm/river_room_contract.wasm");
const ROOM_CODE_HASH: &str = "fa9e59e87532bc9681e8fef903f6d35a1207c25a0f0d8cca2c92e2f31761a4f9";

/// One call into river-core (the JSON ops listed at the top of `river-wasm/src/lib.rs`).
pub fn call(mut req: Value) -> Result<Value, String> {
    // river-core takes a missing field as its default but refuses null for a map (`secrets`)
    if let Some(obj) = req.as_object_mut() {
        obj.retain(|_, v| !v.is_null());
    }
    let out: Value =
        serde_json::from_str(&radica_river::run(&req.to_string())).map_err(|e| e.to_string())?;
    match out.get("error").and_then(Value::as_str) {
        Some(e) => Err(format!("River: {e}")),
        None => Ok(out),
    }
}

/// The owner key of room `room_id` made by the holder of `identity_sk`, so a room needs no stored key and comes back on
/// any device with that identity (`roomOwnerSk` in `ui/src/riverRooms.ts`).
pub fn owner_sk(identity_sk: &[u8; 32], room_id: &str) -> [u8; 32] {
    *blake3::keyed_hash(
        identity_sk,
        format!("radica/river-room-owner/v1:{room_id}").as_bytes(),
    )
    .as_bytes()
}

pub fn vk_of(sk_hex: &str) -> Option<String> {
    let sk: [u8; 32] = hex::decode(sk_hex).ok()?.try_into().ok()?;
    Some(hex::encode(
        ed25519_dalek::SigningKey::from_bytes(&sk)
            .verifying_key()
            .to_bytes(),
    ))
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn params(owner: &str) -> Result<Vec<u8>, String> {
    let p = call(json!({ "op": "params", "owner_vk": owner }))?;
    hex::decode(p["params"].as_str().unwrap_or_default()).map_err(|e| e.to_string())
}

fn room_key(owner: &str) -> Result<String, String> {
    Ok(live::contract_key(ROOM_CODE_HASH, &params(owner)?))
}

fn cache_path(owner: &str) -> Option<PathBuf> {
    // owner keys are 64 hex chars: safe as a file name
    if owner.len() != 64 || !owner.bytes().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    live::data_dir().map(|d| d.join("river").join(format!("{owner}.hex")))
}

/// Keep the room as last read or written (sealed: no plaintext of a private room is in it).
fn keep(owner: &str, state: &str) {
    if let Some(p) = cache_path(owner) {
        if let Some(dir) = p.parent() {
            live::make_private_dir(dir);
        }
        let _ = fs::write(p, state);
    }
}

fn cached(owner: &str) -> Option<String> {
    fs::read_to_string(cache_path(owner)?)
        .ok()
        .filter(|s| !s.is_empty())
}

/// The room as the node has it (hex CBOR), else the last copy here.
pub fn load(owner: &str) -> Option<String> {
    let fetched = (|| -> Option<String> {
        let key = room_key(owner).ok()?;
        let tmp = tempfile::NamedTempFile::new().ok()?;
        let mut cmd = Command::new(live::find_fdev());
        cmd.args(["execute", "get", "--timeout", "5", "-o"])
            .arg(tmp.path())
            .arg(&key);
        host::run(&mut cmd).ok()?;
        let raw = fs::read(tmp.path()).ok()?;
        (!raw.is_empty()).then(|| hex::encode(raw))
    })();
    if let Some(state) = &fetched {
        keep(owner, state);
    }
    fetched.or_else(|| cached(owner))
}

fn temp_with(bytes: &[u8]) -> Result<tempfile::NamedTempFile, String> {
    let tmp = tempfile::NamedTempFile::new().map_err(|e| e.to_string())?;
    fs::write(tmp.path(), bytes).map_err(|e| e.to_string())?;
    Ok(tmp)
}

/// Publish a new room: River's contract code, the owner's params and its first state.
pub fn put(owner: &str, state: &str) -> Result<(), String> {
    let code = temp_with(ROOM_CODE)?;
    let params = temp_with(&params(owner)?)?;
    let state_file = temp_with(&hex::decode(state).map_err(|e| e.to_string())?)?;
    let mut cmd = Command::new(live::find_fdev());
    cmd.args(["execute", "put", "--timeout", "30", "--code"])
        .arg(code.path())
        .arg("--parameters")
        .arg(params.path())
        .args(["contract", "--state"])
        .arg(state_file.path());
    host::run(&mut cmd)?;
    keep(owner, state);
    Ok(())
}

/// Apply `delta` here first (the contract runs the same code), then send it. False when it changes nothing, which is
/// River refusing it (not a member, not the author…).
pub fn send(owner: &str, state: &str, delta: &str) -> Result<bool, String> {
    let next =
        call(json!({ "op": "apply", "owner_vk": owner, "state": state, "delta": delta }))?["state"]
            .as_str()
            .unwrap_or_default()
            .to_owned();
    if next == state {
        return Ok(false);
    }
    let file = temp_with(&hex::decode(delta).map_err(|e| e.to_string())?)?;
    let mut cmd = Command::new(live::find_fdev());
    cmd.args(["execute", "update", "--timeout", "15"])
        .arg(room_key(owner)?)
        .arg(file.path());
    host::run(&mut cmd)?;
    keep(owner, &next);
    Ok(true)
}

/// The room as `sk` sees it; `join` lets an invitee read it before their first message files their secret.
pub fn read(owner: &str, state: &str, sk: &str, join: Option<&Value>) -> Result<Value, String> {
    call(json!({
        "op": "read",
        "owner_vk": owner,
        "state": state,
        "member_sk": sk,
        "secret": join.and_then(|j| j.get("secret")),
        "secrets": join.and_then(|j| j.get("secrets")),
    }))
}

/// Whether the room already holds `sk` as a member (River prunes quiet members; a write then carries the join again).
pub fn holds(owner: &str, state: &str, sk: &str, join: Option<&Value>) -> bool {
    let Some(me) = vk_of(sk) else { return false };
    me == owner
        || read(owner, state, sk, join).is_ok_and(|v| {
            v["members"]
                .as_array()
                .is_some_and(|ms| ms.iter().any(|m| m["vk"].as_str() == Some(me.as_str())))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sk(b: u8) -> String {
        hex::encode([b; 32])
    }

    #[test]
    fn bundled_code_is_the_generation_we_key_rooms_under() {
        assert_eq!(blake3::hash(ROOM_CODE).to_hex().as_str(), ROOM_CODE_HASH);
    }

    #[test]
    fn owner_key_matches_the_web_derivation() {
        // the web: blake3(utf8("radica/river-room-owner/v1:" + id), { key: identitySk })
        let a = owner_sk(&[7; 32], "privroom_1_abc");
        assert_eq!(a, owner_sk(&[7; 32], "privroom_1_abc"));
        assert_ne!(a, owner_sk(&[7; 32], "privroom_2_abc"));
        assert_ne!(a, owner_sk(&[8; 32], "privroom_1_abc"));
    }

    #[test]
    fn an_invited_member_writes_and_the_owner_reads_it() {
        let owner_sk = sk(1);
        let owner = vk_of(&owner_sk).unwrap();
        let state = call(json!({"op":"new_room","owner_sk":owner_sk,"name":"Radica","nickname":"Ann","private":true,"time_ms":1}))
            .unwrap()["state"].as_str().unwrap().to_owned();
        // an invitation code, as the web's invite link carries it
        let code =
            call(json!({"op":"invitation","owner_sk":owner_sk,"state":state,"invitee_sk":sk(2)}))
                .unwrap()["code"]
                .as_str()
                .unwrap()
                .to_owned();
        let acc = call(json!({"op":"accept","code":code})).unwrap();
        assert_eq!(acc["owner_vk"].as_str(), Some(owner.as_str()));
        let bob_sk = acc["sk"].as_str().unwrap().to_owned();
        let join = json!({ "member": acc["member"], "secrets": acc["secrets"] });
        assert!(!holds(&owner, &state, &bob_sk, Some(&join)));
        let delta = call(
            json!({"op":"message","author_sk":bob_sk,"owner_vk":owner,"state":state,"text":"ciao",
            "time_ms":1_700_000_000_000u64,"secrets":join["secrets"],"join":join,"nickname":"Bob"}),
        )
        .unwrap()["delta"]
            .as_str()
            .unwrap()
            .to_owned();
        let next = call(json!({"op":"apply","owner_vk":owner,"state":state,"delta":delta}))
            .unwrap()["state"]
            .as_str()
            .unwrap()
            .to_owned();
        let view = read(&owner, &next, &owner_sk, None).unwrap();
        assert_eq!(view["name"].as_str(), Some("Radica"));
        assert_eq!(view["messages"][0]["text"].as_str(), Some("ciao"));
        assert!(holds(&owner, &next, &bob_sk, Some(&join)));
    }
}
