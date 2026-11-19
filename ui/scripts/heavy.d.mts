export const CONTAINERS: string[];
export function containerOf(rel: string): "assets" | "filter" | "litert" | null;
export function isHeavy(rel: string): boolean;
export const LIMITS: { total: number; file: number; entries: number };
