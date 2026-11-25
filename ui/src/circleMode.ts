// "My circle only" (Settings): Radica fetches the feeds of the people I follow and nobody else's. Explore otherwise also
// pulls up to 40 trusted-of-trusted, supporter and GhostKey feeds plus a lane of strangers, and every feed fetched stays
// subscribed on the node; this mode leaves all of those out, for a lighter node and a quieter phone.

export const CIRCLE_ONLY_KEY = "radica_circle_only";

/** Whose feeds Explore fetches: everyone I follow, then (outside circle-only mode) up to 40 preferred keys and the lane. */
export function explorePeerKeys(following: string[], prefer: string[], lane: () => string[], circleOnly: boolean): string[] {
  if (circleOnly) return [...new Set(following)];
  return [...new Set([...following, ...prefer.slice(0, 40), ...lane()])];
}
