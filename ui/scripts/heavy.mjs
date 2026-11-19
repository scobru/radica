// Which built files live in radica-assets (see src/heavyAssets.ts): shared by the split script and vite's URL rewrite,
// so the app never asks radica-assets for a file it was not published with.
// Freenet 0.2.161+ refuses a web container that unpacks to more than 48 MiB or holds a file over 32 MiB ("failed unpacking
// contract"), so River's and GhostKey's wasm (~3 MB) ship with the app: radica-assets no longer opens on such a node.
export const HEAVY_WASM = /^assets\/ModeratorWeb-[^/]*\.wasm$/;
export const isHeavy = (rel) => /^(moderation|gifs|translate)\//.test(rel) || HEAVY_WASM.test(rel);
