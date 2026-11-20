use ed25519_dalek::{Signer, SigningKey};
use radica_contract::*;
use std::collections::BTreeMap;

static mut STATE: Option<String> = None;

fn key(i: u32) -> SigningKey { let mut s = [7u8; 32]; s[..4].copy_from_slice(&i.to_le_bytes()); SigningKey::from_bytes(&s) }
fn hx(k: &SigningKey) -> String { hex::encode(k.verifying_key().to_bytes()) }

/// A feed with `posts` posts, each with `comments` comments and `likes` likes by distinct keys. Returns its JSON size.
#[no_mangle]
pub extern "C" fn prepare(posts: u32, comments: u32, likes: u32) -> u32 {
    let owner = key(0);
    let oh = hx(&owner);
    let others: Vec<SigningKey> = (1..=comments.max(likes)).map(key).collect();
    let mut st = FeedState { owner: oh.clone(), ..Default::default() };
    for p in 0..posts {
        let mut post = Post { id: format!("p{p}"), author: oh.clone(), category: "thought".into(), caption: "x".repeat(200),
            community_id: None, media_uri: None, location: None, event_date: None, is_nsfw: false, timestamp: 1_700_000_000_000 + p as u64,
            sig: String::new(), cert: None, likes: BTreeMap::new(), comments: BTreeMap::new() };
        post.sig = hex::encode(owner.sign(post_msg(&post).as_bytes()).to_bytes());
        for c in 0..comments {
            let k = &others[c as usize];
            let mut cm = Comment { id: format!("c{c}"), post_id: post.id.clone(), author: hx(k), text: "y".repeat(200), timestamp: 1, sig: String::new(), cert: None };
            cm.sig = hex::encode(k.sign(comment_msg(&cm).as_bytes()).to_bytes());
            post.comments.insert(format!("{}:{}", cm.author, cm.id), cm);
        }
        for l in 0..likes {
            let k = &others[l as usize];
            let mut lk = Like { liked: true, ts: 1, sig: String::new(), cert: None };
            lk.sig = hex::encode(k.sign(like_msg(&oh, &post.id, &hx(k), &lk).as_bytes()).to_bytes());
            post.likes.insert(hx(k), lk);
        }
        st.posts.insert(post.id.clone(), post);
    }
    let s = serde_json::to_string(&st).unwrap();
    let n = s.len() as u32;
    unsafe { STATE = Some(s) };
    n
}

/// What validate_state does: params, parse, full re-validation. 1 = valid.
#[no_mangle]
pub extern "C" fn run() -> u32 {
    let s = unsafe { (*std::ptr::addr_of!(STATE)).as_ref().unwrap() };
    let st: FeedState = serde_json::from_str(s).unwrap();
    let mut params = hex::decode(&st.owner).unwrap();
    params.extend_from_slice(b"/v1/contract/web/Ex88TLL48HQPA6CuYQuhc2zKFjcEdUeHbreNBrfVL2Sw/");
    let o = Owner::from_params(&params).unwrap();
    validate(&o, &st) as u32
}
