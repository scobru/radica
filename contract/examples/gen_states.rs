//! Writes params.bin, state1.json and state2.json (two valid, signed states) for `fdev verify-merge`.
use ed25519_dalek::{Signer, SigningKey};
use radica_contract::{following_msg, profile_msg, FeedState, ProfileInfo};
use std::collections::BTreeSet;
use std::fs;

fn state(sk: &SigningKey, name: &str, ts: u64, follows: &[&str]) -> FeedState {
    let owner = hex::encode(sk.verifying_key().as_bytes());
    let mut p = ProfileInfo { display_name: name.into(), bio: "Decentralized on Freenet".into(), avatar_url: String::new(), enc_pub: String::new(), updated_at: ts, sig: String::new(), cert: None, v: None };
    p.sig = hex::encode(sk.sign(profile_msg(&owner, &p).as_bytes()).to_bytes());
    let following: BTreeSet<String> = follows.iter().map(|f| f.repeat(64)).collect();
    let following_sig = hex::encode(sk.sign(following_msg(&owner, ts, &following).as_bytes()).to_bytes());
    FeedState { owner, profile: Some(p), following, following_updated_at: ts, following_sig, ..Default::default() }
}

fn main() {
    let sk = SigningKey::from_bytes(&[42u8; 32]);
    fs::write("params.bin", sk.verifying_key().as_bytes()).expect("write params.bin"); // no app path: no delegated signatures here
    fs::write("state1.json", serde_json::to_vec(&state(&sk, "Alice", 1000, &["b"])).unwrap()).expect("write state1.json");
    fs::write("state2.json", serde_json::to_vec(&state(&sk, "Alice Wonderland", 2000, &["b", "c"])).unwrap()).expect("write state2.json");
    println!("Generated state1.json and state2.json");
}
