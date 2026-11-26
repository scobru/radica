export const REFRESH_EVERY_MS = 60_000;
/** A contract we are subscribed to is pushed to us when it changes: reread it only as a safety net this often. */
export const LIVE_RECHECK_MS = 10 * 60_000;

/**
 * Whether to fetch a contract again. `liveAge`: ms since the last successful fetch on this connection (null when
 * there was none, or the socket dropped since, which drops the node's subscriptions). `unsent`: I hold changes the
 * network has not taken yet; a fetch is also what retries them.
 */
export function shouldFetch(o: { force: boolean; sinceLast: number; liveAge: number | null; unsent: boolean }): boolean {
  if (o.force) return true;
  if (o.sinceLast < REFRESH_EVERY_MS) return false;
  if (!o.unsent && o.liveAge !== null && o.liveAge < LIVE_RECHECK_MS) return false;
  return true;
}

/** What a change notification carried, as text: the contract's new state, or the delta from the state we hold. */
export type Change = { state?: string; delta?: string };

type Update = { updateDataType?: number; updateData?: { state?: number[]; delta?: number[] } | null };

/** The usable part of a notification's UpdateData; {} when there is none (then fetch the state again). */
export function changeOf(u: Update | null | undefined): Change {
  const text = (b?: number[]) => (b?.length ? new TextDecoder().decode(Uint8Array.from(b)) : undefined);
  // UpdateDataType: 1 StateUpdate, 2 DeltaUpdate, 3 StateAndDeltaUpdate
  switch (u?.updateDataType) {
    case 1:
    case 3:
      return { state: text(u.updateData?.state) };
    case 2:
      return { delta: text(u.updateData?.delta) };
    default:
      return {};
  }
}

/** Read in the foreground queue, never behind Explore feeds and the social logs `connect()` refreshes: what a person is
 *  waiting on. `dm/` is a conversation's own log (every DM and Secret Chat message), `devices/` the keys a DM is sealed to. */
export const isInteractiveContract = (id: string): boolean =>
  id.startsWith("media:") ||
  id.startsWith("mail:") ||
  id.startsWith("log:inbox/") ||
  id.startsWith("log:dm/") ||
  id.startsWith("log:devices/") ||
  id.startsWith("log:room/");
