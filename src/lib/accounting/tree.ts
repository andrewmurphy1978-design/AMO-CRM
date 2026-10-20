// The nesting of the chart of accounts below a card: income and expenses go three levels deep (group > account >
// sub-account), assets and liabilities one (their balance-sheet section is the level above).

interface Node {
  id: string;
  parentId: string | null;
}

export const maxDepth = (type: string) => (type === "INCOME" || type === "EXPENSE" ? 2 : 1);

export function depthOf<T extends Node>(id: string, byId: Map<string, T>): number {
  let n = 0;
  let cur = byId.get(id);
  while (cur?.parentId && n < 6) {
    n++;
    cur = byId.get(cur.parentId);
  }
  return n;
}

export function heightOf<T extends Node>(id: string, kids: Map<string, T[]>): number {
  let h = 0;
  for (const k of kids.get(id) ?? []) h = Math.max(h, 1 + heightOf(k.id, kids));
  return h;
}

export function childrenMap<T extends Node>(list: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const a of list) if (a.parentId) m.set(a.parentId, [...(m.get(a.parentId) ?? []), a]);
  return m;
}

/** The accounts of `list` in tree order (a parent, then its children...), each with its depth. */
export function flatten<T extends Node & { code: string }>(list: T[], roots: T[]): { o: T; depth: number }[] {
  const kids = childrenMap(list);
  const out: { o: T; depth: number }[] = [];
  const walk = (o: T, depth: number) => {
    out.push({ o, depth });
    for (const c of (kids.get(o.id) ?? []).sort((a, b) => a.code.localeCompare(b.code))) walk(c, depth + 1);
  };
  for (const r of [...roots].sort((a, b) => a.code.localeCompare(b.code))) walk(r, 0);
  return out;
}

/** Where `acc` could be moved to: same type (and section), not itself or below itself, within the depth limit. */
export function parentChoices<T extends Node & { type: string; section?: string | null; bank?: boolean }>(acc: T, list: T[]): T[] {
  const byId = new Map(list.map((a) => [a.id, a]));
  const kids = childrenMap(list);
  const height = heightOf(acc.id, kids);
  const below = new Set<string>();
  const mark = (id: string) => {
    for (const k of kids.get(id) ?? []) {
      below.add(k.id);
      mark(k.id);
    }
  };
  mark(acc.id);
  return list.filter(
    (p) =>
      p.id !== acc.id &&
      !p.bank &&
      p.type === acc.type &&
      !below.has(p.id) &&
      (acc.type === "ASSET" || acc.type === "LIABILITY" ? p.section === acc.section : true) &&
      depthOf(p.id, byId) + 1 + height <= maxDepth(acc.type)
  );
}
