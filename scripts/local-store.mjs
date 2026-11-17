import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, writeFile, unlink, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { seed } from "../src/seed.js";

export async function openStore(directory) {
  await mkdir(directory, { recursive: true });
  const sqlite = new DatabaseSync(join(directory, "onehtml.sqlite"));
  sqlite.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)",
  );
  const migrations = new URL("../migrations/", import.meta.url);
  for (const name of (await readdir(migrations))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    if (
      sqlite.prepare("SELECT name FROM local_migrations WHERE name=?").get(name)
    )
      continue;
    sqlite.exec("BEGIN");
    try {
      sqlite.exec(await readFile(new URL(name, migrations), "utf8"));
      sqlite
        .prepare("INSERT INTO local_migrations (name) VALUES (?)")
        .run(name);
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      sqlite.close();
      throw error;
    }
  }
  function statement(sql, parameters = []) {
    return {
      bind: (...values) => statement(sql, values),
      first: async () => sqlite.prepare(sql).get(...parameters) || null,
      all: async () => ({ results: sqlite.prepare(sql).all(...parameters) }),
      run: async () => ({ meta: sqlite.prepare(sql).run(...parameters) }),
      sql,
      parameters,
    };
  }
  const DB = {
    prepare: statement,
    batch: async (statements) => {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((item) => {
          const prepared = sqlite.prepare(item.sql);
          if (/^\s*SELECT\b/i.test(item.sql))
            return { results: prepared.all(...item.parameters) };
          return { meta: prepared.run(...item.parameters) };
        });
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const objects = join(directory, "objects");
  await mkdir(objects, { recursive: true });
  function objectPath(key) {
    const path = resolve(objects, key);
    if (!path.startsWith(resolve(objects) + "/"))
      throw new Error("Invalid object key");
    return path;
  }
  const HTML_BUCKET = {
    put: async (key, value) => {
      const path = objectPath(key);
      await mkdir(resolve(path, ".."), { recursive: true });
      await writeFile(path, value);
    },
    get: async (key) => {
      try {
        const data = await readFile(objectPath(key), "utf8");
        return { text: async () => data };
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    delete: async (key) => {
      await unlink(objectPath(key)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    },
  };
  await seed(DB);
  return { DB, HTML_BUCKET, sqlite, close: () => sqlite.close() };
}
