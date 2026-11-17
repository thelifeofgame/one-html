import {
  hash,
  passwordHash,
  constantEqual,
  validateHtml,
  demoResponse,
  mainCsp,
  MAX_HTML_BYTES,
} from "./security.js";
import {
  ensureArchive,
  readVersionHtml,
  versionMetadata,
  insertVersion,
} from "./archive.js";
import { issuePlayTicket, readPlayTicket } from "./play-tickets.js";
import {
  googleConfig,
  googleCookie,
  startGoogleLogin,
  finishGoogleLogin,
} from "./google-auth.js";

const DAY = 86400000;
const id = () => crypto.randomUUID();
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const clean = (value, max = 200) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

async function body(request, max = MAX_HTML_BYTES * 6 + 8192) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    fail(415, "JSON is required.");
  if (Number(request.headers.get("content-length")) > max)
    fail(413, "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "Request body is required.");
  const chunks = [];
  let length = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    length += next.value.length;
    if (length > max) {
      await reader.cancel();
      fail(413, "Request is too large.");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || Array.isArray(data) || typeof data !== "object")
      fail(400, "Invalid JSON.");
    return data;
  } catch {
    fail(400, "Invalid JSON.");
  }
}

async function currentUser(request, env) {
  const token = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)onehtml_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) return null;
  return env.DB.prepare(
    `SELECT u.id,u.handle,u.display_name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`,
  )
    .bind(await hash(token), Date.now())
    .first();
}
async function member(request, env, admin = false) {
  const user = await currentUser(request, env);
  if (!user) fail(401, "Please sign in to continue.");
  if (admin && user.role !== "admin")
    fail(403, "Administrator access is required.");
  return user;
}
async function throttle(request, env, name, limit, windowMs, userId) {
  const client = userId || request.headers.get("CF-Connecting-IP") || "local";
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const key = `${name}:${await hash(client)}:${bucket}`;
  const result = await env.DB.prepare(
    `INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count`,
  )
    .bind(key, (bucket + 1) * windowMs)
    .first();
  if (result.count > limit)
    fail(429, "Too many attempts. Please try again later.");
}
async function published(env, workId) {
  const work = await env.DB.prepare(
    "SELECT * FROM works WHERE id=? AND status='published'",
  )
    .bind(workId)
    .first();
  if (!work) fail(404, "This work is not available.");
  return work;
}
function publicWork(work) {
  const { object_key, builtin_path, review_note, ...safe } = work;
  return {
    ...safe,
    original:
      Boolean(builtin_path) ||
      (!work.author_id && work.credit === "OneHTML Lab"),
  };
}

async function submissionLimits(request, env, user) {
  const admin = user.role === "admin";
  await throttle(
    request,
    env,
    "submit-user-hour",
    admin ? 500 : 20,
    3600000,
    user.id,
  );
  await throttle(
    request,
    env,
    "submit-user-day",
    admin ? 5000 : 200,
    DAY,
    user.id,
  );
  await throttle(request, env, "submit-ip-hour", admin ? 1000 : 100, 3600000);
  await throttle(request, env, "submit-ip-day", admin ? 10000 : 500, DAY);
}
async function findWork(env, workId) {
  const work = await env.DB.prepare("SELECT * FROM works WHERE id=?")
    .bind(workId)
    .first();
  if (!work) fail(404, "Work not found.");
  return work;
}
async function selectedVersion(env, work, versionId) {
  const version = await env.DB.prepare(
    "SELECT * FROM work_versions WHERE id=? AND work_id=?",
  )
    .bind(versionId || work.current_version_id, work.id)
    .first();
  if (!version) fail(404, "Version not found.");
  return version;
}
async function submitHtml(request, env, user, data, existing) {
  await submissionLimits(request, env, user);
  const error = validateHtml(data.html);
  if (error) fail(400, error);
  const metadata = versionMetadata(data, existing || {});
  const digest = await hash(data.html);
  const duplicate = await env.DB.prepare(
    "SELECT id FROM work_versions WHERE created_by=? AND sha256=? AND created_at>=? LIMIT 1",
  )
    .bind(user.id, digest, Date.now() - DAY)
    .first();
  if (duplicate)
    fail(409, "You have already submitted this HTML in the last 24 hours.");
  if (
    existing &&
    (await env.DB.prepare(
      "SELECT id FROM work_versions WHERE work_id=? AND sha256=?",
    )
      .bind(existing.id, digest)
      .first())
  )
    fail(409, "This version is already in the archive.");
  const title = existing?.title || clean(data.title, 80);
  const description = existing?.description || clean(data.description, 600);
  if (
    title.length < 2 ||
    description.length < 10 ||
    (!existing && !["game", "visual", "tool"].includes(data.category))
  )
    fail(400, "Please complete the title, description, and category.");
  const workId = existing?.id || id();
  const versionId = id();
  const key = `versions/${workId}/${versionId}.html`;
  const size = new TextEncoder().encode(data.html).byteLength;
  const now = Date.now();
  const claim = await env.DB.prepare(
    `INSERT INTO submission_dedup (user_id,sha256,version_id,created_at) VALUES (?,?,?,?)
    ON CONFLICT(user_id,sha256) DO UPDATE SET version_id=excluded.version_id,created_at=excluded.created_at
    WHERE submission_dedup.created_at<=? OR (submission_dedup.created_at<=? AND NOT EXISTS(SELECT 1 FROM work_versions WHERE id=submission_dedup.version_id))
    RETURNING version_id`,
  )
    .bind(user.id, digest, versionId, now, now - DAY, now - 300000)
    .first();
  if (!claim)
    fail(409, "You have already submitted this HTML in the last 24 hours.");
  const statements = [];
  if (!existing)
    statements.push(
      env.DB.prepare(
        `INSERT INTO works (id,title,description,category,author_id,credit,source_url,license,object_key,created_at,current_version_id,sha256,content_bytes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        workId,
        title,
        description,
        data.category,
        user.id,
        clean(data.credit, 80) || user.display_name,
        metadata.source_url,
        metadata.license,
        key,
        now,
        versionId,
        digest,
        size,
      ),
    );
  statements.push(
    insertVersion(env.DB, {
      id: versionId,
      workId,
      digest,
      size,
      key,
      metadata,
      userId: user.id,
      baseVersionId: existing?.current_version_id || null,
      now,
    }),
  );
  try {
    await env.HTML_BUCKET.put(key, data.html, {
      httpMetadata: { contentType: "text/html; charset=utf-8" },
    });
    await env.DB.batch(statements);
  } catch (error) {
    await env.HTML_BUCKET.delete(key);
    await env.DB.prepare(
      "DELETE FROM submission_dedup WHERE user_id=? AND sha256=? AND version_id=?",
    )
      .bind(user.id, digest, versionId)
      .run();
    if (/UNIQUE constraint failed: work_versions.work_id/i.test(error.message))
      fail(409, "This version is already in the archive.");
    throw error;
  }
  return json({ id: workId, version_id: versionId, status: "pending" }, 201);
}
async function playLink(request, env, work, version, audience) {
  if (!env.SANDBOX_ORIGIN)
    fail(503, "The isolated player is not configured yet.");
  const raw = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)onehtml_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  const issued = await issuePlayTicket(env.PLAY_TOKEN_SECRET, {
    work,
    version,
    audience,
    siteOrigin: new URL(request.url).origin,
    sessionHash: audience === "review" && raw ? await hash(raw) : undefined,
  });
  return json({
    play_url: `${env.SANDBOX_ORIGIN}/play/${issued.ticket}`,
    expires_at: issued.expires_at,
  });
}

async function createSessionCookie(request, env, userId) {
  const token = id().replaceAll("-", "") + id().replaceAll("-", "");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(Date.now()),
    env.DB.prepare("DELETE FROM rate_limits WHERE expires_at<?").bind(
      Date.now(),
    ),
    env.DB.prepare(
      "INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)",
    ).bind(await hash(token), userId, Date.now() + 30 * DAY),
  ]);
  return `onehtml_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}

async function auth(request, env, action) {
  await throttle(request, env, "auth", 25, 15 * 60000);
  const data = await body(request, 5000);
  const handle =
    typeof data.handle === "string" ? data.handle.trim().toLowerCase() : "";
  const password = data.password;
  if (
    !/^[a-z0-9_]{3,24}$/.test(handle) ||
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 128
  )
    fail(
      400,
      "Use a 3–24 character username and a password of 12–128 characters.",
    );
  let user;
  if (action === "register") {
    if (
      await env.DB.prepare("SELECT id FROM users WHERE handle=?")
        .bind(handle)
        .first()
    )
      fail(409, "This username is already taken.");
    const salt = id();
    const userId = id();
    try {
      await env.DB.prepare(
        "INSERT INTO users (id,handle,display_name,password_hash,password_salt,created_at) VALUES (?,?,?,?,?,?)",
      )
        .bind(
          userId,
          handle,
          clean(data.display_name, 40) || handle,
          await passwordHash(password, salt),
          salt,
          Date.now(),
        )
        .run();
    } catch (error) {
      if (/unique/i.test(error.message))
        fail(409, "This username is already taken.");
      throw error;
    }
    user = await env.DB.prepare("SELECT * FROM users WHERE id=?")
      .bind(userId)
      .first();
  } else {
    user = await env.DB.prepare("SELECT * FROM users WHERE handle=?")
      .bind(handle)
      .first();
    const candidate = await passwordHash(
      password,
      user?.password_salt || "onehtml-invalid-account",
    );
    if (
      !user ||
      !user.password_hash ||
      !constantEqual(candidate, user.password_hash)
    )
      fail(401, "Username or password is incorrect.");
  }
  const cookie = await createSessionCookie(request, env, user.id);
  return json(
    {
      user: {
        id: user.id,
        handle: user.handle,
        display_name: user.display_name,
        role: user.role,
      },
    },
    200,
    {
      "Set-Cookie": cookie,
    },
  );
}

async function api(request, env, url) {
  if (!["GET", "POST", "DELETE"].includes(request.method))
    fail(405, "Method not allowed.");
  if (request.method !== "GET" && request.headers.get("origin") !== url.origin)
    fail(403, "This request must come from the website.");
  const path = url.pathname;
  if (path === "/api/me" && request.method === "GET")
    return json({
      user: await currentUser(request, env),
      auth: { google: Boolean(googleConfig(env)) },
    });
  if (path === "/api/auth/google/start" && request.method === "POST") {
    await throttle(request, env, "google-start", 25, 15 * 60000);
    const started = await startGoogleLogin(request, env);
    return json({ authorization_url: started.authorizationUrl }, 200, {
      "Set-Cookie": started.cookie,
    });
  }
  if (path === "/api/auth/google/callback" && request.method === "GET") {
    const config = googleConfig(env);
    if (!config) fail(503, "Google sign-in is not configured yet.");
    const headers = new Headers({
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    });
    headers.append("Set-Cookie", googleCookie(request));
    let target = `${config.origin}/?auth_error=invalid`;
    try {
      await throttle(request, env, "google-callback", 60, 15 * 60000);
      const user = await finishGoogleLogin(request, env);
      headers.append(
        "Set-Cookie",
        await createSessionCookie(request, env, user.id),
      );
      target = `${config.origin}/?auth=google`;
    } catch (error) {
      const code = ["invalid", "expired", "cancelled", "unavailable"].includes(
        error.authCode,
      )
        ? error.authCode
        : "unavailable";
      target = `${config.origin}/?auth_error=${code}`;
    }
    headers.set("Location", target);
    return new Response(null, { status: 303, headers });
  }
  if (/^\/api\/auth\/(register|login)$/.test(path) && request.method === "POST")
    return auth(request, env, path.split("/").pop());
  if (path === "/api/auth/logout" && request.method === "POST") {
    const token = request.headers
      .get("cookie")
      ?.match(/onehtml_session=([a-f0-9]{64})/)?.[1];
    if (token)
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
        .bind(await hash(token))
        .run();
    return json({ ok: true }, 200, {
      "Set-Cookie":
        "onehtml_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    });
  }
  if (path === "/api/works" && request.method === "GET") {
    const user = await currentUser(request, env);
    const rows = await env.DB.prepare(
      `SELECT w.*, (SELECT COUNT(*) FROM votes v WHERE v.work_id=w.id) AS likes,
      (SELECT COUNT(*) FROM comments c WHERE c.work_id=w.id AND c.status='visible') AS comment_count,
      EXISTS(SELECT 1 FROM votes v WHERE v.work_id=w.id AND v.user_id=?) AS liked,
      EXISTS(SELECT 1 FROM favorites f WHERE f.work_id=w.id AND f.user_id=?) AS saved
      FROM works w WHERE w.status='published' ORDER BY likes DESC,w.created_at DESC LIMIT 200`,
    )
      .bind(user?.id || "", user?.id || "")
      .all();
    return json({
      works: rows.results.map((work) => publicWork(work)),
      sandbox_ready: Boolean(env.SANDBOX_ORIGIN),
      sandbox_origin: env.SANDBOX_ORIGIN || null,
    });
  }
  if (path === "/api/submissions" && request.method === "GET") {
    const user = await member(request, env);
    const rows = await env.DB.prepare(
      `SELECT id,title,status,review_note,created_at,
        (SELECT COUNT(*) FROM work_versions v WHERE v.work_id=works.id AND v.status='pending') AS pending_versions
        FROM works WHERE author_id=? ORDER BY created_at DESC LIMIT 100`,
    )
      .bind(user.id)
      .all();
    return json({ works: rows.results });
  }
  if (path === "/api/submissions" && request.method === "POST") {
    const user = await member(request, env);
    const data = await body(request);
    return submitHtml(request, env, user, data);
  }
  const versionsPath = path.match(
    /^\/api\/works\/([a-z0-9-]+)\/versions(?:\/([a-z0-9-]+)\/source)?$/,
  );
  if (versionsPath) {
    let work = await findWork(env, versionsPath[1]);
    const user = await currentUser(request, env);
    const privileged = Boolean(
      user && (user.id === work.author_id || user.role === "admin"),
    );
    if (!privileged && work.status !== "published")
      fail(404, "Work not found.");
    if (request.method === "POST" && !versionsPath[2]) {
      if (!user) fail(401, "Please sign in to continue.");
      if (!privileged)
        fail(
          403,
          "Only the creator or an administrator can submit a new version.",
        );
      work = await ensureArchive(work, env);
      return submitHtml(request, env, user, await body(request), work);
    }
    if (request.method !== "GET") fail(405, "Method not allowed.");
    work = await ensureArchive(work, env);
    if (versionsPath[2]) {
      const version = await selectedVersion(env, work, versionsPath[2]);
      if (!privileged && !["published", "archived"].includes(version.status))
        fail(404, "Version not found.");
      const html = await readVersionHtml(version, env);
      if ((await hash(html)) !== version.sha256)
        fail(409, "The stored file no longer matches its archived version.");
      return json({
        html,
        filename: version.original_filename,
        sha256: version.sha256,
      });
    }
    const rows = await env.DB.prepare(
      `SELECT id,sha256,content_bytes,original_filename,source_url,source_revision,source_note,license,variant,adaptation_note,base_version_id,created_at,status,review_note
      FROM work_versions WHERE work_id=? ${privileged ? "" : "AND status IN ('published','archived')"} ORDER BY created_at DESC,id DESC`,
    )
      .bind(work.id)
      .all();
    return json({
      work_id: work.id,
      title: work.title,
      current_version_id: work.current_version_id,
      can_submit: privileged,
      versions: rows.results.map((version) => {
        const { review_note, ...safe } = version;
        return privileged ? version : safe;
      }),
    });
  }
  const publicPlay = path.match(/^\/api\/works\/([a-z0-9-]+)\/play$/);
  if (publicPlay && request.method === "POST") {
    await throttle(request, env, "play-ticket", 120, 60000);
    const work = await ensureArchive(await published(env, publicPlay[1]), env);
    return playLink(
      request,
      env,
      work,
      await selectedVersion(env, work),
      "public",
    );
  }
  const action = path.match(
    /^\/api\/works\/([a-z0-9-]+)\/(like|save|comments|report)$/,
  );
  if (action) {
    const [, workId, operation] = action;
    await published(env, workId);
    if (operation === "comments" && request.method === "GET") {
      const rows = await env.DB.prepare(
        `SELECT c.id,c.body,c.created_at,u.display_name,u.handle,c.user_id FROM comments c JOIN users u ON u.id=c.user_id WHERE c.work_id=? AND c.status='visible' ORDER BY c.created_at DESC LIMIT 100`,
      )
        .bind(workId)
        .all();
      return json({ comments: rows.results });
    }
    if (request.method !== "POST") fail(405, "Method not allowed.");
    const user = await member(request, env);
    if (operation === "like" || operation === "save") {
      const data = await body(request, 1000);
      if (typeof data.active !== "boolean")
        fail(400, "An explicit active state is required.");
      await throttle(request, env, "interaction", 200, 60000, user.id);
      const table = operation === "like" ? "votes" : "favorites";
      if (data.active)
        await env.DB.prepare(
          `INSERT OR IGNORE INTO ${table} (user_id,work_id,created_at) VALUES (?,?,?)`,
        )
          .bind(user.id, workId, Date.now())
          .run();
      else
        await env.DB.prepare(
          `DELETE FROM ${table} WHERE user_id=? AND work_id=?`,
        )
          .bind(user.id, workId)
          .run();
      const count = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM votes WHERE work_id=?",
      )
        .bind(workId)
        .first();
      return json({ active: data.active, likes: count.count });
    }
    if (operation === "comments") {
      await throttle(request, env, "comment", 30, 3600000, user.id);
      const data = await body(request, 10000);
      const text = clean(data.body, 2000);
      if (!text) fail(400, "Write a comment first.");
      const commentId = id();
      await env.DB.prepare(
        "INSERT INTO comments (id,user_id,work_id,body,created_at) VALUES (?,?,?,?,?)",
      )
        .bind(commentId, user.id, workId, text, Date.now())
        .run();
      return json({ id: commentId }, 201);
    }
    if (operation === "report") {
      await throttle(request, env, "report", 10, DAY, user.id);
      const data = await body(request, 5000);
      const reason = clean(data.reason, 1000);
      if (reason.length < 5) fail(400, "Please describe the issue.");
      await env.DB.prepare(
        "INSERT INTO reports (id,user_id,work_id,reason,created_at) VALUES (?,?,?,?,?)",
      )
        .bind(id(), user.id, workId, reason, Date.now())
        .run();
      return json({ ok: true }, 201);
    }
  }
  const commentPath = path.match(/^\/api\/comments\/([a-z0-9-]+)$/);
  if (commentPath && request.method === "DELETE") {
    const user = await member(request, env);
    const comment = await env.DB.prepare(
      "SELECT user_id FROM comments WHERE id=?",
    )
      .bind(commentPath[1])
      .first();
    if (!comment || (comment.user_id !== user.id && user.role !== "admin"))
      fail(404, "Comment not found.");
    await env.DB.prepare("UPDATE comments SET status='hidden' WHERE id=?")
      .bind(commentPath[1])
      .run();
    return json({ ok: true });
  }
  if (path === "/api/sponsors" && request.method === "POST") {
    const user = await member(request, env);
    await throttle(request, env, "sponsor", 5, DAY, user.id);
    const data = await body(request, 5000);
    const work = await published(env, clean(data.work_id, 80));
    const email = clean(data.email, 254);
    const amount = data.amount_cents;
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !Number.isInteger(amount) ||
      amount < 500 ||
      amount > 1000000
    )
      fail(400, "Enter a valid contact email and an offer of at least $5.");
    if (work.author_id !== user.id && user.role !== "admin")
      fail(403, "You can request promotion for your own published work.");
    await env.DB.prepare(
      "INSERT INTO sponsor_requests (id,user_id,work_id,email,amount_cents,note,created_at) VALUES (?,?,?,?,?,?,?)",
    )
      .bind(
        id(),
        user.id,
        work.id,
        email,
        amount,
        clean(data.note, 1000),
        Date.now(),
      )
      .run();
    return json({ ok: true, payment_collected: false }, 201);
  }
  if (path.startsWith("/api/admin/")) {
    await member(request, env, true);
    if (path === "/api/admin/queue" && request.method === "GET") {
      const results = await env.DB.batch([
        env.DB.prepare(
          `SELECT w.id,w.title,w.description,w.credit,COALESCE(v.license,w.license) AS license,COALESCE(v.source_url,w.source_url) AS source_url,w.status,w.review_note,w.created_at,
            v.id AS review_version_id,v.status AS review_status,v.sha256,v.source_revision,v.variant,v.adaptation_note,
            v.review_note AS version_review_note
            FROM works w LEFT JOIN work_versions v ON v.work_id=w.id AND (v.status='pending' OR (v.id=w.current_version_id AND NOT EXISTS(SELECT 1 FROM work_versions p WHERE p.work_id=w.id AND p.status='pending')))
            ORDER BY CASE WHEN v.status='pending' OR w.status='pending' THEN 0 WHEN w.status='published' THEN 1 ELSE 2 END,w.created_at DESC LIMIT 200`,
        ),
        env.DB.prepare(
          `SELECT r.*,w.title FROM reports r JOIN works w ON w.id=r.work_id WHERE r.status='open' ORDER BY r.created_at DESC LIMIT 100`,
        ),
        env.DB.prepare(
          `SELECT s.*,w.title FROM sponsor_requests s JOIN works w ON w.id=s.work_id ORDER BY s.created_at DESC LIMIT 100`,
        ),
      ]);
      return json({
        works: results[0].results,
        reports: results[1].results,
        sponsors: results[2].results,
      });
    }
    const review = path.match(/^\/api\/admin\/works\/([a-z0-9-]+)$/);
    if (review && request.method === "POST") {
      const data = await body(request, 3000);
      if (!["published", "rejected"].includes(data.status))
        fail(400, "Choose an approval status.");
      const work = await ensureArchive(await findWork(env, review[1]), env);
      const version = await selectedVersion(
        env,
        work,
        clean(data.version_id, 90),
      );
      if (data.status === "published" && !env.SANDBOX_ORIGIN)
        fail(503, "Configure the isolated preview origin before publishing.");
      const html = await readVersionHtml(version, env);
      if (data.status === "published" && (await hash(html)) !== version.sha256)
        fail(409, "The stored file no longer matches its archived version.");
      const now = Date.now(),
        note = clean(data.note, 500);
      const statements = [
        env.DB.prepare(
          "UPDATE work_versions SET status=?,review_note=?,reviewed_at=? WHERE id=?",
        ).bind(data.status, note, now, version.id),
      ];
      if (data.status === "published") {
        statements.push(
          env.DB.prepare(
            "UPDATE work_versions SET status='archived' WHERE work_id=? AND id<>? AND status='published'",
          ).bind(work.id, version.id),
        );
        statements.push(
          env.DB.prepare(
            "UPDATE works SET status='published',current_version_id=?,sha256=?,content_bytes=?,object_key=?,builtin_path=?,source_url=?,license=?,review_note=?,reviewed_at=? WHERE id=?",
          ).bind(
            version.id,
            version.sha256,
            version.content_bytes,
            version.object_key || null,
            version.builtin_path || null,
            version.source_url,
            version.license,
            note,
            now,
            work.id,
          ),
        );
      } else if (work.current_version_id === version.id) {
        statements.push(
          env.DB.prepare(
            "UPDATE works SET status='rejected',review_note=?,reviewed_at=? WHERE id=?",
          ).bind(note, now, work.id),
        );
      }
      await env.DB.batch(statements);
      return json({ ok: true });
    }
    const preview = path.match(/^\/api\/admin\/preview\/([a-z0-9-]+)$/);
    if (preview && request.method === "GET") {
      if (url.searchParams.has("render"))
        fail(403, "Use the isolated player for previews.");
      const work = await ensureArchive(await findWork(env, preview[1]), env);
      const version = await selectedVersion(
        env,
        work,
        url.searchParams.get("version"),
      );
      const html = await readVersionHtml(version, env);
      if ((await hash(html)) !== version.sha256)
        fail(409, "The stored file no longer matches its archived version.");
      return json({ html, version_id: version.id, sha256: version.sha256 });
    }
    const reviewPlay = path.match(/^\/api\/admin\/works\/([a-z0-9-]+)\/play$/);
    if (reviewPlay && request.method === "POST") {
      const data = await body(request, 1000);
      const work = await ensureArchive(await findWork(env, reviewPlay[1]), env);
      return playLink(
        request,
        env,
        work,
        await selectedVersion(env, work, clean(data.version_id, 90)),
        "review",
      );
    }
    const requestAction = path.match(
      /^\/api\/admin\/(reports|sponsors)\/([a-z0-9-]+)$/,
    );
    if (requestAction && request.method === "POST") {
      const data = await body(request, 1000);
      const table =
        requestAction[1] === "reports" ? "reports" : "sponsor_requests";
      const allowed =
        table === "reports" ? ["resolved"] : ["contacted", "declined"];
      if (!allowed.includes(data.status)) fail(400, "Invalid status.");
      await env.DB.prepare(`UPDATE ${table} SET status=? WHERE id=?`)
        .bind(data.status, requestAction[2])
        .run();
      return json({ ok: true });
    }
  }
  fail(404, "Endpoint not found.");
}

function xmlEscape(str) {
  return String(str ?? "").replace(/[<>&"']/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "\"": "&quot;",
    "'": "&apos;",
  })[char]);
}

function htmlEscape(str) {
  return String(str ?? "").replace(/[<>&"']/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char]);
}

async function renderWorkDetail(work, env, siteOrigin) {
  const baseAsset = await env.ASSETS.fetch(new Request(`${siteOrigin}/index.html`));
  const baseHtml = await baseAsset.text();

  const titleText = `${work.title} — OneHTML`;
  const descText = work.description || "Discover little games, playful experiments, and useful tools on OneHTML.";
  const workUrl = `${siteOrigin}/work/${work.id}`;
  const coverUrl = work.cover && work.cover !== "custom"
    ? `${siteOrigin}/covers/${work.cover}.png`
    : `${siteOrigin}/favicon.svg`;

  const schema = {
    "@context": "https://schema.org",
    "@type": work.category === "game" ? "VideoGame" : "WebApplication",
    "name": work.title,
    "description": descText,
    "url": workUrl,
    "applicationCategory": work.category === "game" ? "GameApplication" : "BrowserApplication",
    "operatingSystem": "Any",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "author": {
      "@type": "Person",
      "name": work.credit || "OneHTML Creator"
    }
  };

  const seoTags = [
    `<meta name="description" content="${htmlEscape(descText)}" />`,
    `<link rel="canonical" href="${htmlEscape(workUrl)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${htmlEscape(titleText)}" />`,
    `<meta property="og:description" content="${htmlEscape(descText)}" />`,
    `<meta property="og:url" content="${htmlEscape(workUrl)}" />`,
    `<meta property="og:image" content="${htmlEscape(coverUrl)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${htmlEscape(titleText)}" />`,
    `<meta name="twitter:description" content="${htmlEscape(descText)}" />`,
    `<meta name="twitter:image" content="${htmlEscape(coverUrl)}" />`,
    `<script type="application/ld+json">${JSON.stringify(schema)}<\/script>`,
  ].join("\n    ");

  let modified = baseHtml
    .replace(/<title>[^<]*<\/title>/i, `<title>${htmlEscape(titleText)}<\/title>`)
    .replace(/<meta\s+name=['"]description['"][^>]*\/?>/i, "");

  modified = modified.replace("<head>", `<head>\n    ${seoTags}`);

  const headers = new Headers(baseAsset.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set(
    "Content-Security-Policy",
    mainCsp +
      (env.SANDBOX_ORIGIN
        ? `; frame-src 'self' ${env.SANDBOX_ORIGIN}`
        : "; frame-src 'self'"),
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400");

  return new Response(modified, { status: 200, headers });
}

async function renderSitemap(env, siteOrigin) {
  const works = (
    await env.DB.prepare(
      "SELECT id, created_at FROM works WHERE status='published' ORDER BY created_at DESC",
    ).all()
  ).results || [];

  const urls = [
    `  <url>\n    <loc>${xmlEscape(siteOrigin)}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    ...works.map((w) => {
      const date = new Date(w.created_at).toISOString().split("T")[0];
      return `  <url>\n    <loc>${xmlEscape(siteOrigin)}/work/${xmlEscape(w.id)}</loc>\n    <lastmod>${date}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
    }),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const siteOrigin = env.SITE_ORIGIN || url.origin;

      if (env.DEMO_ONLY === "true") {
        const match = url.pathname.match(/^\/play\/([A-Za-z0-9_.-]+)$/);
        if (!match || request.method !== "GET")
          return new Response("Not found", { status: 404 });
        if (url.search) fail(403, "Play links do not accept query parameters.");
        await throttle(request, env, "play-fetch", 120, 60000);
        const payload = await readPlayTicket(env.PLAY_TOKEN_SECRET, match[1]);
        const work = await findWork(env, payload.wid);
        const version = await selectedVersion(env, work, payload.vid);
        if (version.sha256 !== payload.sha)
          fail(403, "This play link is no longer valid.");
        if (payload.aud === "public") {
          if (
            work.status !== "published" ||
            version.status !== "published" ||
            work.current_version_id !== version.id
          )
            fail(403, "This play link is no longer valid.");
        } else {
          const session = await env.DB.prepare(
            "SELECT s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.role='admin'",
          )
            .bind(payload.sid, Date.now())
            .first();
          if (!session) fail(403, "The review session has ended.");
        }
        const html = await readVersionHtml(version, env);
        if ((await hash(html)) !== payload.sha)
          fail(409, "The stored file no longer matches its archived version.");
        return demoResponse(html, payload.site);
      }

      if (url.pathname.startsWith("/api/")) return await api(request, env, url);
      if (url.pathname.startsWith("/play/"))
        return new Response("Open this work from its isolated player.", {
          status: 403,
        });

      if (url.pathname === "/sitemap.xml" && request.method === "GET") {
        return await renderSitemap(env, siteOrigin);
      }

      const workMatch = url.pathname.match(/^\/work\/([a-z0-9-]+)$/);
      if (workMatch && request.method === "GET") {
        const work = await env.DB.prepare(
          "SELECT * FROM works WHERE id=? AND status='published'",
        )
          .bind(workMatch[1])
          .first();
        if (work) {
          return await renderWorkDetail(work, env, siteOrigin);
        }
      }

      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set(
        "Content-Security-Policy",
        mainCsp +
          (env.SANDBOX_ORIGIN
            ? `; frame-src 'self' ${env.SANDBOX_ORIGIN}`
            : "; frame-src 'self'"),
      );
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      if (!error.status) console.error("Request failed:", error.message);
      return json(
        {
          error: error.status
            ? error.message
            : "Something went wrong. Please try again.",
        },
        error.status || 500,
      );
    }
  },
};
