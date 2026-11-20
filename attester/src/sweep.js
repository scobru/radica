// Carries contracts forward after a new contract.wasm / log.wasm (see ui/src/legacy.ts): readers move a feed when they
// open it, this moves the ones nobody opens, before the network stops keeping their old copy.

/** The earlier code hashes of `kind` ("feed" | "log") listed in ui/src/legacy.ts, newest first. */
export function legacyHashes(legacyTs, kind) {
  const list = legacyTs.match(new RegExp(`LEGACY[\\s\\S]*?\\b${kind}:\\s*\\[([^\\]]*)\\]`))?.[1] ?? "";
  return [...list.matchAll(/"([0-9a-f]{64})"/g)].map((m) => m[1]);
}

/**
 * Move up to `limit` of `ids` that are not under the current code yet. `get(id, hash?)` gives the state text, null when
 * there is none, and throws when the lookup failed (then the id is tried again next pass); `put(id, text)` stores it
 * under the current code. `done` (a Set) holds the ids settled for this generation; `tries` (a Map) counts failed
 * lookups, and after `maxTries` an id is settled anyway (the node may time out instead of saying "not found"), so a
 * few dead ids cannot hold up the rest.
 */
export async function sweep({ ids, done, tries = new Map(), maxTries = 3, legacy, get, put, limit }) {
  const r = { moved: 0, checked: 0, failed: 0 };
  for (const id of ids) {
    if (done.has(id)) continue;
    if (r.checked >= limit) break;
    r.checked++;
    try {
      if (!(await get(id))) {
        let old = null;
        for (const h of legacy) if ((old = await get(id, h))) break;
        if (old) {
          await put(id, old);
          r.moved++;
        }
      }
      done.add(id);
    } catch {
      r.failed++; // looked at again next pass, up to maxTries
      const n = (tries.get(id) ?? 0) + 1;
      tries.set(id, n);
      if (n >= maxTries) done.add(id);
    }
  }
  return r;
}
