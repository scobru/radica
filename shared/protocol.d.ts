export declare const RADICA_MAINTAINER: string;
export declare const RADICA_DEFAULT_MODS: readonly string[];
export declare const AI_REPORTERS: readonly string[];
export declare const LOG_POW_BITS: number;

export declare function bytesToHex(bytes: Uint8Array): string;
export declare function leadingZeroBits(bytes: Uint8Array): number;
export declare function lp(tag: string, fields: (string | number | boolean)[]): string;
export declare function logEntryMessage(log: string, app: string, author: string, id: string, ts: number, body: string): string;
export declare function logEntryMessage2(log: string, app: string, author: string, id: string, ts: number, bodyHashHex: string, nonce: number): string;
export declare function profileMessageV3(owner: string, displayName: string, bio: string, avatarUrl: string, encPub: string, updatedAt: number): string;
export declare function profileMessageV4(
  owner: string,
  p: { display_name?: string; bio?: string; avatar_url?: string; enc_pub?: string; updated_at?: number },
): string;
export declare function receiptMessageText(r: {
  donor_pk: string;
  tier: string;
  chain: string;
  tx_hash: string;
  ts: number;
}): string;
export declare function roomJoinProofMessage(roomId: string, pubkeyHex: string): string;
export declare function connectMessage(pk: Uint8Array, base: string, challenge: string, ts: number): Uint8Array;
export declare function anteChallengeBytes(purpose: string, vk: Uint8Array): Uint8Array;
export declare function anteSigningBytes(vk: Uint8Array, purpose: string, nonce: number, ts: number): Uint8Array;
export declare function anteCborEncode(v: unknown): Uint8Array;
