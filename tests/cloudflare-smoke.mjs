import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const base = "http://127.0.0.1:4411";
const handle = "qa_" + randomUUID().replaceAll("-", "").slice(0, 12);
let cookie;
async function request(path, body) {
  return fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const registration = await request("/api/auth/register", {
  handle,
  password: randomUUID() + randomUUID(),
  display_name: "Cloudflare runtime QA",
});
assert.equal(registration.status, 200, await registration.clone().text());
cookie = registration.headers.get("set-cookie").split(";")[0];
const session = await (await request("/api/me")).json();
assert.equal(session.user.handle, handle);
const html =
  "<!doctype html><html><body><h1>Workerd and R2 verified</h1></body></html>";
const submission = await request("/api/submissions", {
  title: "Native runtime QA",
  description: "Checks real local D1 and R2 bindings.",
  category: "tool",
  html,
});
assert.equal(submission.status, 201, await submission.clone().text());
const { id } = await submission.json();
assert.match(id, /^[a-f0-9-]{36}$/);
const own = await (await request("/api/submissions")).json();
assert.equal(own.works[0].status, "pending");
const command = spawnSync(
  process.execPath,
  [
    resolve("node_modules/wrangler/bin/wrangler.js"),
    "d1",
    "execute",
    "onehtml-db",
    "--local",
    "--command",
    `UPDATE users SET role='admin' WHERE handle='${handle}'`,
  ],
  {
    encoding: "utf8",
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: resolve(".data/wrangler.log"),
      WRANGLER_SEND_METRICS: "false",
    },
  },
);
assert.equal(command.status, 0, command.stderr);
const approval = await request(`/api/admin/works/${id}`, {
  status: "published",
  note: "Native runtime verified.",
});
assert.equal(approval.status, 200, await approval.clone().text());
const preview = await request(`/api/admin/preview/${id}`);
assert.equal(preview.status, 200);
assert.equal((await preview.json()).html, html);
const play = await request(`/api/admin/works/${id}/play`, {});
assert.equal(play.status, 200);
const playData = await play.json();
assert.equal(typeof playData.play_url, "string");
assert.ok(playData.expires_at > Date.now());
assert.equal((await request(`/api/admin/preview/${id}?render=1`)).status, 403);
const like = await request(`/api/works/${id}/like`, { active: true });
assert.equal(like.status, 200);
assert.equal((await like.json()).likes, 1);
const catalog = await (await request("/api/works")).json();
assert.ok(catalog.works.some((work) => work.id === id && work.liked === 1));
console.log(
  "Cloudflare local runtime: registration, sessions, D1, R2 upload/read, moderation, and likes passed.",
);
