// A feed card is redrawn only when what it shows changed. Its signature is one list, built and compared from one
// place, so the stored and the checked values cannot drift apart (they did: some fields were compared at the wrong
// index, so a changed badge could keep an old card and an unchanged one was redrawn).

/** Whether `stored` still matches: the cheap parts first, the costly ones (comment text, mentions) only if needed. */
export function cardSigMatches(stored: readonly unknown[] | undefined, cheap: readonly unknown[], costly: readonly (() => unknown)[]): boolean {
  if (!stored || stored.length !== cheap.length + costly.length) return false;
  for (let i = 0; i < cheap.length; i++) if (stored[i] !== cheap[i]) return false;
  return costly.every((part, j) => stored[cheap.length + j] === part());
}

/** The signature to store with a freshly drawn card. */
export const cardSig = (cheap: readonly unknown[], costly: readonly (() => unknown)[]): unknown[] => [...cheap, ...costly.map((part) => part())];
