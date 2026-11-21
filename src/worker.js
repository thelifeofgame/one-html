import { previewRunnerHtml } from "./preview-runner.js";
import { getWorkEnrichedDetails } from "./seo-meta.js";
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
  putStoredHtml,
  deleteStoredHtml,
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

async function recordAndGetVisits(request, env) {
  const now = Date.now();
  const bucket = Math.floor(now / 3600000); // 1-hour resolution
  const isRead = request.method === "GET";
  try {
    if (isRead) {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO visit_counts (id,count,updated_at) VALUES ('total',20001,?) ON CONFLICT(id) DO UPDATE SET count=count+1,updated_at=?",
        ).bind(now, now),
        env.DB.prepare(
          "INSERT INTO daily_visits (bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1",
        ).bind(String(bucket), now + 25 * 3600000),
        env.DB.prepare("DELETE FROM daily_visits WHERE expires_at<?").bind(now),
      ]);
    }
    const [totalRow, dailyRows] = await Promise.all([
      env.DB.prepare("SELECT count FROM visit_counts WHERE id='total'").first(),
      env.DB.prepare("SELECT SUM(count) as last_24h FROM daily_visits WHERE expires_at>?").bind(now).first(),
    ]);
    const total = Math.max(20000, Number(totalRow?.count) || 20000);
    const last24h = Math.max(1, Number(dailyRows?.last_24h) || 1);
    return { total, last_24h: last24h };
  } catch (err) {
    console.error("[recordAndGetVisits error]:", err.message || err);
    return { total: 20000, last_24h: 1 };
  }
}

function publicWork(work) {
  const { object_key, builtin_path, review_note, ...safe } = work;
  const sponsorAmount = Number(work.sponsor_amount_cents) || 0;
  return {
    ...safe,
    sponsor_amount_cents: sponsorAmount,
    sponsored: sponsorAmount > 0,
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
    await putStoredHtml(key, data.html, env);
    await env.DB.batch(statements);
  } catch (error) {
    await deleteStoredHtml(key, env);
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
      console.error("[Google callback caught error]:", error.message || error, "authCode:", error.authCode, error.stack);
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
      EXISTS(SELECT 1 FROM favorites f WHERE f.work_id=w.id AND f.user_id=?) AS saved,
      COALESCE((SELECT MAX(s.amount_cents) FROM sponsor_requests s WHERE s.work_id=w.id AND s.status='contacted'), 0) AS sponsor_amount_cents
      FROM works w WHERE w.status='published' ORDER BY sponsor_amount_cents DESC, likes DESC, w.created_at ASC LIMIT 200`,
    )
      .bind(user?.id || "", user?.id || "")
      .all();
    const visits = await recordAndGetVisits(request, env);
    return json({
      works: rows.results.map((work) => publicWork(work)),
      sandbox_ready: Boolean(env.SANDBOX_ORIGIN),
      sandbox_origin: env.SANDBOX_ORIGIN || null,
      visits,
    });
  }
  if (path === "/api/submissions" && request.method === "GET") {
    const user = await member(request, env);
    const results = await env.DB.batch([
      env.DB.prepare(
        `SELECT id,title,title_zh,description,description_zh,category,credit,cover,status,review_note,created_at,reviewed_at,
          (SELECT COUNT(*) FROM work_versions v WHERE v.work_id=works.id AND v.status='pending') AS pending_versions
          FROM works WHERE author_id=? ORDER BY created_at DESC LIMIT 100`,
      ).bind(user.id),
      env.DB.prepare(
        `SELECT s.id,s.work_id,w.title AS work_title,w.title_zh AS work_title_zh,w.status AS work_status,s.email,s.amount_cents,s.note,s.status,s.created_at
          FROM sponsor_requests s JOIN works w ON w.id=s.work_id
          WHERE s.user_id=? ORDER BY s.created_at DESC LIMIT 100`,
      ).bind(user.id),
    ]);
    return json({ works: results[0].results, sponsors: results[1].results });
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

function resolveCoverUrl(work, siteOrigin) {
  if (!work.cover || work.cover === "custom") {
    return `${siteOrigin}/covers/default-og.png`;
  }
  let cover = String(work.cover).trim();
  if (cover.startsWith("http://") || cover.startsWith("https://")) {
    return cover;
  }
  cover = cover.replace(/^\/+/, "");
  if (cover.startsWith("covers/")) {
    cover = cover.slice("covers/".length);
  }
  if (!/\.[a-zA-Z0-9]+$/.test(cover)) {
    cover = `${cover}.png`;
  }
  return `${siteOrigin}/covers/${cover}`;
}

const CATEGORY_ROUTE_MAP = {
  "/games": "game",
  "/experiments": "visual",
  "/tools": "tool",
};

const CATEGORY_SEO_CONFIG = {
  game: {
    path: "/games",
    label: "Games",
    title: "Single-File HTML5 Games & AI Browser Arcade — OneHTML",
    description:
      "Play instant single-file HTML5 games, retro WebGL 3D FPS, and AI-generated arcade classics directly in your browser. Zero installs, isolated sandbox runtime.",
    heading: "Single-File HTML5 Games & Browser Arcade",
  },
  visual: {
    path: "/experiments",
    label: "Experiments",
    title: "Interactive HTML5 Visual Experiments, WebGL Shaders & 3D Physics — OneHTML",
    description:
      "Explore interactive WebGL fluid simulations, Three.js 3D dioramas, falling-sand physics toys, and generative AI visual experiments in single-file HTML.",
    heading: "Interactive Visual Experiments & Simulations",
  },
  tool: {
    path: "/tools",
    label: "Little tools",
    title: "Zero-Dependency Single-File HTML5 Web Tools & Developer Utilities — OneHTML",
    description:
      "Use lightweight single-file HTML5 web tools, Markdown mindmaps, JSON & Regex workbenches, and CSS studios in an offline-capable zero-trust browser sandbox.",
    heading: "Single-File HTML5 Web Tools & Developer Utilities",
  },
};

function categoryPath(category) {
  return CATEGORY_SEO_CONFIG[category]?.path || "/";
}

function categoryDisplayLabel(category) {
  return CATEGORY_SEO_CONFIG[category]?.label || category || "app";
}

async function renderWorkDetail(work, env, siteOrigin) {
  const baseAsset = await env.ASSETS.fetch(new Request(`${siteOrigin}/index.html`));
  const baseHtml = await baseAsset.text();

  const details = getWorkEnrichedDetails(work);
  const titleText = `${work.title} — OneHTML`;
  const workUrl = `${siteOrigin}/work/${work.id}`;
  const coverUrl = resolveCoverUrl(work, siteOrigin);

  const schema = {
    "@context": "https://schema.org",
    "@type": work.category === "game" ? "VideoGame" : "WebApplication",
    "name": work.title,
    "description": details.metaDescription,
    "url": workUrl,
    "image": coverUrl,
    "keywords": details.tags.join(", "),
    "applicationCategory": work.category === "game" ? "GameApplication" : "BrowserApplication",
    "operatingSystem": "Any",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
    },
    "author": {
      "@type": "Person",
      "name": work.credit || "OneHTML Creator",
    },
  };

  const seoTags = [
    `<meta name="description" content="${htmlEscape(details.metaDescription)}" />`,
    `<link rel="canonical" href="${htmlEscape(workUrl)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${htmlEscape(titleText)}" />`,
    `<meta property="og:description" content="${htmlEscape(details.metaDescription)}" />`,
    `<meta property="og:url" content="${htmlEscape(workUrl)}" />`,
    `<meta property="og:image" content="${htmlEscape(coverUrl)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${htmlEscape(titleText)}" />`,
    `<meta name="twitter:description" content="${htmlEscape(details.metaDescription)}" />`,
    `<meta name="twitter:image" content="${htmlEscape(coverUrl)}" />`,
    `<script type="application/ld+json">${JSON.stringify(schema)}<\/script>`,
  ].join("\n    ");

  let modified = baseHtml
    .replace(/<title>[^<]*<\/title>/i, `<title>${htmlEscape(titleText)}<\/title>`)
    .replace(/<meta\s+name=['"]description['"][^>]*\/?>/i, "");

  modified = modified.replace("<head>", `<head>\n    ${seoTags}`);

  const otherWorks = (
    await env.DB.prepare(
      "SELECT id, title, title_zh, description, description_zh, category, credit, cover FROM works WHERE status='published' AND id != ? ORDER BY CASE WHEN category = ? THEN 0 ELSE 1 END, created_at DESC LIMIT 6",
    )
      .bind(work.id, work.category)
      .all()
  ).results || [];

  const relatedCards = otherWorks
    .map((w) => {
      const wCover = resolveCoverUrl(w, siteOrigin);
      return `<a class="related-work-card" href="${siteOrigin}/work/${htmlEscape(w.id)}" data-work="${htmlEscape(w.id)}">
          <div class="related-work-art"><img src="${htmlEscape(wCover)}" alt="${htmlEscape(w.title)}" loading="lazy" decoding="async"></div>
          <div class="related-work-body">
            <span class="related-work-category">${htmlEscape(categoryDisplayLabel(w.category))}</span>
            <h4 class="related-work-title">${htmlEscape(w.title)}</h4>
            <p class="related-work-desc">${htmlEscape(w.description || "")}</p>
            <span class="related-work-credit">${htmlEscape(w.credit || "OneHTML Creator")}</span>
          </div>
        </a>`;
    })
    .join("\n        ");

  const catPath = categoryPath(work.category);
  const catLabel = categoryDisplayLabel(work.category);

  const showcaseHtml = `
    <section class="work-showcase container" id="work-showcase">
      <div class="work-showcase-header">
        <nav class="work-breadcrumb" aria-label="Breadcrumb">
          <a href="${siteOrigin}/">← All Creations</a> / <a href="${siteOrigin}${catPath}">${htmlEscape(catLabel)}</a>
        </nav>
        <h1 class="work-title">${htmlEscape(work.title)}</h1>
        <div class="work-byline">
          <span>Created by <strong>${htmlEscape(work.credit || "OneHTML Creator")}</strong></span>
          ${work.license ? `<span>· License: <strong>${htmlEscape(work.license)}</strong></span>` : ""}
          ${work.source_url ? `<span>· <a href="${htmlEscape(work.source_url)}" target="_blank" rel="noopener noreferrer">Source Code ↗</a></span>` : ""}
        </div>
      </div>

      <div class="player-stage" id="showcase-player-stage" data-work-id="${htmlEscape(work.id)}">
        <div class="work-art"><img src="${htmlEscape(coverUrl)}" alt="${htmlEscape(work.title)}" loading="lazy" decoding="async"></div>
        <div class="launch-overlay">
          <button class="button button-primary" data-launch="${htmlEscape(work.id)}">
            <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            <span>Play ${htmlEscape(work.title)}</span>
          </button>
          <a class="button button-outline" href="${siteOrigin}/preview?work=${htmlEscape(work.id)}">Open in Preview</a>
          <small>Click to start · Runs inside isolated sandbox</small>
        </div>
      </div>

      <article class="work-static-details">
        <div class="work-details-main">
          <h2>About ${htmlEscape(work.title)}</h2>
          <div class="work-description-full">
            ${details.sentences.map((s) => `<p>${htmlEscape(s)}</p>`).join("\n            ")}
          </div>
          <div class="work-tech-section">
            <h3>Technical Tags</h3>
            <div class="work-tech-tags">
              ${details.tags.map((t) => `<span class="tech-tag">${htmlEscape(t)}</span>`).join("\n              ")}
            </div>
          </div>
        </div>
        <aside class="detail-meta">
          <dl>
            <div>
              <dt>Created by</dt>
              <dd>${htmlEscape(work.credit || "OneHTML Creator")}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>${htmlEscape(work.category || "game")}</dd>
            </div>
            <div>
              <dt>License</dt>
              <dd>${htmlEscape(work.license || "Not specified")}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>${work.source_url ? `<a href="${htmlEscape(work.source_url)}" target="_blank" rel="noopener noreferrer">Visit original source ↗</a>` : "Submitted to OneHTML"}</dd>
            </div>
            <div>
              <dt>Format</dt>
              <dd>Single-File HTML · Browser Native</dd>
            </div>
            <div>
              <dt>Runtime Sandbox</dt>
              <dd>Isolated domain · noindex, nofollow</dd>
            </div>
          </dl>
        </aside>
      </article>
      ${otherWorks.length ? `
      <section class="related-works-section" aria-label="Related Creations">
        <div class="related-works-header">
          <h3>Related Creations</h3>
          <a class="related-works-more" href="${siteOrigin}${catPath}">Explore all ${htmlEscape(catLabel)} →</a>
        </div>
        <div class="related-works-grid">
        ${relatedCards}
        </div>
      </section>` : ""}
    </section>`;

  modified = modified.replace('<section class="hero container" id="hero"></section>', showcaseHtml);

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
  headers.set("Cache-Control", "public, max-age=60, s-maxage=300");

  return new Response(modified, { status: 200, headers });
}


async function renderHome(env, siteOrigin) {
  const baseAsset = await env.ASSETS.fetch(new Request(`${siteOrigin}/index.html`));
  const baseHtml = await baseAsset.text();

  const works = (
    await env.DB.prepare(
      `SELECT w.id, w.title, w.description, w.category, w.credit,
      (SELECT COUNT(*) FROM votes v WHERE v.work_id=w.id) AS likes,
      COALESCE((SELECT MAX(s.amount_cents) FROM sponsor_requests s WHERE s.work_id=w.id AND s.status='contacted'), 0) AS sponsor_amount_cents
      FROM works w WHERE w.status='published'
      ORDER BY sponsor_amount_cents DESC, likes DESC, w.created_at ASC`,
    ).all()
  ).results || [];

  const titleText = "OneHTML - Run, Host & Share Single-File HTML5 & AI Web Apps Online";
  const descText = "Run, host & share single-file HTML5 & AI web apps online. Discover interactive web tools, lightweight games, and creative experiments in an isolated sandbox.";
  const homeUrl = `${siteOrigin}/`;
  const defaultOgImage = `${siteOrigin}/covers/default-og.png`;

  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "OneHTML",
    "url": homeUrl,
    "description": descText,
    "hasPart": works.map((w) => ({
      "@type": w.category === "game" ? "VideoGame" : "WebApplication",
      "name": w.title,
      "url": `${siteOrigin}/work/${w.id}`,
    })),
  };

  const seoTags = [
    `<meta name="description" content="${htmlEscape(descText)}" />`,
    `<link rel="canonical" href="${htmlEscape(homeUrl)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${htmlEscape(titleText)}" />`,
    `<meta property="og:description" content="${htmlEscape(descText)}" />`,
    `<meta property="og:url" content="${htmlEscape(homeUrl)}" />`,
    `<meta property="og:image" content="${htmlEscape(defaultOgImage)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${htmlEscape(titleText)}" />`,
    `<meta name="twitter:description" content="${htmlEscape(descText)}" />`,
    `<meta name="twitter:image" content="${htmlEscape(defaultOgImage)}" />`,
    `<script type="application/ld+json">${JSON.stringify(schema)}<\/script>`,
  ].join("\n    ");

  let modified = baseHtml
    .replace(/<title>[^<]*<\/title>/i, `<title>${htmlEscape(titleText)}<\/title>`)
    .replace(/<meta\s+name=['"]description['"][^>]*\/?>/i, "");

  modified = modified.replace("<head>", `<head>\n    ${seoTags}`);

  const prerenderLinks = works
    .map(
      (w) =>
        `<li><a href="${siteOrigin}/work/${w.id}"><strong>${htmlEscape(w.title)}</strong></a> (${htmlEscape(w.category || "app")}) - ${htmlEscape(w.description || "")}</li>`,
    )
    .join("\n        ");

  const semanticPrerender = `
    <noscript>
      <section class="collection-prerender">
        <h2>Curated HTML Creations</h2>
        <ul>
        ${prerenderLinks}
        </ul>
      </section>
    </noscript>`;

  modified = modified.replace('<main id="main-content">', `<main id="main-content">\n    ${semanticPrerender}`);

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
  headers.set("Cache-Control", "public, max-age=60, s-maxage=300");

  return new Response(modified, { status: 200, headers });
}

async function renderCategoryLanding(category, env, siteOrigin) {
  const config = CATEGORY_SEO_CONFIG[category];
  const baseAsset = await env.ASSETS.fetch(new Request(`${siteOrigin}/index.html`));
  const baseHtml = await baseAsset.text();

  const works = (
    await env.DB.prepare(
      `SELECT w.id, w.title, w.description, w.category, w.credit,
      (SELECT COUNT(*) FROM votes v WHERE v.work_id=w.id) AS likes,
      COALESCE((SELECT MAX(s.amount_cents) FROM sponsor_requests s WHERE s.work_id=w.id AND s.status='contacted'), 0) AS sponsor_amount_cents
      FROM works w WHERE w.status='published' AND w.category=?
      ORDER BY sponsor_amount_cents DESC, likes DESC, w.created_at ASC`,
    )
      .bind(category)
      .all()
  ).results || [];

  const pageUrl = `${siteOrigin}${config.path}`;
  const defaultOgImage = `${siteOrigin}/covers/default-og.png`;

  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": config.title,
    "url": pageUrl,
    "description": config.description,
    "mainEntity": {
      "@type": "ItemList",
      "numberOfItems": works.length,
      "itemListElement": works.map((w, idx) => ({
        "@type": "ListItem",
        "position": idx + 1,
        "name": w.title,
        "url": `${siteOrigin}/work/${w.id}`,
      })),
    },
  };

  const seoTags = [
    `<meta name="description" content="${htmlEscape(config.description)}" />`,
    `<link rel="canonical" href="${htmlEscape(pageUrl)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${htmlEscape(config.title)}" />`,
    `<meta property="og:description" content="${htmlEscape(config.description)}" />`,
    `<meta property="og:url" content="${htmlEscape(pageUrl)}" />`,
    `<meta property="og:image" content="${htmlEscape(defaultOgImage)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${htmlEscape(config.title)}" />`,
    `<meta name="twitter:description" content="${htmlEscape(config.description)}" />`,
    `<meta name="twitter:image" content="${htmlEscape(defaultOgImage)}" />`,
    `<script type="application/ld+json">${JSON.stringify(schema)}<\/script>`,
  ].join("\n    ");

  let modified = baseHtml
    .replace(/<title>[^<]*<\/title>/i, `<title>${htmlEscape(config.title)}<\/title>`)
    .replace(/<meta\s+name=['"]description['"][^>]*\/?>/i, "");

  modified = modified.replace("<head>", `<head>\n    ${seoTags}`);

  const prerenderLinks = works
    .map(
      (w) =>
        `<li><a href="${siteOrigin}/work/${htmlEscape(w.id)}"><strong>${htmlEscape(w.title)}</strong></a> by ${htmlEscape(w.credit || "OneHTML Creator")} — ${htmlEscape(w.description || "")}</li>`,
    )
    .join("\n        ");

  const categoryPrerender = `
    <section class="category-seo-intro container" id="category-seo-intro">
      <h1>${htmlEscape(config.heading)}</h1>
      <p>${htmlEscape(config.description)}</p>
      <ul class="category-seo-list">
        ${prerenderLinks}
      </ul>
    </section>`;

  modified = modified.replace('<main id="main-content">', `<main id="main-content">\n    ${categoryPrerender}`);

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
  headers.set("Cache-Control", "public, max-age=60, s-maxage=300");

  return new Response(modified, { status: 200, headers });
}

async function renderLlmsTxt(env, siteOrigin) {
  const works = (
    await env.DB.prepare(
      "SELECT id, title, description, category, credit FROM works WHERE status='published' ORDER BY CASE category WHEN 'game' THEN 0 WHEN 'visual' THEN 1 ELSE 2 END, created_at ASC",
    ).all()
  ).results || [];

  const games = works.filter((w) => w.category === "game");
  const experiments = works.filter((w) => w.category === "visual");
  const tools = works.filter((w) => w.category === "tool");

  const formatWorkLine = (w) =>
    `- [${w.title}](${siteOrigin}/work/${w.id}): ${w.description || "Single-file HTML5 creation"} (by ${w.credit || "OneHTML Creator"})`;

  const lines = [
    "# OneHTML",
    "",
    "> OneHTML is an online platform and zero-trust dual-domain sandbox for running, hosting, and sharing single-file HTML5 games, interactive visual experiments, web tools, and AI-generated web artifacts (Claude Artifacts, GPT web apps).",
    "",
    "## Core Entrances",
    "",
    `- [OneHTML Home](${siteOrigin}/): Discover all curated single-file HTML5 creations and community submissions.`,
    `- [Online HTML Preview & AI Artifact Sandbox Runner](${siteOrigin}/preview): Paste, edit, and run single-file HTML5 and AI artifacts in an isolated sandbox.`,
    `- [Single-File HTML5 Games](${siteOrigin}/games): Instant browser arcade games, 3D WebGL FPS, and retro classics.`,
    `- [Interactive Visual Experiments](${siteOrigin}/experiments): WebGL fluid shaders, Three.js 3D scenes, physics simulations, and generative art.`,
    `- [Single-File HTML5 Web Tools](${siteOrigin}/tools): Zero-dependency developer utilities, Markdown mindmaps, JSON/Regex labs, and CSS studios.`,
    "",
    "## Curated Games (`/games`)",
    "",
    ...games.map(formatWorkLine),
    "",
    "## Interactive Experiments (`/experiments`)",
    "",
    ...experiments.map(formatWorkLine),
    "",
    "## Web Tools & Utilities (`/tools`)",
    "",
    ...tools.map(formatWorkLine),
    "",
  ];

  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function renderPreview(env, siteOrigin) {
  const baseAsset = await env.ASSETS.fetch(new Request(`${siteOrigin}/index.html`));
  const baseHtml = await baseAsset.text();

  const titleText = "Online HTML Preview & AI Artifact Sandbox Runner — OneHTML";
  const descText =
    "Paste and run single-file HTML5, Claude Artifacts, and GPT web demos online in OneHTML's isolated dual-domain sandbox runner. Zero setup, strict CSP, instant live preview.";
  const previewUrl = `${siteOrigin}/preview`;
  const defaultOgImage = `${siteOrigin}/covers/default-og.png`;

  const schema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "OneHTML Live HTML Preview Workbench",
    "url": previewUrl,
    "description": descText,
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "Any",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
    },
  };

  const seoTags = [
    `<meta name="description" content="${htmlEscape(descText)}" />`,
    `<link rel="canonical" href="${htmlEscape(previewUrl)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${htmlEscape(titleText)}" />`,
    `<meta property="og:description" content="${htmlEscape(descText)}" />`,
    `<meta property="og:url" content="${htmlEscape(previewUrl)}" />`,
    `<meta property="og:image" content="${htmlEscape(defaultOgImage)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${htmlEscape(titleText)}" />`,
    `<meta name="twitter:description" content="${htmlEscape(descText)}" />`,
    `<meta name="twitter:image" content="${htmlEscape(defaultOgImage)}" />`,
    `<script type="application/ld+json">${JSON.stringify(schema)}<\/script>`,
  ].join("\n    ");

  let modified = baseHtml
    .replace(/<title>[^<]*<\/title>/i, `<title>${htmlEscape(titleText)}<\/title>`)
    .replace(/<meta\s+name=['"]description['"][^>]*\/?>/i, "");

  modified = modified.replace("<head>", `<head>\n    ${seoTags}`);

  const previewNoscript = `
    <noscript>
      <section class="collection-prerender">
        <h1>OneHTML Online HTML5 &amp; AI Artifact Preview Sandbox</h1>
        <p>Run single-file HTML5 apps, Claude Artifacts, and GPT web demos directly in a zero-trust dual-domain browser sandbox with strict CSP isolation.</p>
        <p><a href="${siteOrigin}/">Browse all single-file HTML creations on OneHTML</a></p>
      </section>
    </noscript>`;

  modified = modified.replace('<main id="main-content">', `<main id="main-content">\n    ${previewNoscript}`);

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
  headers.set("Cache-Control", "public, max-age=60, s-maxage=300");

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
    `  <url>\n    <loc>${xmlEscape(siteOrigin)}/preview</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>`,
    `  <url>\n    <loc>${xmlEscape(siteOrigin)}/games</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>`,
    `  <url>\n    <loc>${xmlEscape(siteOrigin)}/experiments</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>`,
    `  <url>\n    <loc>${xmlEscape(siteOrigin)}/tools</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>`,
    ...works.map((w) => {
      let date;
      try {
        date = new Date(w.created_at || Date.now()).toISOString().split("T")[0];
      } catch {
        date = new Date().toISOString().split("T")[0];
      }
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
      const isSandboxRequest =
        env.DEMO_ONLY === "true" ||
        Boolean(env.SANDBOX_ORIGIN && url.origin === env.SANDBOX_ORIGIN);

      if (isSandboxRequest) {
        if (url.pathname === "/preview" && ["GET", "HEAD"].includes(request.method)) {
          const allowedAncestors = [
            env.SITE_ORIGIN,
            "https://onehtmlapp.com",
            "https://www.onehtmlapp.com",
            "https://onehtml.onehtml.workers.dev",
            "http://127.0.0.1:4391",
            "http://localhost:4391",
            "http://43.161.242.122:4391",
          ].filter(Boolean);
          const frameAncestorsOrigin = Array.from(new Set(allowedAncestors)).join(" ");
          return demoResponse(previewRunnerHtml(env.SITE_ORIGIN || siteOrigin), frameAncestorsOrigin);
        }
        if (url.pathname === "/robots.txt" && ["GET", "HEAD"].includes(request.method)) {
          return new Response("User-agent: *\nDisallow: /\n", {
            status: 200,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
              "Cache-Control": "public, max-age=86400",
            },
          });
        }
        const match = url.pathname.match(/^\/play\/([A-Za-z0-9_.-]+)$/);
        if (!match || request.method !== "GET")
          return new Response("Not found", {
            status: 404,
            headers: {
              "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
            },
          });
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
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
          },
        });

      if (url.pathname === "/robots.txt" && ["GET", "HEAD"].includes(request.method)) {
        const robots = [
          "User-agent: *",
          "Allow: /",
          "Disallow: /api/",
          "Disallow: /play/",
          "",
          `Sitemap: ${siteOrigin}/sitemap.xml`,
        ].join("\n");
        return new Response(robots + "\n", {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=86400",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }

      if (url.pathname === "/llms.txt" && ["GET", "HEAD"].includes(request.method)) {
        return await renderLlmsTxt(env, siteOrigin);
      }

      if (url.pathname === "/sitemap.xml" && ["GET", "HEAD"].includes(request.method)) {
        return await renderSitemap(env, siteOrigin);
      }

      if ((url.pathname === "/" || url.pathname === "/index.html") && ["GET", "HEAD"].includes(request.method)) {
        return await renderHome(env, siteOrigin);
      }

      const mappedCategory = CATEGORY_ROUTE_MAP[url.pathname];
      if (mappedCategory && ["GET", "HEAD"].includes(request.method)) {
        return await renderCategoryLanding(mappedCategory, env, siteOrigin);
      }

      if (url.pathname === "/preview" && ["GET", "HEAD"].includes(request.method)) {
        return await renderPreview(env, siteOrigin);
      }

      const workMatch = url.pathname.match(/^\/work\/([a-z0-9-]+)$/);
      if (workMatch && ["GET", "HEAD"].includes(request.method)) {
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
      const extraHeaders = env.DEMO_ONLY === "true"
        ? { "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet" }
        : {};
      return json(
        {
          error: error.status
            ? error.message
            : "Something went wrong. Please try again.",
        },
        error.status || 500,
        extraHeaders,
      );
    }
  },
};
