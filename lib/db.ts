import { db } from "./supabase";

// Supabase returns at most 1000 rows per request. This pages through a whole table
// so a library of several thousand records is never silently cut short.
export async function selectAll<T = any>(
  table: string,
  columns: string,
  opts: { order?: string; ascending?: boolean; eq?: [string, string] } = {}
): Promise<{ data: T[]; error: string | null }> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    let q = db().from(table).select(columns);
    if (opts.eq) q = q.eq(opts.eq[0], opts.eq[1]);
    q = q.order(opts.order || "created_at", { ascending: opts.ascending !== false }).range(from, from + size - 1);
    const { data, error } = await q;
    if (error) return { data: out, error: error.message };
    const rows = (data || []) as T[];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return { data: out, error: null };
}
