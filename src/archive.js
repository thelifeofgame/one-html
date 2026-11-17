import { hash } from "./security.js";

export async function readVersionHtml(version, env) {
  if (version.builtin_path) {
    const response = await env.ASSETS.fetch(
      new Request(`https://assets.invalid${version.builtin_path}`),
    );
    if (response.ok) return response.text();
  } else {
    const object = await env.HTML_BUCKET.get(version.object_key);
    if (object) return object.text();
  }
  throw Object.assign(new Error("File not found."), { status: 404 });
}
export async function ensureArchive(work, env) {
  if (work.current_version_id) return work;
  const html = await readVersionHtml(work, env);
  const digest = await hash(html);
  const size = new TextEncoder().encode(html).byteLength;
  const versionId = `legacy-${work.id}`;
  const archiveKey = `archive/${work.id}/${digest}.html`;
  await env.HTML_BUCKET.put(archiveKey, html, {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
  });
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO work_versions
      (id,work_id,sha256,content_bytes,object_key,builtin_path,source_url,license,created_by,created_at,status,review_note,reviewed_at,original_filename)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      versionId,
      work.id,
      digest,
      size,
      archiveKey,
      null,
      work.source_url || "",
      work.license || "",
      work.author_id || null,
      work.created_at,
      work.status,
      work.review_note || "",
      work.reviewed_at || null,
      `${work.id}.html`,
    ),
    env.DB.prepare(
      "UPDATE works SET current_version_id=?,sha256=?,content_bytes=? WHERE id=? AND current_version_id IS NULL",
    ).bind(versionId, digest, size, work.id),
  ]);
  return env.DB.prepare("SELECT * FROM works WHERE id=?").bind(work.id).first();
}
export function versionMetadata(data, previous = {}) {
  const clean = (value, max) =>
    typeof value === "string" ? value.trim().slice(0, max) : "";
  const source =
    typeof data.source_url === "string"
      ? clean(data.source_url, 500)
      : previous.source_url || "";
  if (source) {
    try {
      const url = new URL(source);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error();
    } catch {
      throw Object.assign(
        new Error("Source links must be valid http:// or https:// URLs."),
        { status: 400 },
      );
    }
  }
  if (
    data.variant !== undefined &&
    !["original", "adapted"].includes(data.variant)
  )
    throw Object.assign(new Error("Choose original or adapted."), {
      status: 400,
    });
  return {
    source_url: source,
    source_revision: clean(data.source_revision, 120),
    source_note: clean(data.source_note, 600),
    original_filename:
      clean(data.original_filename, 160).replace(/[\\/\r\n]/g, "_") ||
      "pasted.html",
    license:
      typeof data.license === "string"
        ? clean(data.license, 120)
        : previous.license || "",
    variant: data.variant || "original",
    adaptation_note: clean(data.adaptation_note, 600),
  };
}
export function insertVersion(
  db,
  {
    id,
    workId,
    digest,
    size,
    key,
    metadata,
    userId,
    status = "pending",
    baseVersionId = null,
    now = Date.now(),
  },
) {
  return db
    .prepare(
      `INSERT INTO work_versions (id,work_id,sha256,content_bytes,object_key,original_filename,source_url,source_revision,source_note,license,variant,adaptation_note,base_version_id,created_by,created_at,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      id,
      workId,
      digest,
      size,
      key,
      metadata.original_filename,
      metadata.source_url,
      metadata.source_revision,
      metadata.source_note,
      metadata.license,
      metadata.variant,
      metadata.adaptation_note,
      baseVersionId,
      userId,
      now,
      status,
    );
}
