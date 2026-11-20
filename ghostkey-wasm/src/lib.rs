//! Freenet GhostKey for Radica, compiled to WASM for the browser: what to ask the ghostkeys delegate, how to read its
//! answer, and the check of a GhostKey proof. The proof format and its binding are Viso's (viso-core's `ghostkey`
//! module), so a GhostKey badge made in Viso holds in Radica and the other way round. Verification is ghostkey_lib's
//! own (certificate chain to the Freenet master key, then the Ed25519 signature), never re-implemented in TypeScript.
//!
//! One entry point, JSON in and out (bytes as hex):
//!   {"op":"request","pubkey"}          -> {"payload"}               CBOR GhostkeyRequest::SignWithDefault over the binding
//!   {"op":"reply","payload"}           -> {"bundle"} | {"status"}   a delegate answer: the proof bundle, or what it said
//!   {"op":"verify","bundle","pubkey"}  -> {"fingerprint","info"}    a proof that this GhostKey vouches for `pubkey`
//! Errors come back as {"error"}.

use ed25519_dalek::{Signature, VerifyingKey};
use ghostkey_common::{GhostkeyRequest, GhostkeyResponse};
use ghostkey_lib::armorable::Armorable;
use ghostkey_lib::ghost_key_certificate::GhostkeyCertificateV1;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Same tag as viso-core, so one proof serves both apps.
const BIND_TAG: &[u8] = b"viso-ghostkey-v1:";

fn no_rng(_: &mut [u8]) -> Result<(), getrandom::Error> {
    Err(getrandom::Error::UNSUPPORTED) // checking a proof needs no randomness
}
getrandom::register_custom_getrandom!(no_rng);

/// The stored proof: the delegate's SignResult, as viso-core keeps it.
#[derive(Serialize, Deserialize)]
struct SignedBundle {
    scoped_payload: Vec<u8>,
    signature: Vec<u8>,
    certificate_pem: String,
}

/// The delegate's ScopedPayload; who asked is not checked.
#[derive(Deserialize)]
struct ScopedPayload {
    #[allow(dead_code)]
    requestor: ciborium::value::Value,
    payload: Vec<u8>,
}

fn binding_payload(pk: &[u8; 32]) -> Vec<u8> {
    [BIND_TAG, pk].concat()
}

fn cbor<T: Serialize>(v: &T) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    ciborium::into_writer(v, &mut out).map_err(|e| e.to_string())?;
    Ok(out)
}

fn uncbor<T: serde::de::DeserializeOwned>(b: &[u8]) -> Result<T, String> {
    ciborium::from_reader(b).map_err(|e| e.to_string())
}

fn key32(h: &str) -> Result<[u8; 32], String> {
    hex::decode(h).map_err(|e| e.to_string())?.try_into().map_err(|_| "a key is 32 bytes".to_string())
}

/// `master`: None for the Freenet master key compiled into ghostkey_lib (tests pass their own).
fn verify_with(bundle: &[u8], pk: &[u8; 32], master: &Option<VerifyingKey>) -> Result<(String, String), String> {
    let b: SignedBundle = uncbor(bundle)?;
    let cert = GhostkeyCertificateV1::from_armored_string(&b.certificate_pem).map_err(|e| format!("bad certificate: {e}"))?;
    let info = cert.verify(master).map_err(|e| format!("certificate chain invalid: {e}"))?;
    let sig = Signature::from_slice(&b.signature).map_err(|e| e.to_string())?;
    cert.verifying_key.verify_strict(&b.scoped_payload, &sig).map_err(|_| "bad ghostkey signature".to_string())?;
    let scoped: ScopedPayload = uncbor(&b.scoped_payload)?;
    // ponytail: reject empty/null requestor without coupling to a specific requestor schema
    match &scoped.requestor {
        ciborium::value::Value::Null => return Err("missing requestor in GhostKey proof".into()),
        ciborium::value::Value::Text(s) if s.trim().is_empty() => return Err("empty requestor in GhostKey proof".into()),
        ciborium::value::Value::Bytes(b) if b.is_empty() => return Err("empty requestor in GhostKey proof".into()),
        _ => {}
    }
    if scoped.payload != binding_payload(pk) {
        return Err("this GhostKey proof is for a different identity".into());
    }
    let h = blake3::hash(cert.verifying_key.as_bytes());
    Ok((bs58::encode(&h.as_bytes()[..8]).into_string(), info))
}

fn handle(req: Value) -> Result<Value, String> {
    let s = |k: &str| req.get(k).and_then(Value::as_str).ok_or(format!("missing {k}"));
    match s("op")? {
        "request" => {
            let message = binding_payload(&key32(s("pubkey")?)?);
            Ok(json!({ "payload": hex::encode(cbor(&GhostkeyRequest::SignWithDefault { message })?) }))
        }
        "reply" => match uncbor::<GhostkeyResponse>(&hex::decode(s("payload")?).map_err(|e| e.to_string())?)? {
            GhostkeyResponse::SignResult { scoped_payload, signature, certificate_pem } => {
                Ok(json!({ "bundle": hex::encode(cbor(&SignedBundle { scoped_payload, signature, certificate_pem })?) }))
            }
            other => Ok(json!({ "status": format!("{other:?}") })), // no key, refused, pending prompt…
        },
        "verify" => {
            let bundle = hex::decode(s("bundle")?).map_err(|e| e.to_string())?;
            let (fingerprint, info) = verify_with(&bundle, &key32(s("pubkey")?)?, &None)?;
            Ok(json!({ "fingerprint": fingerprint, "info": info }))
        }
        op => Err(format!("unknown op {op}")),
    }
}

pub fn run(input: &str) -> String {
    match serde_json::from_str::<Value>(input).map_err(|e| e.to_string()).and_then(handle) {
        Ok(v) => v.to_string(),
        Err(e) => json!({ "error": e }).to_string(),
    }
}

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    // ponytail: exact-size boxed slice so dealloc frees exact capacity
    Box::leak(vec![0u8; len].into_boxed_slice()).as_mut_ptr()
}

/// # Safety
/// `ptr` and `len` must come from `alloc` (or be the output of `call`).
#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)));
}

/// # Safety
/// `ptr` must point to `len` bytes of UTF-8 written into a buffer from `alloc`.
#[no_mangle]
pub unsafe extern "C" fn call(ptr: *const u8, len: usize) -> u64 {
    let input = String::from_utf8_lossy(std::slice::from_raw_parts(ptr, len));
    // a boxed slice has capacity == len exactly (shrink_to_fit only promises >=), so `dealloc(p, n)` frees the right layout
    let out = Box::leak(run(&input).into_bytes().into_boxed_slice());
    let (p, n) = (out.as_mut_ptr(), out.len());
    ((p as u64) << 32) | n as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::Signer;
    use ghostkey_lib::notary_certificate::NotaryCertificateV1;

    #[derive(Serialize)]
    struct TestScoped {
        requestor: String,
        payload: Vec<u8>,
    }

    /// A chain under a throwaway master (the Freenet one cannot sign here), as viso-core's own test does.
    fn fixture(payload: Vec<u8>) -> (Vec<u8>, VerifyingKey) {
        let mut rng = rand::rngs::OsRng;
        let (master_sk, master_vk) = ghostkey_lib::util::create_keypair(&mut rng).unwrap();
        let (notary, notary_sk) = NotaryCertificateV1::new(&master_sk, &"donation_amount:20".to_string()).unwrap();
        let (cert, sk) = GhostkeyCertificateV1::new(&notary, &notary_sk);
        let scoped = cbor(&TestScoped { requestor: "app".into(), payload }).unwrap();
        let signature = sk.sign(&scoped).to_bytes().to_vec();
        let bundle = cbor(&SignedBundle { scoped_payload: scoped, signature, certificate_pem: cert.to_armored_string().unwrap() }).unwrap();
        (bundle, master_vk)
    }

    #[test]
    fn a_proof_holds_for_its_identity_only_and_under_the_real_master_only() {
        let pk = [9u8; 32];
        let (bundle, master) = fixture(binding_payload(&pk));
        let (fingerprint, info) = verify_with(&bundle, &pk, &Some(master)).unwrap();
        assert_eq!(info, "donation_amount:20");
        assert!(!fingerprint.is_empty());
        assert!(verify_with(&bundle, &[1u8; 32], &Some(master)).is_err(), "another identity");
        let out: Value = serde_json::from_str(&run(&json!({"op":"verify","bundle":hex::encode(&bundle),"pubkey":hex::encode(pk)}).to_string())).unwrap();
        assert!(out["error"].as_str().unwrap().contains("certificate chain"), "a throwaway master is not Freenet's: {out}");
    }

    #[test]
    fn the_request_asks_the_default_key_to_sign_the_binding() {
        let pk = [3u8; 32];
        let out: Value = serde_json::from_str(&run(&json!({"op":"request","pubkey":hex::encode(pk)}).to_string())).unwrap();
        let req: GhostkeyRequest = uncbor(&hex::decode(out["payload"].as_str().unwrap()).unwrap()).unwrap();
        match req {
            GhostkeyRequest::SignWithDefault { message } => assert_eq!(message, binding_payload(&pk)),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn a_sign_result_becomes_the_bundle_viso_stores() {
        let reply = cbor(&GhostkeyResponse::SignResult { scoped_payload: vec![1], signature: vec![2], certificate_pem: "pem".into() }).unwrap();
        let out: Value = serde_json::from_str(&run(&json!({"op":"reply","payload":hex::encode(reply)}).to_string())).unwrap();
        let b: SignedBundle = uncbor(&hex::decode(out["bundle"].as_str().unwrap()).unwrap()).unwrap();
        assert_eq!((b.scoped_payload, b.signature, b.certificate_pem.as_str()), (vec![1], vec![2], "pem"));
    }

    #[test]
    fn empty_requestor_is_rejected() {
        let mut rng = rand::rngs::OsRng;
        let (master_sk, master_vk) = ghostkey_lib::util::create_keypair(&mut rng).unwrap();
        let (notary, notary_sk) = NotaryCertificateV1::new(&master_sk, &"donation_amount:20".to_string()).unwrap();
        let (cert, sk) = GhostkeyCertificateV1::new(&notary, &notary_sk);
        let pk = [5u8; 32];
        let scoped = cbor(&TestScoped { requestor: "   ".into(), payload: binding_payload(&pk) }).unwrap();
        let signature = sk.sign(&scoped).to_bytes().to_vec();
        let bundle = cbor(&SignedBundle { scoped_payload: scoped, signature, certificate_pem: cert.to_armored_string().unwrap() }).unwrap();
        assert!(verify_with(&bundle, &pk, &Some(master_vk)).unwrap_err().contains("requestor"));
    }
}
