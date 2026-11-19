// Which built files live outside the app, and in which web container (see src/heavyAssets.ts). Shared by the split
// script, vite's define and the app's URL routing, so the app never asks a container for a file it was not published with.
// Freenet 0.2.161+ refuses a web container that unpacks to over 48 MiB, holds a file over 32 MiB or has over 4096 entries
// ("failed unpacking contract"): the filter's 44 MiB wasm is published gzipped (moderation/filter/ModeratorWeb.gz.bin)
// and the files are spread over three containers.
export const CONTAINERS = ["assets", "filter", "litert"];

/** The container a built file belongs to, or null when it ships with the app. */
export const containerOf = (rel) =>
  /^moderation\/litert\//.test(rel) ? "litert" : /^moderation\/(model|filter)\//.test(rel) ? "filter" : /^(gifs|translate)\//.test(rel) ? "assets" : null;

export const isHeavy = (rel) => containerOf(rel) !== null;

/** What a web container (and the app's) may hold: the node's limits (48 MiB, 32 MiB, 4096) with some room. */
export const LIMITS = { total: 46 * 1048576, file: 30 * 1048576, entries: 4000 };
