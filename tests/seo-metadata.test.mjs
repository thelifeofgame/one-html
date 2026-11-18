import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import worker from "../src/worker.js";
import { openStore } from "../scripts/local-store.mjs";
import { issuePlayTicket } from "../src/play-tickets.js";
import { importCollection } from "../scripts/import-collection.mjs";
import { getWorkEnrichedDetails } from "../src/seo-meta.js";

const origin = "https://onehtmlapp.com";
const sandboxOrigin = "https://sandbox.onehtmlapp.com";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "onehtml-seo-test-"));
  const store = await openStore(directory);
  await importCollection(store, { replaceDemos: true });
  t.after(async () => {
    store.close();
    await rm(directory, { recursive: true, force: true });
  });

  const env = {
    ...store,
    SITE_ORIGIN: origin,
    SANDBOX_ORIGIN: sandboxOrigin,
    PLAY_TOKEN_SECRET: "test-play-secret-key-for-seo-tests-123456",
    ASSETS: {
      fetch: async (request) => {
        try {
          const url = new URL(request.url);
          const path = url.pathname === "/" ? "/index.html" : url.pathname;
          return new Response(
            await readFile(new URL(`../public${path}`, import.meta.url)),
          );
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  };

  async function request(path, { method = "GET", sandbox = false, body, headers = {} } = {}) {
    const base = sandbox ? env.SANDBOX_ORIGIN : env.SITE_ORIGIN;
    return worker.fetch(
      new Request(`${base}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      { ...env, DEMO_ONLY: sandbox ? "true" : "false" },
    );
  }

  return { env, store, request };
}

test("Homepage TDK & metadata optimization conforms to specification", async (t) => {
  const f = await fixture(t);
  const response = await f.request("/");
  assert.equal(response.status, 200);

  const html = await response.text();

  // 1. Title verification
  const expectedTitle = "OneHTML - Run, Host & Share Single-File HTML5 & AI Web Apps Online";
  assert.match(
    html,
    new RegExp(`<title>${expectedTitle.replace(/&/g, "&(?:amp;)?")}<\\/title>`, "i"),
    "Homepage Title must match standard brand + feature combination",
  );

  // 2. Meta Description covers Single-File HTML, Host & Share, AI Web Apps
  assert.match(
    html,
    /<meta\s+name=["']description["']\s+content=["'][^"']*Single-File HTML5[^"']*AI web apps[^"']*["']/i,
    "Meta Description must cover key search terms",
  );
  assert.match(html, /Host &amp; Share|host & share/i, "Description must cover Host & Share");

  // 3. Canonical tag
  assert.match(
    html,
    new RegExp(`<link\\s+rel=["']canonical["']\\s+href=["']${origin}/?["']\\s*\\/?>`),
    "Canonical tag must point to site origin canonical URL",
  );

  // 4. OpenGraph and Twitter Cards
  assert.match(html, /<meta\s+property=["']og:title["']/);
  assert.match(html, /<meta\s+property=["']og:description["']/);
  assert.match(html, /<meta\s+property=["']og:image["']/);
  assert.match(html, /<meta\s+property=["']og:url["']/);
  assert.match(html, /<meta\s+name=["']twitter:card["']\s+content=["']summary_large_image["']/);
  assert.match(html, /<meta\s+name=["']twitter:title["']/);
  assert.match(html, /<meta\s+name=["']twitter:description["']/);
  assert.match(html, /<meta\s+name=["']twitter:image["']/);
});

test("Sandbox domain strictly enforces X-Robots-Tag: noindex, nofollow across all endpoints", async (t) => {
  const f = await fixture(t);

  // 1. Sandbox robots.txt
  const robotsRes = await f.request("/robots.txt", { sandbox: true });
  assert.equal(robotsRes.status, 200);
  const robotsHeader = robotsRes.headers.get("x-robots-tag");
  assert.ok(robotsHeader, "Sandbox robots.txt must have X-Robots-Tag");
  assert.match(robotsHeader, /noindex/i);
  assert.match(robotsHeader, /nofollow/i);

  // 2. Sandbox 404 (any unmapped path)
  const notFoundRes = await f.request("/random-page", { sandbox: true });
  assert.equal(notFoundRes.status, 404);
  const notFoundHeader = notFoundRes.headers.get("x-robots-tag");
  assert.ok(notFoundHeader, "Sandbox 404 must have X-Robots-Tag");
  assert.match(notFoundHeader, /noindex/i);
  assert.match(notFoundHeader, /nofollow/i);

  // 3. Sandbox root /
  const rootRes = await f.request("/", { sandbox: true });
  assert.equal(rootRes.status, 404);
  const rootHeader = rootRes.headers.get("x-robots-tag");
  assert.ok(rootHeader, "Sandbox / must have X-Robots-Tag");
  assert.match(rootHeader, /noindex/i);
  assert.match(rootHeader, /nofollow/i);

  // 4. Sandbox play ticket
  const work = await f.store.DB.prepare("SELECT * FROM works WHERE id='q1k3'").first();
  const version = await f.store.DB.prepare("SELECT * FROM work_versions WHERE id=?").bind(work.current_version_id).first();
  const ticket = await issuePlayTicket(f.env.PLAY_TOKEN_SECRET, {
    work,
    version,
    audience: "public",
    siteOrigin: origin,
  });

  const playRes = await f.request(`/play/${ticket.ticket}`, { sandbox: true });
  assert.equal(playRes.status, 200);
  const playHeader = playRes.headers.get("x-robots-tag");
  assert.ok(playHeader, "Sandbox play response must have X-Robots-Tag");
  assert.match(playHeader, /noindex/i);
  assert.match(playHeader, /nofollow/i);

  // 5. Main site /play/ endpoint must reject with 403 and X-Robots-Tag
  const mainPlayRes = await f.request(`/play/${ticket.ticket}`, { sandbox: false });
  assert.equal(mainPlayRes.status, 403);
  const mainPlayHeader = mainPlayRes.headers.get("x-robots-tag");
  assert.ok(mainPlayHeader);
  assert.match(mainPlayHeader, /noindex/i);
  assert.match(mainPlayHeader, /nofollow/i);
});

test("Curated work page contains crawler-readable static text, 3~5 sentence descriptions, and tech tags", async (t) => {
  const f = await fixture(t);

  // Test Q1K3
  const res = await f.request("/work/q1k3");
  assert.equal(res.status, 200);
  const html = await res.text();

  // Canonical tag check
  assert.match(
    html,
    new RegExp(`<link\\s+rel=["']canonical["']\\s+href=["']${origin}/work/q1k3["']\\s*\\/?>`),
    "Work page must have canonical tag pointing to standard work URL",
  );

  // OpenGraph and Twitter Cards
  assert.match(html, /<meta\s+property=["']og:title["']\s+content=["']Q1K3[^"']*—\s*OneHTML["']/);
  assert.match(html, /<meta\s+property=["']og:description["']/);
  assert.match(html, /<meta\s+property=["']og:url["']\s+content=["']https:\/\/onehtmlapp\.com\/work\/q1k3["']/);
  assert.match(html, /<meta\s+property=["']og:image["']\s+content=["']https:\/\/onehtmlapp\.com\/covers\/q1k3\.png["']/);
  assert.match(html, /<meta\s+name=["']twitter:card["']\s+content=["']summary_large_image["']/);
  assert.match(html, /<meta\s+name=["']twitter:title["']/);
  assert.match(html, /<meta\s+name=["']twitter:description["']/);
  assert.match(html, /<meta\s+name=["']twitter:image["']/);

  // Crawler-readable static text area: NOT inside noscript
  assert.match(html, /<section class=["']work-showcase container["']/);
  assert.match(html, /<article class=["']work-static-details["']/);

  // Title & author in DOM
  assert.match(html, /<h1 class=["']work-title["']>Q1K3 - 13KB WebGL 3D FPS<\/h1>/);
  assert.match(html, /Dominic Szablewski · PhobosLab/);

  // Technical tags present (e.g. #WebGL, #ThreeJS, etc.)
  assert.match(html, /#WebGL/);
  assert.match(html, /#ThreeJS/);
  assert.match(html, /class=["']tech-tag["']/);

  // 3~5 sentences functional description in work-description-full
  const details = getWorkEnrichedDetails({ id: "q1k3", title: "Q1K3" });
  assert.ok(details.sentences.length >= 3 && details.sentences.length <= 5, "Must have 3~5 sentences");
  for (const sentence of details.sentences) {
    assert.ok(html.includes(sentence.replace(/'/g, "&#39;").replace(/"/g, "&quot;")), `HTML must contain sentence: ${sentence.slice(0, 30)}`);
  }
});

test("User-submitted work dynamically gets 3~5 sentence description, tech tags, and SEO tags", async (t) => {
  const f = await fixture(t);

  // Create an author and a custom user submission
  const userId = "user-" + crypto.randomUUID();
  const workId = "custom-canvas-game-" + crypto.randomUUID().slice(0, 8);
  const versionId = "ver-" + crypto.randomUUID();
  const now = Date.now();

  await f.store.DB.prepare(
    "INSERT INTO users (id, handle, display_name, password_hash, password_salt, role, created_at) VALUES (?, ?, ?, ?, ?, 'member', ?)",
  )
    .bind(userId, "indie_dev", "Indie Creator", "dummy", "dummy", now)
    .run();

  await f.store.DB.prepare(
    `INSERT INTO works (id, title, description, category, author_id, credit, source_url, license, status, object_key, current_version_id, sha256, cover, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, 'custom', ?)`,
  )
    .bind(
      workId,
      "Super Orbital Canvas Runner",
      "A fast-paced neon runner built with ThreeJS and Canvas 2D audio beat synthesizer.",
      "game",
      userId,
      "Indie Creator",
      "https://github.com/example/runner",
      "MIT",
      "archive/" + workId + "/code.html",
      versionId,
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      now,
    )
    .run();

  const res = await f.request(`/work/${workId}`);
  assert.equal(res.status, 200);
  const html = await res.text();

  // Canonical tag check
  assert.match(html, new RegExp(`<link\\s+rel=["']canonical["']\\s+href=["']${origin}/work/${workId}["']\\s*\\/?>`));

  // Author & Title check
  assert.match(html, /Super Orbital Canvas Runner/);
  assert.match(html, /Indie Creator/);

  // Technical tags automatically generated from keywords
  assert.match(html, /#ThreeJS/);
  assert.match(html, /#Canvas/);
  assert.match(html, /#SingleFileHTML/);

  // 3~5 sentence functional description check
  const details = getWorkEnrichedDetails({
    id: workId,
    title: "Super Orbital Canvas Runner",
    description: "A fast-paced neon runner built with ThreeJS and Canvas 2D audio beat synthesizer.",
    credit: "Indie Creator",
    category: "game",
  });
  assert.ok(details.sentences.length >= 3 && details.sentences.length <= 5, "Dynamic sentences count must be between 3 and 5");
  assert.match(html, /<div class=["']work-description-full["']>/);
});
