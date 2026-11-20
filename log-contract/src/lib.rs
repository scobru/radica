//! Radica log contract: an append-only set of signed entries anyone can add to.
//! Parameters name the log and the app (UTF-8 `radica/<log name>|<app path>`, e.g.
//! `radica/inbox/<pubkey>|/v1/contract/web/<radica key>/`), so an entry signed for one log cannot be replayed into
//! another. An entry is signed by its author's key, or by an app key the author delegated for that app path (Viso),
//! in which case it carries the delegation. What an entry means (a message, a moderation event) is decided by the
//! clients, which know each entry's author for sure.
//!
//! Signed message, v2 (`v: 2` on the entry; must match ui/src/crypto.ts logMsg2): `radica/log/v2|` then each field
//! as `<byte length>:<bytes>`: parameters hex, author, id, ts, BLAKE3 hex of the body, nonce. BLAKE3 of the message
//! needs `POW_BITS` leading zero bits (the nonce is ground for it, cheaply since the body is only hashed once), except
//! for the log's owner. Legacy entries (no `v`) sign, and are checked exactly as before:
//!   radica/log/v1:<parameters hex>:<author>:<id>:<ts>:<body>
//!
//! A log named `<name>/<64-hex key>` belongs to that key. Caps (`MAX_ENTRIES`, `MAX_STATE_BYTES`) keep a full
//! validation under the node's 5 s per call. Past the count cap, a log that belongs to someone, or a chat
//! (`room/`, `dm/`, `community-chat/`), drops others' entries, legacy first then oldest first, never the owner's; any
//! other shared log (communities, receipts, proofs) refuses new entries instead, so a flood can block it but never
//! erase what it holds. Entries by others dated more than `MAX_SKEW_MS` past the node clock wait for their time.
//!
//! Merge is a union keyed `<author>:<id>`; the same key with two bodies keeps the larger signature, so every node
//! converges (idempotent, commutative, associative).

use ed25519_dalek::{Signature, VerifyingKey};
use freenet_stdlib::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use whoiam_delegation::Cert;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Entry {
    pub author: String, // hex pubkey
    pub id: String,
    pub ts: u64,
    pub body: String,
    pub sig: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cert: Option<Cert>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub v: Option<u8>, // 2: signed the v2 way; none: legacy
    #[serde(default, skip_serializing_if = "is_zero")]
    pub nonce: u64,
}

fn is_zero(n: &u64) -> bool {
    *n == 0
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct LogState {
    #[serde(default)]
    pub entries: BTreeMap<String, Entry>, // "<author>:<id>" -> entry
}

/// What a peer holds: key -> signature prefix.
pub type Summary = BTreeMap<String, String>;

pub const MAX_BODY: usize = 64 * 1024;
pub const MAX_ID: usize = 100;
pub const MAX_ENTRIES: usize = 10_000; // ~195 µs per entry to validate: ~2 s, against the node's 5 s per call
pub const MAX_STATE_BYTES: usize = 38 * 1024 * 1024;
pub const POW_BITS: u32 = 12;
pub const MAX_SKEW_MS: u64 = 10 * 60 * 1000;

/// `<tag>|` then each field as `<byte length>:<bytes>` (same as contract/src/lib.rs `lp`).
pub fn lp(tag: &str, fields: &[&str]) -> String {
    let mut m = format!("{tag}|");
    for f in fields {
        m.push_str(&f.len().to_string());
        m.push(':');
        m.push_str(f);
    }
    m
}

pub fn entry_msg2(params_hex: &str, e: &Entry) -> String {
    let body = blake3::hash(e.body.as_bytes()).to_hex();
    lp("radica/log/v2", &[params_hex, &e.author, &e.id, &e.ts.to_string(), body.as_str(), &e.nonce.to_string()])
}

pub fn pow_bits(msg: &str) -> u32 {
    let mut n = 0;
    for b in blake3::hash(msg.as_bytes()).as_bytes() {
        n += b.leading_zeros();
        if *b != 0 {
            break;
        }
    }
    n
}

/// Whom the log belongs to (a last name segment that is a 64-hex key), and whether others' oldest entries make room
/// past the cap (owned logs and chats) instead of new ones being refused (every other shared log).
pub struct Kind {
    pub owner: Option<String>,
    pub evicts: bool,
}

pub fn kind(params_hex: &str) -> Kind {
    let params = hex::decode(params_hex).ok().and_then(|b| String::from_utf8(b).ok()).unwrap_or_default();
    let name = params.split('|').next().unwrap_or("").strip_prefix("radica/").unwrap_or("");
    let last = name.rsplit('/').next().unwrap_or("");
    let owner = (name.contains('/') && last.len() == 64 && last.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))).then(|| last.to_string());
    let chat = ["room/", "dm/", "community-chat/"].iter().any(|p| name.starts_with(p));
    Kind { evicts: owner.is_some() || chat, owner }
}

fn err(m: &str) -> ContractError {
    ContractError::Other(m.into())
}

pub fn entry_msg(params_hex: &str, e: &Entry) -> String {
    format!("radica/log/v1:{params_hex}:{}:{}:{}:{}", e.author, e.id, e.ts, e.body)
}

pub fn check(params_hex: &str, key: &str, e: &Entry) -> Result<(), ContractError> {
    if key != format!("{}:{}", e.author, e.id) || e.id.is_empty() || e.id.len() > MAX_ID || e.body.len() > MAX_BODY {
        return Err(err("bad entry key or size"));
    }
    let msg = match e.v {
        None => entry_msg(params_hex, e),
        Some(2) => {
            if !(e.author.len() == 64 && e.author.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))) {
                return Err(err("v2 authors are lowercase hex"));
            }
            let m = entry_msg2(params_hex, e);
            if kind(params_hex).owner.as_deref() != Some(e.author.as_str()) && pow_bits(&m) < POW_BITS {
                return Err(err("not enough proof of work"));
            }
            m
        }
        Some(_) => return Err(err("unknown signature version")),
    };
    match &e.cert {
        None => {
            let pk: [u8; 32] = hex::decode(&e.author).map_err(|_| err("author not hex"))?.try_into().map_err(|_| err("author must be 32 bytes"))?;
            let sig: [u8; 64] = hex::decode(&e.sig).map_err(|_| err("sig not hex"))?.try_into().map_err(|_| err("sig must be 64 bytes"))?;
            VerifyingKey::from_bytes(&pk)
                .map_err(|_| err("bad author key"))?
                .verify_strict(msg.as_bytes(), &Signature::from_bytes(&sig))
                .map_err(|_| err("bad signature"))
        }
        Some(cert) => {
            let params = String::from_utf8(hex::decode(params_hex).map_err(|_| err("params"))?).map_err(|_| err("params not UTF-8"))?;
            let app = params.rsplit_once('|').map(|(_, app)| app).ok_or_else(|| err("this log takes no delegated signatures"))?;
            let app_key = whoiam_delegation::check(&e.author, app, cert).map_err(|_| err("bad delegation"))?;
            whoiam_delegation::verify(&app_key, msg.as_bytes(), &e.sig).map_err(|_| err("bad signature"))
        }
    }
}

/// Merge `inc` into `state` (no clock: for tests and tools). See `merge_at`.
pub fn merge(params_hex: &str, state: &mut LogState, inc: LogState) -> Result<(), ContractError> {
    merge_at(params_hex, state, inc, u64::MAX / 2)
}

/// Merge `inc` into `state`; fails on a forged or oversized entry, or on a shared log that would go past its cap. An
/// entry replaces the one under its key when it is newer (its author signs `ts`, and the key starts with the author,
/// so only they can replace it): an author keeps one entry per key for state that only matters as of now (a read
/// mark, a hidden room). Equal times fall back to the signature, so every peer keeps the same one. Entries by others
/// dated past `now + MAX_SKEW_MS` are left out until then.
pub fn merge_at(params_hex: &str, state: &mut LogState, inc: LogState, now: u64) -> Result<(), ContractError> {
    let k = kind(params_hex);
    for (key, e) in inc.entries {
        if k.owner.as_deref() != Some(e.author.as_str()) && e.ts > now.saturating_add(MAX_SKEW_MS) {
            continue;
        }
        if state.entries.get(&key).map_or(true, |cur| (e.ts, &e.sig) > (cur.ts, &cur.sig)) {
            check(params_hex, &key, &e)?;
            state.entries.insert(key, e);
        }
    }
    if state.entries.len() > MAX_ENTRIES {
        if !k.evicts {
            return Err(err("log is full"));
        }
        // others' entries, legacy first then oldest first; a strict total order, so any arrival order keeps the same set
        let mut others: Vec<(bool, u64, String, String)> = state
            .entries
            .iter()
            .filter(|(_, e)| k.owner.as_deref() != Some(e.author.as_str()))
            .map(|(key, e)| (e.v.is_some(), e.ts, e.sig.clone(), key.clone()))
            .collect();
        others.sort();
        let excess = state.entries.len() - MAX_ENTRIES;
        for (_, _, _, key) in others.into_iter().take(excess) {
            state.entries.remove(&key);
        }
    }
    if ser(state)?.len() > MAX_STATE_BYTES {
        return Err(err("log too large"));
    }
    Ok(())
}

fn prefix(s: &str) -> String {
    s.chars().take(16).collect()
}

pub fn summarize(s: &LogState) -> Summary {
    s.entries.iter().map(|(k, e)| (k.clone(), prefix(&e.sig))).collect()
}

pub fn delta(s: &LogState, peer: &Summary) -> LogState {
    let have: BTreeSet<(&String, String)> = peer.iter().map(|(k, v)| (k, v.clone())).collect();
    LogState {
        entries: s.entries.iter().filter(|(k, e)| !have.contains(&(*k, prefix(&e.sig)))).map(|(k, e)| (k.clone(), e.clone())).collect(),
    }
}

fn de<T: for<'a> Deserialize<'a> + Default>(b: &[u8]) -> Result<T, ContractError> {
    if b.is_empty() {
        return Ok(T::default());
    }
    serde_json::from_slice(b).map_err(|e| ContractError::Deser(e.to_string()))
}

fn ser<T: Serialize>(v: &T) -> Result<Vec<u8>, ContractError> {
    serde_json::to_vec(v).map_err(|e| ContractError::Deser(e.to_string()))
}

fn now_ms() -> u64 {
    freenet_stdlib::time::now().timestamp_millis().max(0) as u64
}

pub struct RadicaLogContract;

#[contract]
impl ContractInterface for RadicaLogContract {
    fn validate_state(p: Parameters<'static>, state: State<'static>, _r: RelatedContracts<'static>) -> Result<ValidateResult, ContractError> {
        let params = hex::encode(p.as_ref());
        let now = now_ms();
        let ok = de::<LogState>(state.as_ref()).is_ok_and(|s| {
            let mut canon = LogState::default();
            merge_at(&params, &mut canon, s.clone(), now).is_ok() && canon == s
        });
        Ok(if ok { ValidateResult::Valid } else { ValidateResult::Invalid })
    }

    fn update_state(p: Parameters<'static>, state: State<'static>, data: Vec<UpdateData<'static>>) -> Result<UpdateModification<'static>, ContractError> {
        let params = hex::encode(p.as_ref());
        let mut cur: LogState = de(state.as_ref())?;
        for item in data {
            let parts: Vec<Vec<u8>> = match item {
                UpdateData::State(s) => vec![s.as_ref().to_vec()],
                UpdateData::Delta(d) => vec![d.as_ref().to_vec()],
                UpdateData::StateAndDelta { state, delta } => vec![state.as_ref().to_vec(), delta.as_ref().to_vec()],
                _ => return Err(ContractError::InvalidUpdate),
            };
            for part in parts {
                merge_at(&params, &mut cur, de(&part)?, now_ms())?; // keep the reason: the node logs it
            }
        }
        Ok(UpdateModification::valid(State::from(ser(&cur)?)))
    }

    fn summarize_state(_p: Parameters<'static>, state: State<'static>) -> Result<StateSummary<'static>, ContractError> {
        Ok(StateSummary::from(ser(&summarize(&de(state.as_ref())?))?))
    }

    fn get_state_delta(_p: Parameters<'static>, state: State<'static>, summary: StateSummary<'static>) -> Result<StateDelta<'static>, ContractError> {
        let d = delta(&de(state.as_ref())?, &de(summary.as_ref())?);
        Ok(StateDelta::from(if d.entries.is_empty() { vec![] } else { ser(&d)? }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    const P: &str = "7261646963612f74657374"; // "radica/test"

    fn entry(k: &SigningKey, id: &str, ts: u64, body: &str, params: &str) -> (String, Entry) {
        let author = hex::encode(k.verifying_key().as_bytes());
        let mut e = Entry { author: author.clone(), id: id.into(), ts, body: body.into(), sig: String::new(), cert: None, v: None, nonce: 0 };
        e.sig = hex::encode(k.sign(entry_msg(params, &e).as_bytes()).to_bytes());
        (format!("{author}:{id}"), e)
    }
    fn state(es: Vec<(String, Entry)>) -> LogState {
        LogState { entries: es.into_iter().collect() }
    }
    fn merged(parts: &[LogState]) -> LogState {
        let mut s = LogState::default();
        for p in parts {
            merge(P, &mut s, p.clone()).unwrap();
        }
        s
    }

    #[test]
    fn merge_laws_and_delta_path() {
        let (a, b) = (SigningKey::from_bytes(&[1; 32]), SigningKey::from_bytes(&[2; 32]));
        let s = vec![
            state(vec![entry(&a, "1", 1, "hi", P), entry(&b, "1", 2, "yo", P)]),
            state(vec![entry(&a, "1", 1, "same id, other body", P)]),
            state(vec![entry(&b, "2", 3, "{\"type\":\"chat\"}", P)]),
        ];
        for x in &s {
            assert_eq!(merged(&[x.clone(), x.clone()]), merged(&[x.clone()]));
            for y in &s {
                assert_eq!(merged(&[x.clone(), y.clone()]), merged(&[y.clone(), x.clone()]));
                for z in &s {
                    assert_eq!(merged(&[merged(&[x.clone(), y.clone()]), z.clone()]), merged(&[x.clone(), merged(&[y.clone(), z.clone()])]));
                }
                let (x, y) = (merged(&[x.clone()]), merged(&[y.clone()]));
                let mut via = x.clone();
                merge(P, &mut via, delta(&y, &summarize(&x))).unwrap();
                assert_eq!(via, merged(&[x.clone(), y.clone()]));
            }
        }
        let all = merged(&s);
        assert!(delta(&all, &summarize(&all)).entries.is_empty());
    }

    #[test]
    fn an_author_s_newer_entry_replaces_the_older_under_one_key() {
        let a = SigningKey::from_bytes(&[1; 32]);
        let old = state(vec![entry(&a, "read:room", 1, "{\"upto\":1}", P)]);
        let new = state(vec![entry(&a, "read:room", 2, "{\"upto\":2}", P)]);
        for s in [merged(&[old.clone(), new.clone()]), merged(&[new.clone(), old.clone()])] {
            assert_eq!(s.entries.len(), 1);
            assert_eq!(s.entries.values().next().unwrap().ts, 2, "the newer one wins, whatever the order");
        }
        // a peer that has the old one gets the new one through the delta, and keeps one entry
        let mut peer = merged(&[old.clone()]);
        let d = delta(&merged(&[new.clone()]), &summarize(&peer));
        merge(P, &mut peer, d).unwrap();
        assert_eq!(peer, merged(&[new]));
    }

    #[test]
    fn forgeries_and_replays_are_rejected() {
        let (a, b) = (SigningKey::from_bytes(&[1; 32]), SigningKey::from_bytes(&[2; 32]));
        let mut s = LogState::default();
        // signed for another log
        assert!(merge(P, &mut s, state(vec![entry(&a, "1", 1, "x", "6f74686572")])).is_err());
        // body changed in transit
        let (k, mut e) = entry(&a, "1", 1, "x", P);
        e.body = "y".into();
        assert!(merge(P, &mut s, state(vec![(k, e)])).is_err());
        // stored under someone else's key
        let (_, e) = entry(&a, "1", 1, "x", P);
        assert!(merge(P, &mut s, state(vec![(format!("{}:1", hex::encode(b.verifying_key().as_bytes())), e)])).is_err());
        assert!(s.entries.is_empty());
    }

    #[test]
    fn viso_delegated_entries() {
        let who = SigningKey::from_bytes(&[3; 32]);
        let app_key = SigningKey::from_bytes(&[103; 32]);
        let delegation = |app: &str| {
            let base = format!("http://127.0.0.1:7509{app}");
            let challenge = format!("wd1.{}.n1", hex::encode(app_key.verifying_key().as_bytes()));
            let msg = whoiam_delegation::connect_message(who.verifying_key().as_bytes(), &base, &challenge, 7);
            Cert { base, challenge, ts: 7, sig: hex::encode(who.sign(&msg).to_bytes()) }
        };
        let with_app = hex::encode("radica/inbox/x|/v1/contract/web/Radica1/");
        let signed = |params: &str, cert: Cert| {
            let mut e = Entry { author: hex::encode(who.verifying_key().as_bytes()), id: "1".into(), ts: 1, body: "hi".into(), sig: String::new(), cert: Some(cert), v: None, nonce: 0 };
            e.sig = hex::encode(app_key.sign(entry_msg(params, &e).as_bytes()).to_bytes());
            (format!("{}:1", e.author), e)
        };
        let mut s = LogState::default();
        merge(&with_app, &mut s, state(vec![signed(&with_app, delegation("/v1/contract/web/Radica1/"))])).unwrap();
        // a delegation for another app, or a log without an app path, does not take it
        assert!(merge(&with_app, &mut LogState::default(), state(vec![signed(&with_app, delegation("/v1/contract/web/Other/"))])).is_err());
        assert!(merge(P, &mut LogState::default(), state(vec![signed(P, delegation("/v1/contract/web/Radica1/"))])).is_err());
    }

    // ---- v2 ----

    fn hx(k: &SigningKey) -> String {
        hex::encode(k.verifying_key().as_bytes())
    }
    fn params(name: &str) -> String {
        hex::encode(format!("radica/{name}|/v1/contract/web/Radica1/"))
    }
    /// A v2 entry; `pow` grinds the nonce.
    fn entry2(k: &SigningKey, id: &str, ts: u64, params: &str, pow: bool) -> (String, Entry) {
        let mut e = Entry { author: hx(k), id: id.into(), ts, body: "{}".into(), sig: String::new(), cert: None, v: Some(2), nonce: 0 };
        while pow && pow_bits(&entry_msg2(params, &e)) < POW_BITS {
            e.nonce += 1;
        }
        e.sig = hex::encode(k.sign(entry_msg2(params, &e).as_bytes()).to_bytes());
        (format!("{}:{id}", e.author), e)
    }
    fn keys(n: usize) -> Vec<SigningKey> {
        (0..n).map(|i| SigningKey::from_bytes(&{ let mut b = [9u8; 32]; b[..8].copy_from_slice(&(i as u64).to_le_bytes()); b })).collect()
    }

    #[test]
    fn kinds_follow_the_log_name() {
        let pk = "ab".repeat(32);
        assert_eq!(kind(&params(&format!("inbox/{pk}"))).owner.as_deref(), Some(pk.as_str()));
        assert!(kind(&params("room/x1")).evicts && kind(&params("dm/x")).evicts && kind(&params("community-chat/c_a")).evicts);
        let shared = kind(&params("communities"));
        assert!(shared.owner.is_none() && !shared.evicts);
        assert!(kind(&params(&pk)).owner.is_none(), "a bare key is a name, not an owned log");
    }

    #[test]
    fn v2_needs_proof_of_work_except_from_the_owner() {
        let (a, o) = (SigningKey::from_bytes(&[1; 32]), SigningKey::from_bytes(&[2; 32]));
        let p = params("communities");
        merge(&p, &mut LogState::default(), state(vec![entry2(&a, "1", 1, &p, true)])).unwrap();
        let (k, mut lazy) = entry2(&a, "1", 1, &p, false);
        while pow_bits(&entry_msg2(&p, &lazy)) >= POW_BITS {
            lazy.nonce += 1;
        }
        lazy.sig = hex::encode(a.sign(entry_msg2(&p, &lazy).as_bytes()).to_bytes());
        assert!(merge(&p, &mut LogState::default(), state(vec![(k, lazy)])).is_err());
        let mine = params(&format!("inbox/{}", hx(&o)));
        merge(&mine, &mut LogState::default(), state(vec![entry2(&o, "1", 1, &mine, false)])).unwrap();
        // the body is signed through its hash
        let (k, mut e) = entry2(&a, "2", 1, &p, true);
        e.body = "{\"x\":1}".into();
        assert!(merge(&p, &mut LogState::default(), state(vec![(k, e)])).is_err());
    }

    #[test]
    fn full_logs_refuse_or_drop_the_oldest_by_kind() {
        let o = SigningKey::from_bytes(&[2; 32]);
        let ks = keys(MAX_ENTRIES + 1);
        // legacy entries: no proof of work to grind for 10k of them
        let legacy = |p: &str| state(ks.iter().enumerate().map(|(i, k)| entry(k, "1", 100 + i as u64, "{}", p)).collect());
        // a shared log refuses what would take it past the cap (update_state then drops the whole update)
        let shared = params("supporter-receipts");
        let mut s = LogState::default();
        let all = legacy(&shared);
        let first: LogState = LogState { entries: all.entries.iter().take(MAX_ENTRIES).map(|(k, e)| (k.clone(), e.clone())).collect() };
        merge(&shared, &mut s, first).unwrap();
        assert!(merge(&shared, &mut s.clone(), all).is_err());
        // an owned log drops others' oldest, never the owner's
        let owned = params(&format!("inbox/{}", hx(&o)));
        let (ok, oe) = entry(&o, "mine", 1, "{}", &owned);
        let mut with_owner = legacy(&owned);
        with_owner.entries.insert(ok.clone(), oe);
        let a = merged_at(&owned, &[with_owner.clone()]);
        assert_eq!(a.entries.len(), MAX_ENTRIES);
        assert!(a.entries.contains_key(&ok));
        assert!(!a.entries.contains_key(&format!("{}:1", hx(&ks[0]))), "the oldest by others went first");
        assert!(!a.entries.contains_key(&format!("{}:1", hx(&ks[1]))));
    }

    fn merged_at(p: &str, parts: &[LogState]) -> LogState {
        let mut s = LogState::default();
        for x in parts {
            merge(p, &mut s, x.clone()).unwrap();
        }
        s
    }

    #[test]
    fn others_cannot_date_ahead() {
        let a = SigningKey::from_bytes(&[1; 32]);
        let p = params("room/x");
        let mut s = LogState::default();
        merge_at(&p, &mut s, state(vec![entry(&a, "1", 1_000 + MAX_SKEW_MS + 1, "{}", &p)]), 1_000).unwrap();
        assert!(s.entries.is_empty());
        merge_at(&p, &mut s, state(vec![entry(&a, "1", 1_000 + MAX_SKEW_MS, "{}", &p)]), 1_000).unwrap();
        assert_eq!(s.entries.len(), 1);
    }

    // Shared vector with ui/tests/crypto.test.ts: change both or neither.
    #[test]
    fn v2_vector_matches_the_ui() {
        let e = Entry { author: "ab".repeat(32), id: "x:1".into(), ts: 5, body: "{}".into(), sig: String::new(), cert: None, v: Some(2), nonce: 7 };
        assert_eq!(entry_msg2("7a", &e), format!("radica/log/v2|2:7a64:{}3:x:11:564:{}1:7", "ab".repeat(32), blake3::hash(b"{}").to_hex()));
    }
}
