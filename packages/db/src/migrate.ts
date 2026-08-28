import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDatabase, closeDatabase } from "./client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(
  databaseUrl?: string,
  migrationsFolder?: string,
): Promise<void> {
  const db = getDatabase(databaseUrl);
  const targetFolder =
    migrationsFolder ||
    process.env["MIGRATIONS_FOLDER"] ||
    path.resolve(__dirname, "../migrations");
  await migrate(db, { migrationsFolder: targetFolder });
}

// Allow direct execution via CLI
if (
  process.argv[1] &&
  (process.argv[1].endsWith("migrate.ts") || process.argv[1].endsWith("migrate.js"))
) {
  runMigrations()
    .then(async () => {
      console.log("Migrations applied successfully.");
      await closeDatabase();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("Migration failed:", err);
      await closeDatabase();
      process.exit(1);
    });
}
