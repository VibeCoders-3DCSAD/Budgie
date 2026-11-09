import { addMonths } from "../../../../lib/dates";
import type { PracticeSeed } from "../seed";
import type { Taxonomy } from "../taxonomy";

// What the fixtures read: the seed that is in the practice database, plus the user's taxonomy.
export type PracticeData = { today: string; seed: PracticeSeed; taxonomy: Taxonomy };

export function planPeriod(today: string): { start: string; end: string } {
  const start = `${today.slice(0, 7)}-01`;
  const next = addMonths(start, 1);
  const end = new Date(Date.UTC(Number(next.slice(0, 4)), Number(next.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

// The parent category slug of each subcategory id.
export function categorySlugBySubcategory(taxonomy: Taxonomy): Map<string, string> {
  const slugs = new Map(taxonomy.categories.map((row) => [String(row.id), String(row.slug)]));
  return new Map(taxonomy.subcategories.flatMap((row) => {
    const slug = slugs.get(String(row.category_id));
    return slug ? [[String(row.id), slug] as const] : [];
  }));
}

// Average monthly expense per subcategory over the completed months on record.
export function monthlySpendBySubcategory(data: PracticeData): Map<string, number> {
  const current = data.today.slice(0, 7);
  const months = new Set<string>();
  const totals = new Map<string, number>();
  for (const row of data.seed.transactions) {
    const month = String(row.transaction_date).slice(0, 7);
    if (row.transaction_type !== "expense" || !row.subcategory_id || month >= current) continue;
    months.add(month);
    const id = String(row.subcategory_id);
    totals.set(id, (totals.get(id) ?? 0) + Number(row.amount_centavos));
  }
  const count = Math.max(1, months.size);
  return new Map([...totals].map(([id, total]) => [id, Math.round(total / count)]));
}
