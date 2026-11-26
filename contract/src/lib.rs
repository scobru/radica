//! Radica feed contract. One contract per persona: parameters = owner Ed25519 pubkey (32 raw bytes, or 64 hex chars).
//!
//! Everything in the state is signed, so the state is self-verifying and any part of it can travel as a delta:
//! - posts, profile, following list and post deletions by the owner;
//! - comments and likes by their own authors (anyone may comment on or like a post).
//!
//! The delta has the same shape as the state, and merging is one canonical procedure over the union of both, so
//! merge is idempotent, commutative and associative (see freenet-agent-skills merge-law-compliance):
//! - profile, following list and each like are last-write-wins registers ordered by (timestamp, signature);
//! - comments are keyed `<author>:<id>`, so nobody can overwrite another author's comment;
//! - deletions are a grow-only set of signed post ids, and a deleted post never comes back.
//!
//! Signed messages, v3 (`v: 3` on the record): `<tag>|` then each field as `<byte length>:<bytes>`, so a message reads
//! back one way only (`lp`, twin of ui/src/crypto.ts). Comments and likes by anyone but the owner also carry a proof of
//! work: BLAKE3 of the message has `POW_BITS` leading zero bits (the `nonce` field is ground for it).
//!   radica/post/v3|id,author,category,caption,media_uri,community_id,location,event_date,is_nsfw,timestamp
//!   radica/comment/v3|owner,post_id,id,author,text,timestamp,nonce
//!   radica/like/v3|owner,post_id,liker,liked,ts,nonce
//!   radica/profile/v4|owner,display_name,bio,avatar_url,enc_pub,updated_at
//!   radica/following/v3|owner,updated_at,<each pubkey, sorted>
//!   radica/delete/v3|owner,post_id
//!
//! Legacy messages (no `v`): what the previous generation signed, accepted unchanged so every record carries forward.
//! Fields joined by ':':
//!   radica/post/v2:<id>:<author>:<category>:<caption>:<media_uri>:<community_id>:<location>:<event_date>:<is_nsfw>:<timestamp>
//!   radica/comment/v2:<id>:<post_id>:<author>:<text>:<timestamp>
//!   radica/like/v2:<post owner>:<post_id>:<liker>:<liked>:<ts>
//!   radica/profile/v2:<owner>:<display_name>:<bio>:<avatar_url>:<updated_at>
//!   radica/following/v2:<owner>:<updated_at>:<comma-joined sorted pubkeys>
//!   radica/delete/v2:<owner>:<post_id>

use ed25519_dalek::{Signature, VerifyingKey};
use freenet_stdlib::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use whoiam_delegation::Cert;

pub type R<T> = Result<T, ContractError>;

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct ProfileInfo {
    pub display_name: String,
    pub bio: String,
    pub avatar_url: String,
    #[serde(default)]
    pub enc_pub: String, // hex Ed25519 key whose X25519 form others encrypt direct messages to
    pub updated_at: u64,
    pub sig: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cert: Option<Cert>, // Viso: the signer's delegation to the app key that signed
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub v: Option<u8>, // 3: signed the v3 way; none: legacy
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Comment {
    pub id: String,
    pub post_id: String,
    pub author: String, // hex pubkey
    pub text: String,
    pub timestamp: u64,
    pub sig: String, // hex signature by author
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cert: Option<Cert>, // Viso: the signer's delegation to the app key that signed
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub v: Option<u8>,
    #[serde(default, skip_serializing_if = "is_zero")]
    pub nonce: u64, // proof of work (v3, not by the owner)
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Like {
    pub liked: bool, // false = unliked (kept so an unlike wins over the older like)
    pub ts: u64,
    pub sig: String, // hex signature by the liker (the map key)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cert: Option<Cert>, // Viso: the signer's delegation to the app key that signed
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub v: Option<u8>,
    #[serde(default, skip_serializing_if = "is_zero")]
    pub nonce: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Post {
    pub id: String,
    pub author: String, // hex pubkey, always the feed owner
    pub category: String, // "thought" | "moment" | "event"
    pub caption: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub community_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_date: Option<String>,
    #[serde(default)]
    pub is_nsfw: bool,
    pub timestamp: u64,
    pub sig: String, // hex signature by the owner
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cert: Option<Cert>, // Viso: the signer's delegation to the app key that signed
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub v: Option<u8>,
    #[serde(default)]
    pub likes: BTreeMap<String, Like>, // liker hex pubkey -> like
    #[serde(default)]
    pub comments: BTreeMap<String, Comment>, // "<author>:<id>" -> comment
}

/// State and delta share this shape: a delta is a state holding only what the peer is missing.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct FeedState {
    #[serde(default)]
    pub owner: String, // hex 32-byte pubkey
    #[serde(default)]
    pub profile: Option<ProfileInfo>,
    #[serde(default)]
    pub posts: BTreeMap<String, Post>,
    #[serde(default)]
    pub following: BTreeSet<String>, // hex pubkeys of followed users
    #[serde(default)]
    pub following_updated_at: u64,
    #[serde(default)]
    pub following_sig: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub following_cert: Option<Cert>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub following_v: Option<u8>,
    #[serde(default)]
    pub deleted: BTreeMap<String, Deletion>, // deleted post id -> owner signature
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Deletion {
    pub sig: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cert: Option<Cert>, // Viso: the signer's delegation to the app key that signed
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub v: Option<u8>,
}

fn is_zero(n: &u64) -> bool {
    *n == 0
}

pub type FeedDelta = FeedState;

/// What a peer holds. Signature prefixes tell apart two different records under the same key and timestamp.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct FeedSummary {
    pub profile: (u64, String),
    pub following: (u64, String),
    pub deleted: BTreeSet<String>,
    pub posts: BTreeMap<String, PostSummary>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct PostSummary {
    pub comments: BTreeSet<String>,
    pub likes: BTreeMap<String, (u64, String)>,
}

// Caps keep a full validate_state well under the node's 5 s per call (~195 µs per signed record, contract/bench/)
// and the state under its 50 MiB. Only records by others are evicted, and only by count: a count cap keeps merge
// order-independent, a byte budget would not.
pub const MAX_POSTS: usize = 4_000;
pub const MAX_COMMENTS_PER_POST: usize = 500;
pub const MAX_LIKES_PER_POST: usize = 2_000;
pub const MAX_OTHERS_COMMENTS: usize = 2_500; // x ~4.4 KB at most: ~11 MB
pub const MAX_OTHERS_LIKES: usize = 3_500;
pub const MAX_STATE_BYTES: usize = 38 * 1024 * 1024;
pub const POW_BITS: u32 = 12;
pub const MAX_SKEW_MS: u64 = 10 * 60 * 1000;
pub const MAX_FOLLOWING: usize = 5_000;
pub const MAX_TEXT: usize = 4_000; // caption, comment, bio, location... (bytes)
pub const MAX_NAME: usize = 100;
pub const MAX_ID: usize = 100;
pub const MAX_MEDIA: usize = 768 * 1024; // compressed data: URI of a moment image
pub const MAX_AVATAR: usize = 256 * 1024;

fn err(m: impl Into<String>) -> ContractError {
    ContractError::Other(m.into())
}

fn sig_prefix(s: &str) -> String {
    s.chars().take(16).collect()
}

// ---- Cryptographic & validation helpers ----

/// Whose feed this is, and the app path (`/v1/contract/web/<radica key>/`) Viso delegations must be made for.
pub struct Owner {
    pub hex: String,
    pub app: Option<String>,
    /// The node's clock (ms): records by others dated after `now + MAX_SKEW_MS` are left out until then.
    pub now: u64,
}

impl Owner {
    /// Parameters = owner pubkey (32 bytes) || app path (UTF-8, optional).
    pub fn from_params(params: &[u8]) -> R<Owner> {
        if params.len() < 32 {
            return Err(err("parameters must start with the owner pubkey (32 bytes)"));
        }
        VerifyingKey::from_bytes(&params[..32].try_into().unwrap()).map_err(|e| err(e.to_string()))?;
        let app = std::str::from_utf8(&params[32..]).map_err(|_| err("app path is not UTF-8"))?;
        Ok(Owner { hex: hex::encode(&params[..32]), app: (!app.is_empty()).then(|| app.to_string()), now: u64::MAX / 2 })
    }

    /// `who` signed `msg`: with their own key, or with an app key they delegated for this app.
    pub fn verify_by(&self, who: &str, msg: &str, sig: &str, cert: &Option<Cert>) -> R<()> {
        match cert {
            None => verify(&key_of(who)?, msg, sig),
            Some(c) => {
                let app = self.app.as_deref().ok_or_else(|| err("this feed takes no delegated signatures"))?;
                let app_key = whoiam_delegation::check(who, app, c).map_err(|e| err(format!("delegation: {e}")))?;
                whoiam_delegation::verify(&app_key, msg.as_bytes(), sig).map_err(|_| err("bad signature"))
            }
        }
    }
}

fn key_of(hex_pk: &str) -> R<VerifyingKey> {
    let b: [u8; 32] = hex::decode(hex_pk)
        .map_err(|_| err("pubkey is not hex"))?
        .try_into()
        .map_err(|_| err("pubkey must be 32 bytes"))?;
    VerifyingKey::from_bytes(&b).map_err(|e| err(e.to_string()))
}

fn verify(vk: &VerifyingKey, msg: &str, sig_hex: &str) -> R<()> {
    let sig: [u8; 64] = hex::decode(sig_hex)
        .map_err(|_| err("signature is not hex"))?
        .try_into()
        .map_err(|_| err("signature must be 64 bytes"))?;
    vk.verify_strict(msg.as_bytes(), &Signature::from_bytes(&sig))
        .map_err(|_| err("bad signature"))
}

fn limit(what: &str, s: &str, max: usize) -> R<()> {
    if s.len() > max {
        return Err(err(format!("{what} too long")));
    }
    Ok(())
}

pub fn post_msg(p: &Post) -> String {
    let o = |v: &Option<String>| v.clone().unwrap_or_default();
    format!(
        "radica/post/v2:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}",
        p.id, p.author, p.category, p.caption, o(&p.media_uri), o(&p.community_id), o(&p.location), o(&p.event_date), p.is_nsfw, p.timestamp
    )
}
pub fn comment_msg(c: &Comment) -> String {
    format!("radica/comment/v2:{}:{}:{}:{}:{}", c.id, c.post_id, c.author, c.text, c.timestamp)
}
pub fn like_msg(owner: &str, post_id: &str, liker: &str, l: &Like) -> String {
    format!("radica/like/v2:{owner}:{post_id}:{liker}:{}:{}", l.liked, l.ts)
}
pub fn profile_msg(owner: &str, p: &ProfileInfo) -> String {
    format!("radica/profile/v3:{owner}:{}:{}:{}:{}:{}", p.display_name, p.bio, p.avatar_url, p.enc_pub, p.updated_at)
}
pub fn following_msg(owner: &str, ts: u64, list: &BTreeSet<String>) -> String {
    format!("radica/following/v2:{owner}:{ts}:{}", list.iter().cloned().collect::<Vec<_>>().join(","))
}
pub fn delete_msg(owner: &str, post_id: &str) -> String {
    format!("radica/delete/v2:{owner}:{post_id}")
}

/// `<tag>|` then each field as `<byte length>:<bytes>`: one way to read it back, whatever the fields hold.
pub fn lp(tag: &str, fields: &[&str]) -> String {
    let mut m = format!("{tag}|");
    for f in fields {
        m.push_str(&f.len().to_string());
        m.push(':');
        m.push_str(f);
    }
    m
}
pub fn post_msg3(p: &Post) -> String {
    let o = |v: &Option<String>| v.clone().unwrap_or_default();
    let (nsfw, ts) = (p.is_nsfw.to_string(), p.timestamp.to_string());
    let (m, c, l, e) = (o(&p.media_uri), o(&p.community_id), o(&p.location), o(&p.event_date));
    lp("radica/post/v3", &[&p.id, &p.author, &p.category, &p.caption, &m, &c, &l, &e, &nsfw, &ts])
}
pub fn comment_msg3(owner: &str, c: &Comment) -> String {
    lp("radica/comment/v3", &[owner, &c.post_id, &c.id, &c.author, &c.text, &c.timestamp.to_string(), &c.nonce.to_string()])
}
pub fn like_msg3(owner: &str, post_id: &str, liker: &str, l: &Like) -> String {
    lp("radica/like/v3", &[owner, post_id, liker, &l.liked.to_string(), &l.ts.to_string(), &l.nonce.to_string()])
}
pub fn profile_msg4(owner: &str, p: &ProfileInfo) -> String {
    lp("radica/profile/v4", &[owner, &p.display_name, &p.bio, &p.avatar_url, &p.enc_pub, &p.updated_at.to_string()])
}
pub fn following_msg3(owner: &str, ts: u64, list: &BTreeSet<String>) -> String {
    let ts = ts.to_string();
    let fields: Vec<&str> = [owner, ts.as_str()].into_iter().chain(list.iter().map(String::as_str)).collect();
    lp("radica/following/v3", &fields)
}
pub fn delete_msg3(owner: &str, post_id: &str) -> String {
    lp("radica/delete/v3", &[owner, post_id])
}

/// Leading zero bits of BLAKE3(msg): the proof of work a v3 comment or like by someone else carries.
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

fn lower_hex64(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

impl Owner {
    /// `who` signed this record: the v3 message (`v == Some(3)`, lowercase key, and proof of work when `pow`), or,
    /// with no `v`, the legacy message exactly as the previous generation checked it.
    fn signed(&self, who: &str, v: Option<u8>, v3: &str, legacy: impl FnOnce() -> String, pow: bool, sig: &str, cert: &Option<Cert>) -> R<()> {
        match v {
            None => self.verify_by(who, &legacy(), sig, cert),
            Some(3) => {
                if !lower_hex64(who) {
                    return Err(err("v3 keys are lowercase hex"));
                }
                if pow && pow_bits(v3) < POW_BITS {
                    return Err(err("not enough proof of work"));
                }
                self.verify_by(who, v3, sig, cert)
            }
            Some(_) => Err(err("unknown signature version")),
        }
    }
}

fn check_post(o: &Owner, id: &str, p: &Post) -> R<()> {
    if p.id != id || p.author != o.hex {
        return Err(err("post id or author does not match"));
    }
    if !matches!(p.category.as_str(), "thought" | "moment" | "event") {
        return Err(err("unknown post category"));
    }
    limit("post id", &p.id, MAX_ID)?;
    limit("caption", &p.caption, MAX_TEXT)?;
    limit("media", p.media_uri.as_deref().unwrap_or(""), MAX_MEDIA)?;
    for v in [&p.community_id, &p.location, &p.event_date] {
        limit("post field", v.as_deref().unwrap_or(""), MAX_NAME * 2)?;
    }
    o.signed(&o.hex, p.v, &post_msg3(p), || post_msg(p), false, &p.sig, &p.cert)
}

fn check_comment(o: &Owner, post_id: &str, key: &str, c: &Comment) -> R<()> {
    if c.post_id != post_id || key != format!("{}:{}", c.author, c.id) {
        return Err(err("comment key or post id does not match"));
    }
    limit("comment id", &c.id, MAX_ID)?;
    limit("comment", &c.text, MAX_TEXT)?;
    o.signed(&c.author, c.v, &comment_msg3(&o.hex, c), || comment_msg(c), c.author != o.hex, &c.sig, &c.cert)
}

// ---- Merge: one canonical procedure over the union ----

/// Merge `inc` (a full state or a delta) into `state`. Fails only on a forged or oversized record.
pub fn merge(o: &Owner, state: &mut FeedState, inc: FeedState) -> R<()> {
    let owner = o.hex.clone();
    state.owner = owner.clone();

    if let Some(p) = inc.profile {
        let newer = state.profile.as_ref().map_or(true, |c| (p.updated_at, &p.sig) > (c.updated_at, &c.sig));
        if newer {
            limit("display name", &p.display_name, MAX_NAME)?;
            limit("bio", &p.bio, MAX_TEXT)?;
            limit("avatar", &p.avatar_url, MAX_AVATAR)?;
            limit("encryption key", &p.enc_pub, 64)?;
            o.signed(&owner, p.v, &profile_msg4(&owner, &p), || profile_msg(&owner, &p), false, &p.sig, &p.cert)?;
            state.profile = Some(p);
        }
    }

    if (inc.following_updated_at, &inc.following_sig) > (state.following_updated_at, &state.following_sig) {
        if inc.following.len() > MAX_FOLLOWING {
            return Err(err("following list too long"));
        }
        let (ts, list) = (inc.following_updated_at, &inc.following);
        o.signed(&owner, inc.following_v, &following_msg3(&owner, ts, list), || following_msg(&owner, ts, list), false, &inc.following_sig, &inc.following_cert)?;
        state.following = inc.following;
        state.following_updated_at = inc.following_updated_at;
        state.following_sig = inc.following_sig;
        state.following_cert = inc.following_cert;
        state.following_v = inc.following_v;
    }

    for (id, d) in inc.deleted {
        if state.deleted.get(&id).map_or(true, |cur| d.sig > cur.sig) {
            limit("post id", &id, MAX_ID)?;
            o.signed(&owner, d.v, &delete_msg3(&owner, &id), || delete_msg(&owner, &id), false, &d.sig, &d.cert)?;
            state.posts.remove(&id);
            state.deleted.insert(id, d);
        }
    }

    for (id, p) in inc.posts {
        if state.deleted.contains_key(&id) {
            continue;
        }
        if !state.posts.contains_key(&id) {
            check_post(o, &id, &p)?;
            let mut bare = p.clone();
            bare.likes.clear();
            bare.comments.clear();
            state.posts.insert(id.clone(), bare);
        }
        let cur = state.posts.get_mut(&id).unwrap();
        for (k, c) in p.comments {
            if c.author != owner && c.timestamp > o.now.saturating_add(MAX_SKEW_MS) {
                continue; // dated in the future: it would outrank everything; taken once its time comes
            }
            let replace = cur.comments.get(&k).map_or(true, |old| c.sig > old.sig); // same author, same id: one deterministic winner
            if replace {
                check_comment(o, &id, &k, &c)?;
                cur.comments.insert(k, c);
            }
        }
        for (liker, l) in p.likes {
            if liker != owner && l.ts > o.now.saturating_add(MAX_SKEW_MS) {
                continue;
            }
            let newer = cur.likes.get(&liker).map_or(true, |old| (l.ts, &l.sig) > (old.ts, &old.sig));
            if newer {
                o.signed(&liker, l.v, &like_msg3(&owner, &id, &liker, &l), || like_msg(&owner, &id, &liker, &l), liker != owner, &l.sig, &l.cert)?;
                cur.likes.insert(liker, l);
            }
        }
    }

    if state.posts.len() > MAX_POSTS {
        return Err(err("too many posts"));
    }
    evict(o, state);
    if ser(state)?.len() > MAX_STATE_BYTES {
        return Err(err("state too large"));
    }
    Ok(())
}

/// Order in which records by others are kept under a cap: v3 before legacy (anyone can still sign a legacy-format
/// record for free), then newer first, then by signature, post id and key. Newer first, with no record dated in the
/// future, means a spammer has to keep paying proof of work to hold the cap, and stops holding it once they stop; any
/// order on age or on proof of work alone could be won once and kept. A strict total order, so the kept set is the
/// same whatever order the records arrived in.
type Rank = (bool, std::cmp::Reverse<u64>, String, String, String);

fn comment_rank(post_id: &str, k: &str, c: &Comment) -> Rank {
    (c.v.is_none(), std::cmp::Reverse(c.timestamp), c.sig.clone(), post_id.to_string(), k.to_string())
}
fn like_rank(post_id: &str, liker: &str, l: &Like) -> Rank {
    (l.v.is_none(), std::cmp::Reverse(l.ts), l.sig.clone(), post_id.to_string(), liker.to_string())
}

/// Drop the lowest-ranked comments and likes by others past each cap (per post, then per feed). The owner's are never dropped.
fn evict(o: &Owner, s: &mut FeedState) {
    let mut comments: Vec<Rank> = Vec::new();
    let mut likes: Vec<Rank> = Vec::new();
    for (id, p) in s.posts.iter_mut() {
        let mut cs: Vec<Rank> = p.comments.iter().filter(|(_, c)| c.author != o.hex).map(|(k, c)| comment_rank(id, k, c)).collect();
        cs.sort();
        for r in cs.drain(MAX_COMMENTS_PER_POST.min(cs.len())..) {
            p.comments.remove(&r.4);
        }
        let mut ls: Vec<Rank> = p.likes.iter().filter(|(k, _)| **k != o.hex).map(|(k, l)| like_rank(id, k, l)).collect();
        ls.sort();
        for r in ls.drain(MAX_LIKES_PER_POST.min(ls.len())..) {
            p.likes.remove(&r.4);
        }
        comments.extend(cs);
        likes.extend(ls);
    }
    comments.sort();
    for r in comments.drain(MAX_OTHERS_COMMENTS.min(comments.len())..) {
        s.posts.get_mut(&r.3).map(|p| p.comments.remove(&r.4));
    }
    likes.sort();
    for r in likes.drain(MAX_OTHERS_LIKES.min(likes.len())..) {
        s.posts.get_mut(&r.3).map(|p| p.likes.remove(&r.4));
    }
}

pub fn summarize(s: &FeedState) -> FeedSummary {
    FeedSummary {
        profile: s.profile.as_ref().map_or((0, String::new()), |p| (p.updated_at, sig_prefix(&p.sig))),
        following: (s.following_updated_at, sig_prefix(&s.following_sig)),
        deleted: s.deleted.keys().cloned().collect(),
        posts: s
            .posts
            .iter()
            .map(|(id, p)| {
                let likes = p.likes.iter().map(|(k, l)| (k.clone(), (l.ts, sig_prefix(&l.sig)))).collect();
                (id.clone(), PostSummary { comments: p.comments.values().map(|c| sig_prefix(&c.sig)).collect(), likes })
            })
            .collect(),
    }
}

/// The part of `s` a peer with summary `sum` is missing (or holds an older version of).
pub fn compute_delta(s: &FeedState, sum: &FeedSummary) -> FeedState {
    let mut d = FeedState { owner: s.owner.clone(), ..Default::default() };
    if let Some(p) = &s.profile {
        if (p.updated_at, sig_prefix(&p.sig)) > sum.profile {
            d.profile = Some(p.clone());
        }
    }
    if (s.following_updated_at, sig_prefix(&s.following_sig)) > sum.following {
        d.following = s.following.clone();
        d.following_updated_at = s.following_updated_at;
        d.following_sig = s.following_sig.clone();
        d.following_cert = s.following_cert.clone();
        d.following_v = s.following_v;
    }
    d.deleted = s.deleted.iter().filter(|(id, _)| !sum.deleted.contains(*id)).map(|(k, v)| (k.clone(), v.clone())).collect();
    for (id, p) in &s.posts {
        if sum.deleted.contains(id) {
            continue;
        }
        let Some(ps) = sum.posts.get(id) else {
            d.posts.insert(id.clone(), p.clone());
            continue;
        };
        let mut part = p.clone();
        part.comments.retain(|_, c| !ps.comments.contains(&sig_prefix(&c.sig)));
        part.likes.retain(|k, l| ps.likes.get(k).map_or(true, |peer| (l.ts, sig_prefix(&l.sig)) > *peer));
        if !part.comments.is_empty() || !part.likes.is_empty() {
            d.posts.insert(id.clone(), part);
        }
    }
    d
}

fn is_empty_delta(d: &FeedState) -> bool {
    d.profile.is_none() && d.following_sig.is_empty() && d.deleted.is_empty() && d.posts.is_empty()
}

// ---- Serialization glue ----

fn de<T: for<'a> Deserialize<'a> + Default>(b: &[u8]) -> R<T> {
    if b.is_empty() {
        return Ok(T::default());
    }
    serde_json::from_slice(b).map_err(|e| ContractError::Deser(e.to_string()))
}

fn ser<T: Serialize>(v: &T) -> R<Vec<u8>> {
    serde_json::to_vec(v).map_err(|e| ContractError::Deser(e.to_string()))
}

/// A state is valid when it is exactly what merging it into an empty state gives (every record checked, nothing extra).
pub fn validate(o: &Owner, s: &FeedState) -> bool {
    let mut canon = FeedState::default();
    let ok = merge(o, &mut canon, s.clone()).is_ok();
    canon.owner = s.owner.clone(); // informational field, not signed
    ok && canon == *s
}

// ---- Freenet Contract Interface ----

fn now_ms() -> u64 {
    freenet_stdlib::time::now().timestamp_millis().max(0) as u64
}

pub struct RadicaFeedContract;

#[contract]
impl ContractInterface for RadicaFeedContract {
    fn validate_state(
        parameters: Parameters<'static>,
        state: State<'static>,
        _related: RelatedContracts<'static>,
    ) -> Result<ValidateResult, ContractError> {
        let o = Owner { now: now_ms(), ..Owner::from_params(parameters.as_ref())? };
        let ok = de::<FeedState>(state.as_ref()).is_ok_and(|s| validate(&o, &s));
        Ok(if ok { ValidateResult::Valid } else { ValidateResult::Invalid })
    }

    fn update_state(
        parameters: Parameters<'static>,
        state: State<'static>,
        data: Vec<UpdateData<'static>>,
    ) -> Result<UpdateModification<'static>, ContractError> {
        let o = Owner { now: now_ms(), ..Owner::from_params(parameters.as_ref())? };
        let mut cur: FeedState = de(state.as_ref())?;
        for item in data {
            let parts: Vec<Vec<u8>> = match item {
                UpdateData::State(s) => vec![s.as_ref().to_vec()],
                UpdateData::Delta(d) => vec![d.as_ref().to_vec()],
                UpdateData::StateAndDelta { state, delta } => vec![state.as_ref().to_vec(), delta.as_ref().to_vec()],
                _ => return Err(ContractError::InvalidUpdate),
            };
            for p in parts {
                merge(&o, &mut cur, de(&p)?)?; // keep the reason: the node logs it
            }
        }
        Ok(UpdateModification::valid(State::from(ser(&cur)?)))
    }

    fn summarize_state(
        _parameters: Parameters<'static>,
        state: State<'static>,
    ) -> Result<StateSummary<'static>, ContractError> {
        Ok(StateSummary::from(ser(&summarize(&de(state.as_ref())?))?))
    }

    fn get_state_delta(
        _parameters: Parameters<'static>,
        state: State<'static>,
        summary: StateSummary<'static>,
    ) -> Result<StateDelta<'static>, ContractError> {
        let d = compute_delta(&de(state.as_ref())?, &de(summary.as_ref())?);
        Ok(StateDelta::from(if is_empty_delta(&d) { vec![] } else { ser(&d)? }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn sk(n: u8) -> SigningKey {
        SigningKey::from_bytes(&[n; 32])
    }
    fn hx(k: &SigningKey) -> String {
        hex::encode(k.verifying_key().as_bytes())
    }
    const APP: &str = "/v1/contract/web/Radica1/";
    fn own(k: &SigningKey) -> Owner {
        Owner { hex: hx(k), app: Some(APP.into()), now: 1 << 40 }
    }
    /// Persona `who` delegates an app key for APP (as Viso does); returns the key and the certificate.
    fn delegate(who: &SigningKey, app: &str) -> (SigningKey, Cert) {
        let app_key = SigningKey::from_bytes(&[who.to_bytes()[0].wrapping_add(100); 32]);
        let base = format!("http://127.0.0.1:7509{app}");
        let challenge = format!("wd1.{}.n1", hx(&app_key));
        let msg = whoiam_delegation::connect_message(who.verifying_key().as_bytes(), &base, &challenge, 7);
        (app_key, Cert { base, challenge, ts: 7, sig: hex::encode(who.sign(&msg).to_bytes()) })
    }
    fn sign(k: &SigningKey, m: &str) -> String {
        hex::encode(k.sign(m.as_bytes()).to_bytes())
    }

    fn post(owner: &SigningKey, id: &str, caption: &str, ts: u64) -> Post {
        let mut p = Post {
            id: id.into(),
            author: hx(owner),
            category: "thought".into(),
            caption: caption.into(),
            community_id: None,
            media_uri: None,
            location: None,
            event_date: None,
            is_nsfw: false,
            timestamp: ts,
            sig: String::new(),
            likes: BTreeMap::new(),
            comments: BTreeMap::new(),
            cert: None,
            v: None,
        };
        p.sig = sign(owner, &post_msg(&p));
        p
    }
    fn comment(author: &SigningKey, id: &str, post_id: &str, text: &str, ts: u64) -> (String, Comment) {
        let mut c = Comment { id: id.into(), post_id: post_id.into(), author: hx(author), text: text.into(), timestamp: ts, sig: String::new(), cert: None, v: None, nonce: 0 };
        c.sig = sign(author, &comment_msg(&c));
        (format!("{}:{}", c.author, id), c)
    }
    fn like(liker: &SigningKey, owner: &SigningKey, post_id: &str, liked: bool, ts: u64) -> (String, Like) {
        let mut l = Like { liked, ts, sig: String::new(), cert: None, v: None, nonce: 0 };
        l.sig = sign(liker, &like_msg(&hx(owner), post_id, &hx(liker), &l));
        (hx(liker), l)
    }
    fn profile(owner: &SigningKey, name: &str, ts: u64) -> ProfileInfo {
        let mut p = ProfileInfo { display_name: name.into(), bio: String::new(), avatar_url: String::new(), enc_pub: String::new(), updated_at: ts, sig: String::new(), cert: None, v: None };
        p.sig = sign(owner, &profile_msg(&hx(owner), &p));
        p
    }
    fn with_posts(posts: Vec<Post>) -> FeedState {
        FeedState { posts: posts.into_iter().map(|p| (p.id.clone(), p)).collect(), ..Default::default() }
    }
    fn merged(o: &SigningKey, parts: &[FeedState]) -> FeedState {
        let mut s = FeedState::default();
        for p in parts {
            merge(&own(o), &mut s, p.clone()).unwrap();
        }
        s
    }

    /// A rich set of states, used to check the merge laws.
    fn sample(o: &SigningKey) -> Vec<FeedState> {
        let (a, b) = (sk(2), sk(3));
        let mut p1 = post(o, "p1", "hello", 10);
        let (k, c) = comment(&a, "c1", "p1", "hi", 11);
        p1.comments.insert(k, c);
        let (k, l) = like(&a, o, "p1", true, 12);
        p1.likes.insert(k, l);
        let mut p1b = post(o, "p1", "hello", 10);
        let (k, l) = like(&a, o, "p1", false, 13);
        p1b.likes.insert(k, l);
        let (k, c) = comment(&b, "c1", "p1", "same id, other author", 11);
        p1b.comments.insert(k, c);
        let mut s1 = with_posts(vec![p1, post(o, "p2", "two", 20)]);
        s1.profile = Some(profile(o, "Alice", 100));
        let mut s2 = with_posts(vec![p1b]);
        s2.profile = Some(profile(o, "Alice 2", 100));
        let list: BTreeSet<String> = [hx(&a)].into();
        s2.following_sig = sign(o, &following_msg(&hx(o), 5, &list));
        s2.following = list;
        s2.following_updated_at = 5;
        let mut s3 = FeedState::default();
        s3.deleted.insert("p2".into(), Deletion { sig: sign(o, &delete_msg(&hx(o), "p2")), cert: None, v: None });
        vec![s1, s2, s3]
    }

    #[test]
    fn merge_laws_hold() {
        let o = sk(1);
        let s = sample(&o);
        for a in &s {
            assert_eq!(merged(&o, &[a.clone(), a.clone()]), merged(&o, &[a.clone()]), "idempotence");
            for b in &s {
                assert_eq!(merged(&o, &[a.clone(), b.clone()]), merged(&o, &[b.clone(), a.clone()]), "commutativity");
                for c in &s {
                    let left = merged(&o, &[merged(&o, &[a.clone(), b.clone()]), c.clone()]);
                    let right = merged(&o, &[a.clone(), merged(&o, &[b.clone(), c.clone()])]);
                    assert_eq!(left, right, "associativity");
                }
            }
        }
        let all = merged(&o, &s);
        assert!(validate(&own(&o), &all));
        assert!(!all.posts.contains_key("p2"), "deleted post is gone");
        assert_eq!(all.posts["p1"].comments.len(), 2, "same comment id by two authors: both kept");
        assert!(!all.posts["p1"].likes[&hx(&sk(2))].liked, "later unlike wins");
    }

    #[test]
    fn delta_path_agrees_with_full_merge() {
        let o = sk(1);
        let s = sample(&o);
        for a in &s {
            for b in &s {
                let a = merged(&o, &[a.clone()]);
                let b = merged(&o, &[b.clone()]);
                let mut via_delta = a.clone();
                merge(&own(&o), &mut via_delta, compute_delta(&b, &summarize(&a))).unwrap();
                assert_eq!(via_delta, merged(&o, &[a.clone(), b.clone()]));
            }
        }
        let all = merged(&o, &s);
        assert!(is_empty_delta(&compute_delta(&all, &summarize(&all))));
    }

    #[test]
    fn forgeries_are_rejected() {
        let (o, x) = (sk(1), sk(9));
        let vk = own(&o);
        let mut s = FeedState::default();
        // profile, following, deletion and posts can only come from the owner
        assert!(merge(&vk, &mut s, FeedState { profile: Some(profile(&x, "Mallory", 1)), ..Default::default() }).is_err());
        let list: BTreeSet<String> = [hx(&x)].into();
        let f = FeedState { following_sig: sign(&x, &following_msg(&hx(&o), 1, &list)), following: list, following_updated_at: 1, ..Default::default() };
        assert!(merge(&vk, &mut s, f).is_err());
        let mut d = FeedState::default();
        d.deleted.insert("p1".into(), Deletion { sig: sign(&x, &delete_msg(&hx(&o), "p1")), cert: None, v: None });
        assert!(merge(&vk, &mut s, d).is_err());
        assert!(merge(&vk, &mut s, with_posts(vec![post(&x, "p1", "spam", 1)])).is_err());
        // unsigned post fields cannot be changed in transit
        let mut p = post(&o, "p1", "hi", 1);
        p.location = Some("elsewhere".into());
        assert!(merge(&vk, &mut s, with_posts(vec![p])).is_err());
        // a comment signed for one post cannot be moved under another, nor stored under someone else's key
        merge(&vk, &mut s, with_posts(vec![post(&o, "p1", "hi", 1), post(&o, "p2", "yo", 2)])).unwrap();
        let (k, c) = comment(&x, "c1", "p1", "for p1", 3);
        let mut moved = post(&o, "p2", "yo", 2);
        moved.comments.insert(k, c.clone());
        assert!(merge(&vk, &mut s, with_posts(vec![moved])).is_err());
        let mut stolen = post(&o, "p1", "hi", 1);
        stolen.comments.insert(format!("{}:c1", hx(&sk(2))), c);
        assert!(merge(&vk, &mut s, with_posts(vec![stolen])).is_err());
        // a like signed by someone else under my key
        let mut liked = post(&o, "p1", "hi", 1);
        let (_, l) = like(&x, &o, "p1", true, 4);
        liked.likes.insert(hx(&sk(2)), l);
        assert!(merge(&vk, &mut s, with_posts(vec![liked])).is_err());
    }

    #[test]
    fn deleted_post_never_returns() {
        let o = sk(1);
        let mut d = FeedState::default();
        d.deleted.insert("p1".into(), Deletion { sig: sign(&o, &delete_msg(&hx(&o), "p1")), cert: None, v: None });
        let s = merged(&o, &[with_posts(vec![post(&o, "p1", "hi", 1)]), d.clone(), with_posts(vec![post(&o, "p1", "hi", 1)])]);
        assert!(s.posts.is_empty());
        assert_eq!(s, merged(&o, &[d]));
    }

    #[test]
    fn contract_interface_round_trip() {
        let o = sk(1);
        let params = Parameters::from([o.verifying_key().as_bytes().as_slice(), APP.as_bytes()].concat());
        let all = merged(&o, &sample(&o));
        let bytes = ser(&all).unwrap();
        let v = RadicaFeedContract::validate_state(params.clone(), State::from(bytes.clone()), RelatedContracts::default()).unwrap();
        assert_eq!(v, ValidateResult::Valid);
        let mut bad = all.clone();
        bad.posts.get_mut("p1").unwrap().caption = "tampered".into();
        let v = RadicaFeedContract::validate_state(params.clone(), State::from(ser(&bad).unwrap()), RelatedContracts::default()).unwrap();
        assert_eq!(v, ValidateResult::Invalid);
        let up = RadicaFeedContract::update_state(params.clone(), State::from(vec![]), vec![UpdateData::Delta(StateDelta::from(bytes.clone()))]).unwrap();
        assert_eq!(de::<FeedState>(up.unwrap_valid().as_ref()).unwrap(), all);
        let sum = RadicaFeedContract::summarize_state(params.clone(), State::from(bytes.clone())).unwrap();
        assert!(RadicaFeedContract::get_state_delta(params, State::from(bytes), sum).unwrap().as_ref().is_empty());
    }

    #[test]
    fn viso_delegated_signatures() {
        let (o, x) = (sk(1), sk(9));
        let (app_key, cert) = delegate(&o, APP);
        let mut p = post(&o, "p1", "from Viso", 1);
        p.sig = sign(&app_key, &post_msg(&p));
        p.cert = Some(cert.clone());
        let mut s = FeedState::default();
        merge(&own(&o), &mut s, with_posts(vec![p.clone()])).unwrap();
        assert!(validate(&own(&o), &s));
        // the same delegation for another app does not count here
        let (other_key, other_cert) = delegate(&o, "/v1/contract/web/OtherApp/");
        let mut q = post(&o, "p2", "elsewhere", 2);
        q.sig = sign(&other_key, &post_msg(&q));
        q.cert = Some(other_cert);
        assert!(merge(&own(&o), &mut s, with_posts(vec![q])).is_err());
        // someone else's delegation cannot sign for the owner
        let (x_key, x_cert) = delegate(&x, APP);
        let mut r = post(&o, "p3", "forged", 3);
        r.sig = sign(&x_key, &post_msg(&r));
        r.cert = Some(x_cert.clone());
        assert!(merge(&own(&o), &mut s, with_posts(vec![r])).is_err());
        // but a Viso user can comment and like with their own delegation
        let mut liked = p.clone();
        let mut c = Comment { id: "c1".into(), post_id: "p1".into(), author: hx(&x), text: "hi".into(), timestamp: 4, sig: String::new(), cert: Some(x_cert.clone()), v: None, nonce: 0 };
        c.sig = sign(&x_key, &comment_msg(&c));
        liked.comments.insert(format!("{}:c1", hx(&x)), c);
        let mut l = Like { liked: true, ts: 5, sig: String::new(), cert: Some(x_cert), v: None, nonce: 0 };
        l.sig = sign(&x_key, &like_msg(&hx(&o), "p1", &hx(&x), &l));
        liked.likes.insert(hx(&x), l);
        merge(&own(&o), &mut s, with_posts(vec![liked])).unwrap();
        assert_eq!(s.posts["p1"].comments.len(), 1);
        // a feed without an app path takes no delegations
        assert!(merge(&Owner { hex: hx(&o), app: None, now: 1 << 40 }, &mut FeedState::default(), with_posts(vec![p])).is_err());
    }

    #[test]
    fn an_author_takes_back_a_comment_with_an_empty_version() {
        // the UI's "delete comment": same author and id, empty text, a timestamp chosen so the signature sorts higher
        let (o, a) = (sk(1), sk(2));
        let mut p = post(&o, "p1", "hello", 10);
        let (k, c) = comment(&a, "c1", "p1", "oops, a duplicate", 11);
        p.comments.insert(k.clone(), c.clone());
        let before = with_posts(vec![p]);
        let mut ts = 12;
        let gone = loop {
            let (_, g) = comment(&a, "c1", "p1", "", ts);
            if g.sig > c.sig { break g; }
            ts += 1;
        };
        let mut p2 = post(&o, "p1", "hello", 10);
        p2.comments.insert(k.clone(), gone.clone());
        let after = with_posts(vec![p2]);
        for order in [[before.clone(), after.clone()], [after.clone(), before.clone()]] {
            assert_eq!(merged(&o, &order).posts["p1"].comments[&k].text, "", "every node keeps the empty version");
        }
        // someone else cannot take it back: their version would sit under their own key
        let (k2, _) = comment(&sk(3), "c1", "p1", "", 99);
        assert_ne!(k2, k);
    }

    // ---- v3 ----

    fn post3(owner: &SigningKey, id: &str, caption: &str, ts: u64) -> Post {
        let mut p = post(owner, id, caption, ts);
        p.v = Some(3);
        p.sig = sign(owner, &post_msg3(&p));
        p
    }
    /// A v3 comment; by someone else it grinds the nonce for the proof of work.
    fn comment3(author: &SigningKey, owner: &SigningKey, id: &str, post_id: &str, ts: u64) -> (String, Comment) {
        let mut c = Comment { id: id.into(), post_id: post_id.into(), author: hx(author), text: "hi".into(), timestamp: ts, sig: String::new(), cert: None, v: Some(3), nonce: 0 };
        while hx(author) != hx(owner) && pow_bits(&comment_msg3(&hx(owner), &c)) < POW_BITS {
            c.nonce += 1;
        }
        c.sig = sign(author, &comment_msg3(&hx(owner), &c));
        (format!("{}:{}", c.author, id), c)
    }
    #[test]
    fn an_author_edits_a_comment_keeping_its_id_and_timestamp() {
        // the UI's "edit comment": same author, id and timestamp (the id carries the anti-bot proof readers check),
        // new text; only the nonce moves, still paying the proof of work, until the signature sorts higher
        let (o, a) = (sk(1), sk(2));
        let mut p = post3(&o, "p1", "hello", 10);
        let (k, c) = comment3(&a, &o, "c1", "p1", 11);
        p.comments.insert(k.clone(), c.clone());
        let before = with_posts(vec![p]);
        let mut e = Comment { text: "hi, edited".into(), nonce: c.nonce + 1, sig: String::new(), ..c.clone() };
        let edited = loop {
            while pow_bits(&comment_msg3(&hx(&o), &e)) < POW_BITS {
                e.nonce += 1;
            }
            e.sig = sign(&a, &comment_msg3(&hx(&o), &e));
            if e.sig > c.sig { break e.clone(); }
            e.nonce += 1;
        };
        let mut p2 = post3(&o, "p1", "hello", 10);
        p2.comments.insert(k.clone(), edited.clone());
        let after = with_posts(vec![p2]);
        for order in [[before.clone(), after.clone()], [after.clone(), before.clone()]] {
            let kept = &merged(&o, &order).posts["p1"].comments[&k];
            assert_eq!((kept.text.as_str(), kept.timestamp, kept.id.as_str()), ("hi, edited", 11, "c1"), "every node keeps the edit, in place");
        }
    }

    fn others(n: usize) -> Vec<SigningKey> {
        (0..n).map(|i| SigningKey::from_bytes(&{ let mut b = [9u8; 32]; b[..8].copy_from_slice(&(i as u64).to_le_bytes()); b })).collect()
    }

    #[test]
    fn length_prefix_reads_back_one_way() {
        assert_eq!(lp("t", &["a:b", ""]), "t|3:a:b0:");
        assert_ne!(lp("t", &["a", "b:c"]), lp("t", &["a:b", "c"]));
    }

    #[test]
    fn v3_records_verify_and_cannot_be_re_split() {
        let o = sk(1);
        let p = post3(&o, "p1", "hi: there", 10);
        merge(&own(&o), &mut FeedState::default(), with_posts(vec![p.clone()])).unwrap();
        // the same fields cut elsewhere no longer verify
        let mut moved = p.clone();
        moved.caption = "hi".into();
        moved.media_uri = Some(" there".into());
        assert!(merge(&own(&o), &mut FeedState::default(), with_posts(vec![moved])).is_err());
        // the version tag is not a free choice: a v3 signature under no `v`, or a legacy one under `v: 3`, fails
        let mut unmarked = p.clone();
        unmarked.v = None;
        assert!(merge(&own(&o), &mut FeedState::default(), with_posts(vec![unmarked])).is_err());
        let mut marked = post(&o, "p1", "x", 10);
        marked.v = Some(3);
        assert!(merge(&own(&o), &mut FeedState::default(), with_posts(vec![marked])).is_err());
    }

    #[test]
    fn others_need_proof_of_work_and_lowercase_keys() {
        let (o, a) = (sk(1), sk(2));
        let mut p = post3(&o, "p1", "x", 10);
        let (k, good) = comment3(&a, &o, "c1", "p1", 11);
        p.comments.insert(k.clone(), good.clone());
        merge(&own(&o), &mut FeedState::default(), with_posts(vec![p.clone()])).unwrap();
        // no work done
        let mut lazy = good.clone();
        while pow_bits(&comment_msg3(&hx(&o), &lazy)) >= POW_BITS {
            lazy.nonce += 1;
        }
        lazy.sig = sign(&a, &comment_msg3(&hx(&o), &lazy));
        p.comments.insert(k.clone(), lazy);
        assert!(merge(&own(&o), &mut FeedState::default(), with_posts(vec![p.clone()])).is_err());
        // the owner comments on their own feed without it
        let (k2, mine) = comment3(&o, &o, "c2", "p1", 12);
        let mut q = post3(&o, "p1", "x", 10);
        q.comments.insert(k2, mine);
        merge(&own(&o), &mut FeedState::default(), with_posts(vec![q])).unwrap();
        // an uppercase key is refused in v3
        let mut up = good;
        up.author = up.author.to_uppercase();
        let mut r = post3(&o, "p1", "x", 10);
        r.comments.insert(format!("{}:c1", up.author), up);
        assert!(merge(&own(&o), &mut FeedState::default(), with_posts(vec![r])).is_err());
    }

    #[test]
    fn comments_past_the_cap_are_dropped_the_same_way_in_any_order() {
        let o = sk(1);
        let n = MAX_COMMENTS_PER_POST + 6;
        let keys = others(n);
        let all: Vec<(String, Comment)> = keys.iter().enumerate().map(|(i, k)| comment3(k, &o, "c", "p1", 100 + i as u64)).collect();
        let half = |r: std::ops::Range<usize>| {
            let mut p = post3(&o, "p1", "x", 10);
            p.comments.extend(all[r].iter().cloned());
            with_posts(vec![p])
        };
        let (a, b) = (half(0..n / 2), half(n / 2..n));
        let ab = merged(&o, &[a.clone(), b.clone()]);
        assert_eq!(ab, merged(&o, &[b.clone(), a.clone()]));
        assert_eq!(ab.posts["p1"].comments.len(), MAX_COMMENTS_PER_POST);
        assert!(validate(&own(&o), &ab));
        // a legacy comment costs nothing to sign, so it never pushes out a v3 one with proof of work
        let (k, old) = comment(&sk(7), "old", "p1", "free", 1);
        let mut c = post3(&o, "p1", "x", 10);
        c.comments.insert(k.clone(), old);
        let with_old = merged(&o, &[ab.clone(), with_posts(vec![c.clone()])]);
        assert!(!with_old.posts["p1"].comments.contains_key(&k));
        assert_eq!(with_old, ab);
        // under the cap it is kept: carried-forward comments stay
        let mut small = post3(&o, "p1", "x", 10);
        small.comments.extend(all[..3].iter().cloned());
        assert!(merged(&o, &[with_posts(vec![small]), with_posts(vec![c])]).posts["p1"].comments.contains_key(&k));
    }

    #[test]
    fn delta_carries_the_following_delegation() {
        let o = sk(1);
        let (app_key, cert) = delegate(&o, APP);
        let list: BTreeSet<String> = [hx(&sk(2))].into();
        let mut s = FeedState { following: list.clone(), following_updated_at: 5, following_v: Some(3), following_cert: Some(cert), ..Default::default() };
        s.following_sig = sign(&app_key, &following_msg3(&hx(&o), 5, &list));
        let full = merged(&o, &[s]);
        let d = compute_delta(&full, &FeedSummary::default());
        assert_eq!(merged(&o, &[d]), full);
    }

    // Shared vectors with ui/tests/crypto.test.ts: change both or neither.
    #[test]
    fn v3_vectors_match_the_ui() {
        assert_eq!(lp("t", &["a:b", "", "é"]), "t|3:a:b0:2:é");
        let mut p = post(&sk(1), "p1", "hi: é", 7);
        p.author = "ab".repeat(32);
        assert_eq!(post_msg3(&p), format!("radica/post/v3|2:p164:{}7:thought6:hi: é0:0:0:0:5:false1:7", "ab".repeat(32)));
        let c = Comment { id: "c1".into(), post_id: "p1".into(), author: "cd".repeat(32), text: "x".into(), timestamp: 9, sig: String::new(), cert: None, v: Some(3), nonce: 15254 };
        assert!(pow_bits(&comment_msg3(&"ab".repeat(32), &c)) >= POW_BITS);
    }

    #[test]
    fn others_cannot_date_ahead_and_newer_ones_stay() {
        let o = sk(1);
        let me = own(&o);
        let mut p = post3(&o, "p1", "x", 10);
        let (k, ahead) = comment3(&sk(2), &o, "c1", "p1", me.now + MAX_SKEW_MS + 1);
        p.comments.insert(k.clone(), ahead);
        let mut s = FeedState::default();
        merge(&me, &mut s, with_posts(vec![p])).unwrap();
        assert!(s.posts["p1"].comments.is_empty(), "left out until its time comes");
        // past the cap, the oldest go first
        let keys = others(MAX_COMMENTS_PER_POST + 1);
        let mut q = post3(&o, "p1", "x", 10);
        q.comments.extend(keys.iter().enumerate().map(|(i, k)| comment3(k, &o, "c", "p1", 100 + i as u64)));
        let s = merged(&o, &[with_posts(vec![q])]);
        let oldest = format!("{}:c", hx(&keys[0]));
        assert!(!s.posts["p1"].comments.contains_key(&oldest));
        assert_eq!(s.posts["p1"].comments.len(), MAX_COMMENTS_PER_POST);
    }
}
