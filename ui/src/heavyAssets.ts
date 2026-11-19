// The image filter (its gzipped wasm, LiteRT runtime and model), the translation engine and the stock GIFs are ~75 MB that
// almost never change. On Freenet they live in extra web containers (radica-assets, radica-filter, radica-litert; see
// scripts/split-freenet-dist.mjs), so a Radica update re-uploads only the app. Elsewhere (dev server, Electron, a build
// without keys) they ship with the app.
import { containerOf } from "../scripts/heavy.mjs";

declare const __RADICA_ASSET_KEYS__: Record<string, string>;

const KEYS: Record<string, string> = typeof __RADICA_ASSET_KEYS__ === "object" ? __RADICA_ASSET_KEYS__ : {};
const GATEWAY_APP = /^(.*\/contract\/web\/)[^/]+\//;

/** URL of a heavy file, given by its path in the app ("moderation/…", "./gifs/…"); other URLs come back unchanged. */
export const heavyUrl = (path: string): string => heavyUrlFor(path, KEYS, typeof location === "undefined" ? "" : location.href);

export function heavyUrlFor(path: string, keys: Record<string, string>, pageUrl: string): string {
  const m = GATEWAY_APP.exec(pageUrl);
  const rel = path.replace(/^\.?\//, "");
  const container = containerOf(rel);
  const key = m && container ? keys[container] : "";
  return key ? `${m![1]}${key}/${rel}` : path;
}
