// Single authoritative registry for page-storage key classification:
// - `sensitive`: MUST never travel in `#auth_state=` or `window.name` (nor be accepted from them).
// - `durable`: backed up to the node delegate package per persona (`durable:<persona>`).
// - `hashSafe`: non-secret UI/cache prefixes allowed to ride in `#auth_state=` inside opaque-origin sandboxes.

export const FORBIDDEN_PROTO_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export interface StorageKeyRule {
  prefix: string;
  sensitive?: boolean;
  durable?: boolean;
  hashSafe?: "soft" | "optional";
}

export const STORAGE_KEY_RULES: readonly StorageKeyRule[] = [
  // Secrets, identity keys & security-critical state (never in window.name or #auth_state=)
  { prefix: "radica_session", sensitive: true },
  { prefix: "spruce_session", sensitive: true },
  { prefix: "radica_ed25519_seed", sensitive: true },
  { prefix: "spruce_ed25519_seed", sensitive: true },
  { prefix: "radica_app_key", sensitive: true },
  { prefix: "spruce_app_key", sensitive: true },
  { prefix: "radica_read_keys", sensitive: true },
  { prefix: "radica_signin_pending", sensitive: true },
  { prefix: "spruce_signin_pending", sensitive: true },
  { prefix: "radica_viso_epriv", sensitive: true },
  { prefix: "radica_viso_url", sensitive: true },
  { prefix: "radica_viso_nokey", sensitive: true },
  { prefix: "river_key_", sensitive: true, durable: true },
  { prefix: "river_join_", sensitive: true, durable: true },
  { prefix: "freenet_room_key_", sensitive: true, durable: true },
  { prefix: "radica_secret_", sensitive: true },
  { prefix: "radica_secret_sessions", sensitive: true, durable: true },
  { prefix: "radica_secret_active_ttl_", sensitive: true, durable: true },
  { prefix: "radica_secret_peers_", sensitive: true, durable: true },
  { prefix: "radica_secret_removed_", sensitive: true, durable: true },
  { prefix: "radica_secret_plain_", sensitive: true, durable: true },
  { prefix: "radica_secret_burned_", sensitive: true, durable: true },
  { prefix: "radica_profile_extras_", sensitive: true, durable: true },
  { prefix: "radica_hidden_users", sensitive: true, durable: true },
  { prefix: "radica_trusted_blocklists", sensitive: true, durable: true },
  { prefix: "radica_poh_", sensitive: true, durable: true },
  { prefix: "radica_ghostkey_", sensitive: true, durable: true },
  { prefix: "radica_delegation_", sensitive: true, durable: true },
  { prefix: "radica_supporter_", sensitive: true },
  { prefix: "radica_supporter_receipt_", sensitive: true, durable: true },
  { prefix: "radica_apps_custom_", sensitive: true, durable: true },

  // Radica Mail sensitive & durable keys (never exposed via window.name or #auth_state=)
  { prefix: "radica_fmail_store_", sensitive: true, durable: true },
  { prefix: "radica_fmail_deleted_", sensitive: true, durable: true },
  { prefix: "radica_fmail_contacts_", sensitive: true, durable: true },
  { prefix: "radica_fmail_aft_assignments_", sensitive: true, durable: true },
  { prefix: "radica_mail_blocked_", sensitive: true, durable: true },

  // River room history kept on this device after the room moved to a native room (plain text: never in window.name)
  { prefix: "radica_river_archive_", sensitive: true },

  // Non-secret durable keys
  { prefix: "radica_pinned_chats_", durable: true, hashSafe: "soft" },
  { prefix: "radica_verified_chats_", durable: true, hashSafe: "soft" },
  { prefix: "radica_mail_alias_", durable: true, hashSafe: "soft" },
  { prefix: "radica_mail_contacts_", durable: true, hashSafe: "soft" }, // Legacy alias kept for compatibility
  { prefix: "radica_mail_welcomed_", durable: true, hashSafe: "soft" },
  { prefix: "radica_contact_cards_", durable: true },
  { prefix: "radica_saved_posts_", durable: true },
  { prefix: "radica_boards_", durable: true },
  { prefix: "radica_welcomed_", durable: true },
  { prefix: "freenet_notifs_dismissed_", durable: true },
  { prefix: "radica_article_drafts_", durable: true },
  { prefix: "radica_theme", durable: true },
  { prefix: "radica_accent", durable: true },
  { prefix: "radica_fullwidth", durable: true },
  { prefix: "radica_text_size", durable: true },
  { prefix: "radica_lang", durable: true },
  { prefix: "radica_walkie_talkie", durable: true },
  { prefix: "radica_apps_pinned_", durable: true },
  { prefix: "radica_dashboard_slots_", durable: true },
  { prefix: "radica_legacy_probed", durable: true },
  { prefix: "radica_dm_history_", durable: true },

  // Hash-safe non-durable UI/cache prefixes
  { prefix: "radica_profile_", hashSafe: "soft" },
  { prefix: "freenet_chat_peers_", hashSafe: "soft" },
  { prefix: "freenet_private_rooms", hashSafe: "soft" },
  { prefix: "freenet_feed_", hashSafe: "optional" },
  { prefix: "freenet_chat_", hashSafe: "optional" },
];

export const SENSITIVE_STORAGE_PREFIXES: readonly string[] = STORAGE_KEY_RULES.filter((r) => r.sensitive).map((r) => r.prefix);
export const DURABLE_PREFIXES: readonly string[] = STORAGE_KEY_RULES.filter((r) => r.durable).map((r) => r.prefix);
export const HASH_SAFE_SOFT_PREFIXES: readonly string[] = STORAGE_KEY_RULES.filter((r) => r.hashSafe === "soft").map((r) => r.prefix);
export const HASH_SAFE_OPTIONAL_PREFIXES: readonly string[] = STORAGE_KEY_RULES.filter((r) => r.hashSafe === "optional").map((r) => r.prefix);

export const isSensitiveStorageKey = (k: string): boolean =>
  FORBIDDEN_PROTO_KEYS.has(k) || SENSITIVE_STORAGE_PREFIXES.some((p) => k.startsWith(p));

export const isDurableStorageKey = (k: string): boolean =>
  DURABLE_PREFIXES.some((p) => k.startsWith(p));

export const isHashSafeStorageKey = (k: string): boolean =>
  !isSensitiveStorageKey(k) &&
  (HASH_SAFE_SOFT_PREFIXES.some((p) => k.startsWith(p)) || HASH_SAFE_OPTIONAL_PREFIXES.some((p) => k.startsWith(p)));
