import type { LogEntry } from "../ui/src/logfold.ts";
import type { PrivateRoom } from "../ui/src/types.ts";

export interface FoldRoomOptions {
  maintainerPk?: string;
  aiReporters?: readonly string[];
  gardenerPk?: string;
}

export declare function orderedEntries<T extends { ts?: number; author?: string; id?: string }>(
  entries: T[] | Record<string, T> | null | undefined,
): T[];

export declare function foldRoom(
  entries: LogEntry[] | Record<string, LogEntry> | null | undefined,
  roomId: string,
  opts?: FoldRoomOptions,
): PrivateRoom | null;

export declare function roomJoinProofs(
  entries: LogEntry[] | Record<string, LogEntry> | null | undefined,
  roomId: string,
  opts?: Pick<FoldRoomOptions, "maintainerPk" | "aiReporters">,
): { creatorListed: Set<string>; joinProofs: Map<string, string> };

export declare function foldPostEdits(
  entries: LogEntry[] | Record<string, LogEntry> | null | undefined,
  max?: number,
): Map<string, { caption: string; ts: number }>;

export declare function foldBlocklist(
  entries: LogEntry[] | Record<string, LogEntry> | null | undefined,
  curator: string,
  type?: "block" | "mod",
  initial?: Iterable<string>,
  opts?: { requireHexTarget?: boolean },
): Set<string>;
