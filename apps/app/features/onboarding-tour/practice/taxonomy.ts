import type { SQLiteDatabase } from "expo-sqlite";

export type Taxonomy = { categories: Record<string, unknown>[]; subcategories: Record<string, unknown>[] };

// The user's own categories, copied into the practice database so the tour shows their real taxonomy.
export async function readTaxonomy(db: Pick<SQLiteDatabase, "getAllAsync">, userId: string): Promise<Taxonomy> {
  const [categories, subcategories] = await Promise.all([
    db.getAllAsync<Record<string, unknown>>("SELECT * FROM categories WHERE user_id = ? AND deleted = 0", userId),
    db.getAllAsync<Record<string, unknown>>("SELECT * FROM subcategories WHERE user_id = ? AND deleted = 0", userId),
  ]);
  return { categories, subcategories };
}

// Looks up a system subcategory by slug; practice data only uses slugs every account has.
export function subcategoryLookup(taxonomy: Taxonomy): (slug: string) => string {
  const ids = new Map(taxonomy.subcategories.map((row) => [String(row.slug), String(row.id)]));
  return (slug) => {
    const id = ids.get(slug);
    if (!id) throw new Error(`Practice data needs the "${slug}" subcategory.`);
    return id;
  };
}
