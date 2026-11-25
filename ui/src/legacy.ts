// Contract generations. A contract's key is BLAKE3(BLAKE3(wasm) || params), so every new contract.wasm or log.wasm
// moves every feed and log to a new, empty key. A contract with nothing under the current code is looked up under
// the earlier code hashes below (newest first), and what is found there is carried forward to the current key.
//
// When you rebuild contract.wasm or log.wasm: move its CURRENT hash to the front of its LEGACY list and put the new
// hash in CURRENT. legacy.test.ts fails until you do. Only list generations whose params have today's format.

export const CURRENT = {
  feed: "e2809fdacbeeccd70a43a9651d6d59b8591a2d35ca0581ef709dd02f17a53367", // v3: length-prefixed signatures, PoW, caps (newest kept, none dated ahead)
  log: "1435c72b0274a050c127e452cb84659516d025c29d2a605053ef1297563e956f", // v2: length-prefixed signatures, PoW, caps
  // images (media-contract/): content-addressed, so a new media.wasm leaves every image at its old key. Rebuild it only
  // when you must, and then list the old hash in LEGACY.media and look images up there too.
  media: "393faa96c8109d08700643c3bc419266dce25a0f380db6e16ce4ee6a125d0762",
};

export const LEGACY: Record<keyof typeof CURRENT, string[]> = {
  feed: ["34c54f5687fa2807470907a05bd72070c03215505f8dcd1e35eb8c169e02343c", "6eed3cbfb9e9931660dc86c13834a1e24c4e14e547cd66cd2eb1f7a59950d5b6", "b1dd80fb71ed06047ded921e00dc4ad330c92cfd6299a1427423c56b5d8bba73"], // last v2 build; 42c394a, first build with the app path in params
  log: ["004279a5303a2bda886df679cef284433b396ceb7e68132049d91b748d5acb6e", "4c17282a893595cb167387b785554e0bd100990d8b2a14a3fea290d65e306437", "690d6439e24f4dbd523f61c343b12a7276fd7466d9da8df741e5e371b12c4e8e"], // last v1 build; before: an author's newer entry did not replace the older under one key; 42c394a
  media: [],
};

/** Logs first written after log contract v2 shipped (b607b0a, 2026-11-20) have nothing under an earlier generation, so
 *  they skip the lookup. Only list a log here if no build before v2 ever wrote it. */
const BORN_AFTER_V2 = ["log:handles"];

export const canHaveLegacy = (id: string): boolean => !BORN_AFTER_V2.includes(id);
