import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hash, validateHtml } from "../src/security.js";
import { insertVersion, versionMetadata } from "../src/archive.js";
import { openStore } from "./local-store.mjs";

const root = resolve(import.meta.dirname, "..");
export async function importCollection(
  store,
  { directory = resolve(root, "collections"), replaceDemos = false } = {},
) {
  const catalog = JSON.parse(
    await readFile(resolve(directory, "catalog.json"), "utf8"),
  );
  const prepared = [];
  for (const work of catalog) {
    if (
      !/^[a-z0-9-]+$/.test(work.id) ||
      !["game", "visual", "tool"].includes(work.category) ||
      !work.versions?.length
    )
      throw new Error("Invalid collection entry.");
    const existing = await store.DB.prepare(
      "SELECT author_id,credit FROM works WHERE id=?",
    )
      .bind(work.id)
      .first();
    if (existing && (existing.author_id || existing.credit !== work.credit))
      throw new Error(`Collection ID belongs to another creator: ${work.id}`);
    const versions = [];
    for (const item of work.versions) {
      if (!/^[a-z0-9.-]+\.html$/.test(item.file))
        throw new Error("Invalid archive filename.");
      const html = await readFile(
        resolve(directory, "sources", item.file),
        "utf8",
      );
      const error = validateHtml(html);
      if (error) throw new Error(`${item.file}: ${error}`);
      const digest = await hash(html);
      if (digest !== item.sha256)
        throw new Error(`Archive checksum mismatch: ${item.file}`);
      versions.push({
        html,
        digest,
        id: `collection-${work.id}-${digest.slice(0, 16)}`,
        key: `collection/${work.id}/${digest}.html`,
        size: new TextEncoder().encode(html).byteLength,
        metadata: versionMetadata({
          ...work,
          ...item,
          original_filename: item.file,
        }),
      });
    }
    prepared.push({ work, versions });
  }
  const statements = [];
  const now = Date.now();
  for (const [index, { work, versions }] of prepared.entries()) {
    const current = versions.at(-1);
    statements.push(
      store.DB.prepare(
        `INSERT OR IGNORE INTO works
      (id,title,title_zh,description,description_zh,category,credit,license,status,object_key,cover,source_url,created_at)
      VALUES (?,?,?,?,?,?,?,'','published',?,?,?,?)`,
      ).bind(
        work.id,
        work.title,
        work.title_zh,
        work.description,
        work.description_zh,
        work.category,
        work.credit,
        current.key,
        `/covers/${work.id}.png`,
        work.source_url,
        now - index * 1000,
      ),
    );
    for (const [offset, version] of versions.entries()) {
      await store.HTML_BUCKET.put(version.key, version.html, {
        httpMetadata: { contentType: "text/html; charset=utf-8" },
      });
      const statement = insertVersion(store.DB, {
        ...version,
        workId: work.id,
        userId: null,
        now: now - index * 1000 + offset,
        status: version === current ? "published" : "archived",
        baseVersionId: versions[offset - 1]?.id || null,
      });
      statements.push(
        store.DB.prepare(
          statement.sql.replace("INSERT INTO", "INSERT OR IGNORE INTO"),
        ).bind(...statement.parameters),
      );
    }
    statements.push(
      store.DB.prepare(
        "UPDATE work_versions SET status=CASE WHEN id=? THEN 'published' ELSE 'archived' END WHERE work_id=? AND status IN ('published','archived')",
      ).bind(current.id, work.id),
    );
    statements.push(
      store.DB.prepare(
        `UPDATE works SET title=?,title_zh=?,description=?,description_zh=?,category=?,cover=?,source_url=?,license=?,status='published',
      object_key=?,builtin_path=NULL,current_version_id=?,sha256=?,content_bytes=? WHERE id=? AND author_id IS NULL`,
      ).bind(
        work.title,
        work.title_zh,
        work.description,
        work.description_zh,
        work.category,
        `/covers/${work.id}.png`,
        work.source_url,
        current.metadata.license,
        current.key,
        current.id,
        current.digest,
        current.size,
        work.id,
      ),
    );
  }
  if (replaceDemos)
    statements.push(
      store.DB
        .prepare(`UPDATE works SET status='rejected',review_note='Retired from the public collection; original archive preserved.'
    WHERE author_id IS NULL AND credit='OneHTML Lab' AND (current_version_id IS NULL OR current_version_id='legacy-'||id)
    AND builtin_path='/demos/'||id||'.html'
    AND id IN ('tiny-sail','midnight-drive','orbital','bloom','little-piano','focus-island')`),
    );
  await store.DB.batch(statements);
  return {
    works: prepared.length,
    versions: prepared.reduce((n, item) => n + item.versions.length, 0),
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const store = await openStore(process.env.DATA_DIR || resolve(root, ".data"));
  try {
    console.log(
      await importCollection(store, {
        replaceDemos: process.argv.includes("--replace-demos"),
      }),
    );
  } finally {
    store.close();
  }
}
