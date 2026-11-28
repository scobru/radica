/** Pure, DOM-free helpers for read-only guest mode before an identity is created or imported. */

export type FeedScope = "explore" | "following" | "myposts" | "saved" | "media";

/** Whether the app should boot into read-only guest mode (never for standalone Radica Messenger). */
export function shouldStartInGuestMode(hasIdentity: boolean, isMessengerApp: boolean): boolean {
  return !hasIdentity && !isMessengerApp;
}

/** Resolve the effective feed scope for the current session (signed-out guests only see public scopes or a specific author's wall). */
export function resolveFeedScope(scope: FeedScope, signedIn: boolean, hasFeedAuthor?: boolean): FeedScope;
export function resolveFeedScope(scope: string, signedIn: boolean, hasFeedAuthor?: boolean): string;
export function resolveFeedScope(scope: string, signedIn: boolean, hasFeedAuthor = false): string {
  if (signedIn) return scope;
  if (scope === "myposts" && hasFeedAuthor) return "myposts";
  if (scope === "explore" || scope === "media") return scope;
  return "explore";
}

/** Ordered, deduplicated non-empty peer keys for guest Explore discovery (maintainer first, then supporters and GhostKeys). */
export function guestPreferKeys(
  maintainer: string,
  supporters: readonly string[],
  ghostkeys: readonly string[],
): string[] {
  return [...new Set([maintainer, ...supporters, ...ghostkeys].map((k) => k.trim()).filter(Boolean))];
}

/** Signed-in users hide unjoined community posts from the general Explore stream; guests see public community posts. */
export function shouldHideUnjoinedCommunityPost(
  signedIn: boolean,
  hasActiveCommunity: boolean,
  hasCommunity: boolean,
  joined: boolean,
  isAuthor: boolean,
): boolean {
  return signedIn && !hasActiveCommunity && hasCommunity && !joined && !isAuthor;
}
