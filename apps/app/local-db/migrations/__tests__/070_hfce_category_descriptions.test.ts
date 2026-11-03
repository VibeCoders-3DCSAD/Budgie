import { DatabaseSync } from "node:sqlite";
import migration from "../070_hfce_category_descriptions";

describe("HFCE category descriptions migration", () => {
  it("updates the twelve standard category descriptions only", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`
      CREATE TABLE categories (id text PRIMARY KEY, slug text, description text);
      INSERT INTO categories (id, slug, description) VALUES
        ('food', 'food', 'old'),
        ('restaurants', 'restaurants_hotels', 'old'),
        ('custom', 'pet_care', 'Kept as the user wrote it');
    `);

    await migration.up({ execAsync: async (sql: string) => { sqlite.exec(sql); } } as never);

    const descriptions = Object.fromEntries(
      (sqlite.prepare("SELECT id, description FROM categories").all() as { id: string; description: string }[])
        .map((row) => [row.id, row.description]),
    );
    expect(descriptions.food).toContain("Rice, bread, meat, fish, seafood");
    expect(descriptions.restaurants).toContain("Restaurant meals, cafes, fast food");
    expect(descriptions.custom).toBe("Kept as the user wrote it");
    sqlite.close();
  });
});
