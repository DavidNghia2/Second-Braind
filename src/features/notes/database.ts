import Database from "@tauri-apps/plugin-sql";

let dbPromise: ReturnType<typeof Database.load> | null = null;

export function database() {
  dbPromise ??= Database.load("sqlite:second-brain.db");
  return dbPromise;
}

export async function closeDatabase() {
  if (!dbPromise) return;
  const db = await dbPromise;
  await db.close();
  dbPromise = null;
}
