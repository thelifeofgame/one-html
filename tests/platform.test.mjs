import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import worker from "../src/worker.js";
import { openStore } from "../scripts/local-store.mjs";
import { issuePlayTicket, PLAY_TTL_MS } from "../src/play-tickets.js";
import { importCollection } from "../scripts/import-collection.mjs";

const origin = "https://onehtml.test";
const validHtml =
  '<!doctype html><html><body><h1>My little world</h1><script>document.body.dataset.ready="yes"</script></body></html>';
async function approve(f, user, workId, versionId) {
  await f.store.DB.prepare("UPDATE users SET role='admin' WHERE id=?")
    .bind(user.id)
    .run();
  const response = await f.request(`/api/admin/works/${workId}`, {
    method: "POST",
    cookie: user.cookie,
    body: { status: "published", version_id: versionId },
  });
  assert.equal(response.status, 200);
}
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "onehtml-test-"));
  const store = await openStore(directory);
  t.after(async () => {
    store.close();
    await rm(directory, { recursive: true, force: true });
  });
  const env = {
    ...store,
    SITE_ORIGIN: origin,
    SANDBOX_ORIGIN: "https://play.onehtml.test",
    PLAY_TOKEN_SECRET: "test-only-play-signing-key-for-local-tests",
    ASSETS: {
      fetch: async (request) => {
        try {
          return new Response(
            await readFile(
              new URL(
                `../public${new URL(request.url).pathname === "/" ? "/index.html" : new URL(request.url).pathname}`,
                import.meta.url,
              ),
            ),
          );
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  };
  async function request(
    path,
    {
      method = "GET",
      body,
      cookie,
      requestOrigin = origin,
      sandbox = false,
    } = {},
  ) {
    return worker.fetch(
      new Request(`${sandbox ? env.SANDBOX_ORIGIN : origin}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(requestOrigin !== null ? { Origin: requestOrigin } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      { ...env, DEMO_ONLY: sandbox ? "true" : "false" },
    );
  }
  async function account(handle = "test_author") {
    const response = await request("/api/auth/register", {
      method: "POST",
      body: {
        handle,
        password: "a-long-test-password-2026",
        display_name: "Test creator",
      },
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    return {
      ...result.user,
      cookie: response.headers.get("set-cookie").split(";")[0],
    };
  }
  async function submit(user, overrides = {}) {
    const response = await request("/api/submissions", {
      method: "POST",
      cookie: user.cookie,
      body: {
        title: "Test world",
        description: "A complete self-contained HTML experiment.",
        category: "visual",
        license: "MIT",
        rights_confirmed: true,
        html: validHtml,
        ...overrides,
      },
    });
    return response;
  }
  async function play(workId, { cookie, review = false, version_id } = {}) {
    const response = await request(
      review ? `/api/admin/works/${workId}/play` : `/api/works/${workId}/play`,
      { method: "POST", cookie, body: review ? { version_id } : undefined },
    );
    if (response.status !== 200) return response;
    const link = await response.json();
    return request(new URL(link.play_url).pathname, { sandbox: true });
  }
  return { directory, store, env, request, account, submit, play };
}

test("curated imports publish real archives, preserve versions, and retain member activity on repeat", async (t) => {
  const f = await fixture(t);
  const user = await f.account();
  const submitted = await (await f.submit(user)).json();
  await approve(f, user, submitted.id, submitted.version_id);
  const result = await importCollection(f.store, { replaceDemos: true });
  assert.deepEqual(result, { works: 12, versions: 20 });
  let catalog = await (await f.request("/api/works")).json();
  assert.equal(catalog.works.length, 13);
  assert.ok(catalog.works.some((work) => work.id === submitted.id));
  assert.ok(!catalog.works.some((work) => work.id === "tiny-sail"));
  assert.equal(
    catalog.works.find((work) => work.id === "saltline").original,
    false,
  );
  await f.request("/api/works/saltline/like", {
    method: "POST",
    cookie: user.cookie,
    body: { active: true },
  });
  await importCollection(f.store, { replaceDemos: true });
  catalog = await (await f.request("/api/works")).json();
  assert.equal(catalog.works.find((work) => work.id === "saltline").likes, 1);
  const versions = (
    await f.store.DB.prepare(
      "SELECT * FROM work_versions WHERE work_id='saltline'",
    ).all()
  ).results;
  assert.equal(versions.length, 3);
  assert.equal(
    versions.filter((version) => version.status === "published").length,
    1,
  );
  assert.match(await (await f.play("saltline")).text(), /几猫3A/);
  assert.match(
    await (await f.play("london-railway")).text(),
    /London Dream Railway/,
  );
});

test("curated imports reject altered source files before publishing any entries", async (t) => {
  const f = await fixture(t);
  const directory = join(f.directory, "bad-collection");
  await mkdir(join(directory, "sources"), { recursive: true });
  await writeFile(join(directory, "sources", "bad.html"), validHtml);
  await writeFile(
    join(directory, "catalog.json"),
    JSON.stringify([
      {
        id: "bad-archive",
        title: "Bad archive",
        category: "game",
        credit: "Source QA",
        versions: [{ file: "bad.html", sha256: "0".repeat(64) }],
      },
    ]),
  );
  await assert.rejects(
    importCollection(f.store, { directory }),
    /checksum mismatch/,
  );
  assert.equal(
    await f.store.DB.prepare(
      "SELECT id FROM works WHERE id='bad-archive'",
    ).first(),
    null,
  );
});

test("collection accepts optional license and provenance without a rights gate", async (t) => {
  const f = await fixture(t),
    user = await f.account();
  const response = await f.submit(user, {
    license: undefined,
    rights_confirmed: false,
    source_url: "http://example.test/game.html",
    source_revision: "revision-a",
    original_filename: "game.html",
    credit: "Original creator",
  });
  assert.equal(response.status, 201);
  const { id, version_id } = await response.json();
  const work = await f.store.DB.prepare("SELECT * FROM works WHERE id=?")
    .bind(id)
    .first();
  assert.equal(work.license, "");
  assert.equal(work.credit, "Original creator");
  assert.equal(work.current_version_id, version_id);
  const version = await f.store.DB.prepare(
    "SELECT * FROM work_versions WHERE id=?",
  )
    .bind(version_id)
    .first();
  assert.equal(version.source_revision, "revision-a");
  assert.equal(version.original_filename, "game.html");
  assert.equal(version.sha256.length, 64);
});
test("duplicate concurrent uploads produce one work and one immutable version", async (t) => {
  const f = await fixture(t),
    user = await f.account();
  const responses = await Promise.all([f.submit(user), f.submit(user)]);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [201, 409],
  );
  assert.equal(
    (
      await f.store.DB.prepare(
        "SELECT COUNT(*) AS n FROM works WHERE author_id=?",
      )
        .bind(user.id)
        .first()
    ).n,
    1,
  );
  assert.equal(
    (
      await f.store.DB.prepare(
        "SELECT COUNT(*) AS n FROM work_versions WHERE created_by=?",
      )
        .bind(user.id)
        .first()
    ).n,
    1,
  );
});
test("failed storage writes release the duplicate reservation so collection can be retried", async (t) => {
  const f = await fixture(t),
    user = await f.account();
  const original = f.env.HTML_BUCKET.put;
  f.env.HTML_BUCKET.put = async () => {
    throw Object.assign(new Error("Storage temporarily unavailable."), {
      status: 503,
    });
  };
  assert.equal((await f.submit(user)).status, 503);
  assert.equal(
    (
      await f.store.DB.prepare(
        "SELECT COUNT(*) AS n FROM submission_dedup",
      ).first()
    ).n,
    0,
  );
  f.env.HTML_BUCKET.put = original;
  assert.equal((await f.submit(user)).status, 201);
});
test("pending updates preserve the live version and approval invalidates links to the previous version", async (t) => {
  const f = await fixture(t),
    user = await f.account();
  const first = await (
    await f.submit(user, {
      source_url: "https://example.test/original",
      source_revision: "one",
    })
  ).json();
  await approve(f, user, first.id, first.version_id);
  const oldLink = await (
    await f.request(`/api/works/${first.id}/play`, { method: "POST" })
  ).json();
  const updated = validHtml.replace("My little world", "My updated world");
  const response = await f.request(`/api/works/${first.id}/versions`, {
    method: "POST",
    cookie: user.cookie,
    body: {
      html: updated,
      variant: "adapted",
      adaptation_note: "Updated the title.",
      source_revision: "two",
    },
  });
  assert.equal(response.status, 201);
  const next = await response.json();
  assert.equal(
    (await f.request(new URL(oldLink.play_url).pathname, { sandbox: true }))
      .status,
    200,
  );
  const publicHistory = await (
    await f.request(`/api/works/${first.id}/versions`)
  ).json();
  assert.equal(publicHistory.versions.length, 1);
  assert.equal(
    (
      await f.request(
        `/api/works/${first.id}/versions/${next.version_id}/source`,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await f.request(
        `/api/works/${first.id}/versions/${next.version_id}/source`,
        { cookie: user.cookie },
      )
    ).status,
    200,
  );
  const queue = await (
    await f.request("/api/admin/queue", { cookie: user.cookie })
  ).json();
  assert.ok(
    queue.works.some(
      (work) =>
        work.review_version_id === next.version_id &&
        work.review_status === "pending",
    ),
  );
  await f.request(`/api/admin/works/${first.id}`, {
    method: "POST",
    cookie: user.cookie,
    body: {
      status: "rejected",
      version_id: next.version_id,
      note: "Needs another look.",
    },
  });
  assert.equal(
    (await f.request(new URL(oldLink.play_url).pathname, { sandbox: true }))
      .status,
    200,
  );
  await approve(f, user, first.id, next.version_id);
  assert.equal(
    (await f.request(new URL(oldLink.play_url).pathname, { sandbox: true }))
      .status,
    403,
  );
  assert.equal(await (await f.play(first.id)).text(), updated);
  const original = await (
    await f.request(
      `/api/works/${first.id}/versions/${first.version_id}/source`,
    )
  ).json();
  assert.equal(original.html, validHtml);
  const history = await (
    await f.request(`/api/works/${first.id}/versions`)
  ).json();
  assert.equal(history.versions.length, 2);
  assert.ok(
    history.versions.some(
      (version) =>
        version.id === first.version_id && version.status === "archived",
    ),
  );
  assert.ok(
    history.versions.every((version) => version.review_note === undefined),
  );
});
test("play tickets reject modification and expiry and review links are revoked at logout", async (t) => {
  const f = await fixture(t),
    user = await f.account();
  const workData = await (await f.submit(user)).json();
  await approve(f, user, workData.id, workData.version_id);
  const link = await (
    await f.request(`/api/admin/works/${workData.id}/play`, {
      method: "POST",
      cookie: user.cookie,
      body: {},
    })
  ).json();
  const path = new URL(link.play_url).pathname;
  assert.equal((await f.request(path, { sandbox: true })).status, 200);
  const last = path.at(-1) === "a" ? "b" : "a";
  assert.equal(
    (await f.request(path.slice(0, -1) + last, { sandbox: true })).status,
    403,
  );
  const work = await f.store.DB.prepare("SELECT * FROM works WHERE id=?")
    .bind(workData.id)
    .first();
  const version = await f.store.DB.prepare(
    "SELECT * FROM work_versions WHERE id=?",
  )
    .bind(workData.version_id)
    .first();
  const expired = await issuePlayTicket(
    f.env.PLAY_TOKEN_SECRET,
    { work, version, audience: "public", siteOrigin: origin },
    Date.now() - PLAY_TTL_MS - 100,
  );
  assert.equal(
    (await f.request("/play/" + expired.ticket, { sandbox: true })).status,
    403,
  );
  await f.request("/api/auth/logout", {
    method: "POST",
    cookie: user.cookie,
    body: {},
  });
  assert.equal((await f.request(path, { sandbox: true })).status, 403);
});
test("an archived content hash is verified before serving or approving files", async (t) => {
  const f = await fixture(t),
    user = await f.account();
  const data = await (await f.submit(user)).json();
  await approve(f, user, data.id, data.version_id);
  const version = await f.store.DB.prepare(
    "SELECT * FROM work_versions WHERE id=?",
  )
    .bind(data.version_id)
    .first();
  await f.env.HTML_BUCKET.put(
    version.object_key,
    "<html>Modified outside the archive</html>",
  );
  assert.equal((await f.play(data.id)).status, 409);
  assert.equal(
    (
      await f.request(
        `/api/works/${data.id}/versions/${data.version_id}/source`,
      )
    ).status,
    409,
  );
});
test("new versions cannot be submitted by another member and source details stay escaped", async (t) => {
  const f = await fixture(t),
    user = await f.account(),
    other = await f.account("other_author");
  const data = await (
    await f.submit(user, { source_note: "<script>metadata only</script>" })
  ).json();
  await approve(f, user, data.id, data.version_id);
  assert.equal(
    (
      await f.request(`/api/works/${data.id}/versions`, {
        method: "POST",
        cookie: other.cookie,
        body: { html: validHtml + "<!--change-->" },
      })
    ).status,
    403,
  );
  const history = await (
    await f.request(`/api/works/${data.id}/versions`)
  ).json();
  assert.equal(
    history.versions[0].source_note,
    "<script>metadata only</script>",
  );
});
test("submission limits cover per-user hourly and per-IP budgets", async (t) => {
  const f = await fixture(t),
    user = await f.account();
  for (let index = 0; index < 20; index++)
    assert.equal(
      (await f.submit(user, { html: validHtml + `<!--${index}-->` })).status,
      201,
    );
  assert.equal(
    (await f.submit(user, { html: validHtml + "<!--hour-limit-->" })).status,
    429,
  );
  const { hash } = await import("../src/security.js");
  const now = Date.now(),
    key = `submit-ip-hour:${await hash("local")}:${Math.floor(now / 3600000)}`;
  await f.store.DB.prepare("UPDATE rate_limits SET count=100 WHERE key=?")
    .bind(key)
    .run();
  const other = await f.account("another_author");
  assert.equal(
    (await f.submit(other, { html: validHtml + "<!--ip-limit-->" })).status,
    429,
  );
});
test("built-in examples are copied into immutable archives before play", async (t) => {
  const f = await fixture(t);
  const expected = await (
    await f.env.ASSETS.fetch(
      new Request("https://assets.test/demos/tiny-sail.html"),
    )
  ).text();
  assert.equal((await f.play("tiny-sail")).status, 200);
  f.env.ASSETS.fetch = async () =>
    new Response("<html>New deployment contents</html>");
  assert.equal(await (await f.play("tiny-sail")).text(), expected);
});
test("migrating an existing SQLite database preserves users and uploaded files", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "onehtml-legacy-"));
  let store;
  t.after(async () => {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  });
  const sqlite = new DatabaseSync(join(directory, "onehtml.sqlite"));
  sqlite.exec(
    await readFile(
      new URL("../migrations/0001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  sqlite
    .prepare(
      "INSERT INTO users (id,handle,display_name,password_hash,password_salt,created_at) VALUES (?,?,?,?,?,?)",
    )
    .run("existing-user", "existing", "Existing", "hash", "salt", Date.now());
  sqlite
    .prepare(
      "INSERT INTO works (id,title,description,category,credit,license,status,object_key,created_at,author_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      "existing-work",
      "Existing work",
      "Existing uploaded content",
      "tool",
      "Existing",
      "",
      "published",
      "submissions/existing.html",
      Date.now(),
      "existing-user",
    );
  sqlite.close();
  await mkdir(join(directory, "objects/submissions"), { recursive: true });
  await writeFile(
    join(directory, "objects/submissions/existing.html"),
    validHtml,
  );
  store = await openStore(directory);
  const { ensureArchive } = await import("../src/archive.js");
  const work = await ensureArchive(
    await store.DB.prepare("SELECT * FROM works WHERE id=?")
      .bind("existing-work")
      .first(),
    store,
  );
  assert.ok(work.current_version_id);
  assert.equal(
    (
      await store.DB.prepare("SELECT handle FROM users WHERE id=?")
        .bind("existing-user")
        .first()
    ).handle,
    "existing",
  );
  assert.equal(
    await (await store.HTML_BUCKET.get("submissions/existing.html")).text(),
    validHtml,
  );
  store.close();
  store = await openStore(directory);
  assert.equal(
    (
      await store.DB.prepare(
        "SELECT COUNT(*) AS n FROM work_versions WHERE work_id=?",
      )
        .bind("existing-work")
        .first()
    ).n,
    1,
  );
});

test("baseline fixtures contain six examples and no invented engagement", async (t) => {
  const f = await fixture(t);
  const result = await (await f.request("/api/works")).json();
  assert.equal(result.works.length, 6);
  for (const work of result.works) {
    assert.equal(work.likes, 0);
    assert.equal(work.comment_count, 0);
    assert.equal(work.original, true);
    assert.equal(work.object_key, undefined);
    assert.equal(work.builtin_path, undefined);
    assert.equal(work.play_url, undefined);
  }
});
test("registration hashes passwords, does not accept roles, and sets secure session cookies", async (t) => {
  const f = await fixture(t);
  const response = await f.request("/api/auth/register", {
    method: "POST",
    body: {
      handle: "owner",
      display_name: "Owner",
      password: "a-long-test-password-2026",
      role: "admin",
    },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  assert.match(response.headers.get("set-cookie"), /Secure/);
  const { user } = await response.json();
  assert.equal(user.role, "member");
  assert.equal(user.password_hash, undefined);
  const stored = await f.store.DB.prepare("SELECT * FROM users WHERE id=?")
    .bind(user.id)
    .first();
  assert.notEqual(stored.password_hash, "a-long-test-password-2026");
  assert.equal(stored.password_hash.length, 64);
});
test("login rejects wrong passwords and logout invalidates the server session", async (t) => {
  const f = await fixture(t);
  const user = await f.account();
  assert.equal(
    (
      await f.request("/api/auth/login", {
        method: "POST",
        body: { handle: user.handle, password: "incorrect-password-2026" },
      })
    ).status,
    401,
  );
  const login = await f.request("/api/auth/login", {
    method: "POST",
    body: { handle: user.handle, password: "a-long-test-password-2026" },
  });
  assert.equal(login.status, 200);
  assert.equal(
    (await (await f.request("/api/me", { cookie: user.cookie })).json()).user
      .id,
    user.id,
  );
  assert.equal(
    (
      await f.request("/api/auth/logout", {
        method: "POST",
        cookie: user.cookie,
        body: {},
      })
    ).status,
    200,
  );
  assert.equal(
    (await (await f.request("/api/me", { cookie: user.cookie })).json()).user,
    null,
  );
});
test("mutations reject cross-site and opaque-origin requests", async (t) => {
  const f = await fixture(t);
  const user = await f.account();
  for (const requestOrigin of ["https://evil.test", "null", null])
    assert.equal(
      (
        await f.request("/api/works/tiny-sail/like", {
          method: "POST",
          cookie: user.cookie,
          requestOrigin,
          body: { active: true },
        })
      ).status,
      403,
    );
  assert.equal(
    (
      await f.request("/api/works/tiny-sail/like", {
        method: "POST",
        body: { active: true },
      })
    ).status,
    401,
  );
});
test("likes are idempotent per account and favorites persist in SQLite", async (t) => {
  const f = await fixture(t);
  const user = await f.account();
  for (let i = 0; i < 3; i++)
    assert.equal(
      (
        await f.request("/api/works/tiny-sail/like", {
          method: "POST",
          cookie: user.cookie,
          body: { active: true },
        })
      ).status,
      200,
    );
  await f.request("/api/works/tiny-sail/save", {
    method: "POST",
    cookie: user.cookie,
    body: { active: true },
  });
  let catalog = await (
    await f.request("/api/works", { cookie: user.cookie })
  ).json();
  let sail = catalog.works.find((work) => work.id === "tiny-sail");
  assert.equal(sail.likes, 1);
  assert.equal(sail.saved, 1);
  const reopened = await openStore(f.directory);
  t.after(() => reopened.close());
  assert.equal(
    (
      await reopened.DB.prepare(
        "SELECT COUNT(*) AS count FROM favorites WHERE user_id=?",
      )
        .bind(user.id)
        .first()
    ).count,
    1,
  );
  await f.request("/api/works/tiny-sail/like", {
    method: "POST",
    cookie: user.cookie,
    body: { active: false },
  });
  catalog = await (
    await f.request("/api/works", { cookie: user.cookie })
  ).json();
  assert.equal(catalog.works.find((work) => work.id === "tiny-sail").likes, 0);
});
test("HTML submissions stay private until an administrator approves them", async (t) => {
  const f = await fixture(t);
  const user = await f.account();
  const submission = await f.submit(user);
  assert.equal(submission.status, 201);
  const { id } = await submission.json();
  assert.equal((await f.request(`/play/${id}`, { sandbox: true })).status, 403);
  assert.equal((await (await f.request("/api/works")).json()).works.length, 6);
  assert.equal(
    (await f.request("/api/admin/queue", { cookie: user.cookie })).status,
    403,
  );
  assert.equal(
    (
      await f.request(`/api/admin/works/${id}`, {
        method: "POST",
        cookie: user.cookie,
        body: { status: "published" },
      })
    ).status,
    403,
  );
  await f.store.DB.prepare("UPDATE users SET role='admin' WHERE id=?")
    .bind(user.id)
    .run();
  assert.equal(
    (
      await f.request(`/api/admin/works/${id}`, {
        method: "POST",
        cookie: user.cookie,
        body: { status: "published", note: "Looks good." },
      })
    ).status,
    200,
  );
  const linkResponse = await f.request(`/api/works/${id}/play`, {
    method: "POST",
  });
  const link = await linkResponse.json();
  const content = await f.request(new URL(link.play_url).pathname, {
    sandbox: true,
  });
  const publicCatalog = await (await f.request("/api/works")).json();
  assert.equal(
    publicCatalog.works.find((work) => work.id === id).review_note,
    undefined,
  );
  assert.equal(content.status, 200);
  assert.equal(await content.text(), validHtml);
  assert.match(
    content.headers.get("content-security-policy"),
    /sandbox allow-scripts/,
  );
  assert.match(
    content.headers.get("content-security-policy"),
    /connect-src 'none'/,
  );
  assert.doesNotMatch(
    content.headers.get("content-security-policy"),
    /allow-same-origin/,
  );
  assert.equal((await f.request(`/play/${id}`)).status, 403);
  await f.request(`/api/admin/works/${id}`, {
    method: "POST",
    cookie: user.cookie,
    body: { status: "rejected" },
  });
  assert.equal(
    (await f.request(new URL(link.play_url).pathname, { sandbox: true }))
      .status,
    403,
  );
});
test("submission validation enforces HTML size, metadata, and category", async (t) => {
  const f = await fixture(t);
  const user = await f.account();
  for (const overrides of [
    { html: "plain text" },
    { html: "<html>" + "x".repeat(2 * 1024 * 1024) },
    { category: "unknown" },
    { source_url: "javascript:alert(1)" },
    { variant: "unknown" },
  ])
    assert.equal((await f.submit(user, overrides)).status, 400);
});
test("HTML upload size is checked before JSON escaping and source links must be valid", async (t) => {
  const f = await fixture(t);
  const user = await f.account();
  const quoteHeavy = "<html><body>" + '"'.repeat(1200000) + "</body></html>";
  assert.equal((await f.submit(user, { html: quoteHeavy })).status, 201);
  for (const source_url of ["https://", "https://user:secret@example.test/"]) {
    assert.equal((await f.submit(user, { source_url })).status, 400);
  }
});
test("comments are stored as text and only their author or an admin can remove them", async (t) => {
  const f = await fixture(t);
  const user = await f.account();
  const other = await f.account("other_user");
  const body = "<img src=x onerror=alert(1)> A real comment";
  const created = await f.request("/api/works/tiny-sail/comments", {
    method: "POST",
    cookie: user.cookie,
    body: { body },
  });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  assert.equal(
    (await (await f.request("/api/works/tiny-sail/comments")).json())
      .comments[0].body,
    body,
  );
  assert.equal(
    (
      await f.request(`/api/comments/${id}`, {
        method: "DELETE",
        cookie: other.cookie,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await f.request(`/api/comments/${id}`, {
        method: "DELETE",
        cookie: user.cookie,
      })
    ).status,
    200,
  );
  assert.equal(
    (await (await f.request("/api/works/tiny-sail/comments")).json()).comments
      .length,
    0,
  );
});
test("sponsorship requests require ownership, save the offer, and never collect payment", async (t) => {
  const f = await fixture(t);
  const user = await f.account();
  const { id } = await (await f.submit(user)).json();
  await f.store.DB.prepare("UPDATE works SET status='published' WHERE id=?")
    .bind(id)
    .run();
  const options = {
    method: "POST",
    cookie: user.cookie,
    body: {
      work_id: id,
      email: "creator@example.test",
      amount_cents: 500,
      note: "Launch week",
    },
  };
  const response = await f.request("/api/sponsors", options);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).payment_collected, false);
  assert.equal(
    (
      await f.request("/api/sponsors", {
        ...options,
        body: { ...options.body, amount_cents: 499 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.request("/api/sponsors", {
        ...options,
        body: { ...options.body, work_id: "tiny-sail" },
      })
    ).status,
    403,
  );
  const stored = await f.store.DB.prepare(
    "SELECT * FROM sponsor_requests",
  ).first();
  assert.equal(stored.amount_cents, 500);
  assert.equal(stored.status, "pending");
});
test("administrator preview only executes on the isolated player", async (t) => {
  const f = await fixture(t);
  const user = await f.account();
  const { id } = await (await f.submit(user)).json();
  assert.equal(
    (
      await f.request(`/api/admin/preview/${id}?render=1`, {
        cookie: user.cookie,
      })
    ).status,
    403,
  );
  await f.store.DB.prepare("UPDATE users SET role='admin' WHERE id=?")
    .bind(user.id)
    .run();
  assert.equal(
    (
      await f.request(`/api/admin/preview/${id}?render=1`, {
        cookie: user.cookie,
      })
    ).status,
    403,
  );
  const preview = await f.play(id, {
    cookie: user.cookie,
    review: true,
  });
  assert.equal(preview.status, 200);
  assert.match(
    preview.headers.get("content-security-policy"),
    /sandbox allow-scripts/,
  );
  assert.equal(await preview.text(), validHtml);
  assert.equal((await f.request("/api/me", { sandbox: true })).status, 404);
});

test("isolated playground preview runner executes on sandbox origin with strict CSP", async (t) => {
  const f = await fixture(t);

  // 1. Check /preview on main site returns home/playground SPA shell
  const mainPreview = await f.request("/preview");
  assert.equal(mainPreview.status, 200);
  const mainHtml = await mainPreview.text();
  assert.match(mainHtml, /id="preview-playground"/);

  // 2. Check /preview on sandbox origin returns runner page
  const sandboxPreview = await f.request("/preview", { sandbox: true });
  assert.equal(sandboxPreview.status, 200);
  const runnerHtml = await sandboxPreview.text();
  assert.match(runnerHtml, /OneHTML Sandbox Runner/);
  assert.match(runnerHtml, /onehtml:preview:ready/);
  assert.match(runnerHtml, /onehtml:preview:render/);

  // 3. Verify CSP headers on sandbox runner
  const csp = sandboxPreview.headers.get("content-security-policy");
  assert.match(csp, /sandbox allow-scripts/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /script-src 'unsafe-inline'/);
  assert.match(csp, new RegExp(`frame-ancestors ${origin}`));

  // 4. Verify robots tag on sandbox runner
  assert.equal(
    sandboxPreview.headers.get("x-robots-tag"),
    "noindex, nofollow, noarchive, nosnippet",
  );
});

test("works sort by approved sponsor amount desc, then likes desc, then created_at asc without user sort toggle", async (t) => {
  const f = await fixture(t);
  const admin = await f.account("admin_sort");
  const user2 = await f.account("voter_two");
  const s1 = await (await f.submit(admin, { title: "Sponsored Low", html: validHtml + "<!--s1-->" })).json();
  const s2 = await (await f.submit(admin, { title: "Sponsored High", html: validHtml + "<!--s2-->" })).json();
  const pendingS = await (await f.submit(admin, { title: "Pending Sponsor Only", html: validHtml + "<!--sp-->" })).json();
  const newestPlain = await (await f.submit(admin, { title: "Newest Plain", html: validHtml + "<!--np-->" })).json();
  for (const item of [s1, s2, pendingS, newestPlain]) {
    await approve(f, admin, item.id, item.version_id);
  }
  await f.store.DB.prepare("UPDATE works SET created_at=? WHERE id=?").bind(Date.now() + 100000, newestPlain.id).run();
  await f.store.DB.prepare("UPDATE works SET created_at=? WHERE id=?").bind(Date.now() + 1000, pendingS.id).run();

  // Likes on tiny-sail (2 likes) and bloom (1 like)
  await f.request("/api/works/tiny-sail/like", { method: "POST", cookie: admin.cookie, body: { active: true } });
  await f.request("/api/works/tiny-sail/like", { method: "POST", cookie: user2.cookie, body: { active: true } });
  await f.request("/api/works/bloom/like", { method: "POST", cookie: admin.cookie, body: { active: true } });

  // Submit sponsor requests: s1 ($10), s2 ($50), pendingS ($100, remains pending)
  await f.request("/api/sponsors", {
    method: "POST",
    cookie: admin.cookie,
    body: { work_id: s1.id, email: "a@example.test", amount_cents: 1000 },
  });
  await f.request("/api/sponsors", {
    method: "POST",
    cookie: admin.cookie,
    body: { work_id: s2.id, email: "b@example.test", amount_cents: 5000 },
  });
  await f.request("/api/sponsors", {
    method: "POST",
    cookie: admin.cookie,
    body: { work_id: pendingS.id, email: "c@example.test", amount_cents: 10000 },
  });

  // Approve s1 and s2 sponsors (status -> contacted), keep pendingS pending
  const queue = await (await f.request("/api/admin/queue", { cookie: admin.cookie })).json();
  for (const workId of [s1.id, s2.id]) {
    const req = queue.sponsors.find((item) => item.work_id === workId);
    assert.ok(req);
    const res = await f.request(`/api/admin/sponsors/${req.id}`, {
      method: "POST",
      cookie: admin.cookie,
      body: { status: "contacted" },
    });
    assert.equal(res.status, 200);
  }

  const catalog = await (await f.request("/api/works")).json();
  const ids = catalog.works.map((w) => w.id);
  // 1. Sponsored works ordered by amount_cents DESC: s2 ($50) then s1 ($10)
  assert.equal(ids[0], s2.id);
  assert.equal(ids[1], s1.id);
  assert.equal(catalog.works[0].sponsored, true);
  assert.equal(catalog.works[0].sponsor_amount_cents, 5000);
  assert.equal(catalog.works[1].sponsored, true);
  assert.equal(catalog.works[1].sponsor_amount_cents, 1000);
  // 2. Remaining liked works ordered by likes DESC: tiny-sail (2) then bloom (1)
  assert.equal(ids[2], "tiny-sail");
  assert.equal(ids[3], "bloom");
  // 3. Remaining unliked works ordered by created_at ASC (oldest first, newest at the end)
  assert.equal(ids[4], "focus-island");
  assert.equal(ids[5], "little-piano");
  assert.equal(ids[6], "orbital");
  assert.equal(ids[7], "midnight-drive");
  assert.equal(ids[8], pendingS.id);
  assert.equal(ids[9], newestPlain.id);
  assert.equal(catalog.works[8].sponsored, false);
  assert.equal(catalog.works[9].sponsored, false);

  // Verify frontend app.js no longer renders user sort dropdown
  const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(appSource, /id="sort"/);
  assert.doesNotMatch(appSource, /sort-select/);
});

test("GET /api/submissions returns user's submissions and spotlight requests, and leaderboard shares homepage sort order", async (t) => {
  const f = await fixture(t);
  const creator = await f.account("creator_space");
  const other = await f.account("other_space");
  const admin = await f.account("admin_space");

  const sub1 = await (await f.submit(creator, { title: "Space Game", html: validHtml + "<!--sp1-->" })).json();
  const sub2 = await (await f.submit(other, { title: "Other Game", html: validHtml + "<!--sp2-->" })).json();
  await approve(f, admin, sub1.id, sub1.version_id);
  await approve(f, admin, sub2.id, sub2.version_id);

  await f.request("/api/sponsors", {
    method: "POST",
    cookie: creator.cookie,
    body: { work_id: sub1.id, email: "creator@example.test", amount_cents: 1500, note: "Spotlight note" },
  });
  await f.request("/api/sponsors", {
    method: "POST",
    cookie: other.cookie,
    body: { work_id: sub2.id, email: "other@example.test", amount_cents: 2500 },
  });

  // Creator sees only their own work and sponsor request
  let creatorSpace = await (await f.request("/api/submissions", { cookie: creator.cookie })).json();
  assert.equal(creatorSpace.works.length, 1);
  assert.equal(creatorSpace.works[0].id, sub1.id);
  assert.equal(creatorSpace.works[0].status, "published");
  assert.equal(creatorSpace.sponsors.length, 1);
  assert.equal(creatorSpace.sponsors[0].work_id, sub1.id);
  assert.equal(creatorSpace.sponsors[0].work_title, "Space Game");
  assert.equal(creatorSpace.sponsors[0].amount_cents, 1500);
  assert.equal(creatorSpace.sponsors[0].status, "pending");
  assert.equal(creatorSpace.sponsors[0].note, "Spotlight note");

  // Admin approves creator's sponsor request -> status updates to contacted
  const queue = await (await f.request("/api/admin/queue", { cookie: admin.cookie })).json();
  const req = queue.sponsors.find((item) => item.work_id === sub1.id);
  await f.request(`/api/admin/sponsors/${req.id}`, {
    method: "POST",
    cookie: admin.cookie,
    body: { status: "contacted" },
  });

  creatorSpace = await (await f.request("/api/submissions", { cookie: creator.cookie })).json();
  assert.equal(creatorSpace.sponsors[0].status, "contacted");

  // Verify frontend app.js uses compareWorks everywhere (including leaderboard) and has My space tabs
  const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(appSource, /compareLeaderboard/);
  assert.match(appSource, /\.sort\(compareWorks\)/);
  assert.match(appSource, /data-space-tab=/);
  assert.match(appSource, /"submissions"/);
  assert.match(appSource, /"sponsors"/);
});
