import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from "jose";
import worker from "../src/worker.js";
import { openStore } from "../scripts/local-store.mjs";
import { hash } from "../src/security.js";
import { verifyGoogleIdToken, googleConfig } from "../src/google-auth.js";
import { configureGoogle } from "../scripts/configure-google.mjs";

const origin = "https://onehtml.test";
const clientId = "unit-onehtml.apps.googleusercontent.com";
const pair = await generateKeyPair("RS256");
const publicKey = {
  ...(await exportJWK(pair.publicKey)),
  kid: "unit-google-key",
  alg: "RS256",
  use: "sig",
};
async function sign(nonce, overrides = {}, privateKey = pair.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: "https://accounts.google.com",
    aud: clientId,
    sub: "google-subject-one",
    nonce,
    email: "one@example.test",
    email_verified: true,
    name: "Google member",
    iat: now,
    exp: now + 3600,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: publicKey.kid })
    .sign(privateKey);
}
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "onehtml-google-"));
  const store = await openStore(directory);
  t.after(async () => {
    store.close();
    await rm(directory, { recursive: true, force: true });
  });
  const env = {
    ...store,
    SITE_ORIGIN: origin,
    GOOGLE_CLIENT_ID: clientId,
    GOOGLE_CLIENT_SECRET: "unit-secret-not-a-live-credential",
    SANDBOX_ORIGIN: "https://play.onehtml.test",
  };
  const tokens = new Map(),
    exchanges = [];
  t.mock.method(globalThis, "fetch", async (input, options = {}) => {
    const url = String(input);
    if (url === "https://www.googleapis.com/oauth2/v3/certs")
      return Response.json({ keys: [publicKey] });
    assert.equal(url, "https://oauth2.googleapis.com/token");
    assert.equal(options.redirect, "error");
    const params = new URLSearchParams(options.body);
    exchanges.push(params);
    if (params.get("code") === "simulate-network-failure")
      throw new Error("Network unavailable");
    return Response.json({
      id_token: tokens.get(params.get("code")),
      access_token: "not-to-be-stored",
      refresh_token: "also-not-to-be-stored",
    });
  });
  function request(
    path,
    {
      method = "GET",
      cookie,
      data,
      requestOrigin = origin,
      overrides = {},
    } = {},
  ) {
    return worker.fetch(
      new Request(origin + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(requestOrigin ? { Origin: requestOrigin } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      }),
      { ...env, ...overrides },
    );
  }
  async function begin() {
    const response = await request("/api/auth/google/start", {
      method: "POST",
    });
    assert.equal(response.status, 200);
    const url = new URL((await response.json()).authorization_url);
    return {
      response,
      url,
      state: url.searchParams.get("state"),
      nonce: url.searchParams.get("nonce"),
      cookie: response.headers.get("set-cookie").split(";")[0],
    };
  }
  function callback(flow, code, cookie = flow.cookie) {
    return request(
      `/api/auth/google/callback?${new URLSearchParams({ state: flow.state, code })}`,
      { cookie, requestOrigin: null },
    );
  }
  async function finish(flow, claims = {}) {
    const code = crypto.randomUUID();
    tokens.set(code, await sign(flow.nonce, claims));
    return callback(flow, code);
  }
  return {
    store,
    env,
    directory,
    request,
    begin,
    callback,
    finish,
    tokens,
    exchanges,
  };
}
function sessionCookie(response) {
  return response.headers
    .getSetCookie()
    .find((value) => value.startsWith("onehtml_session="))
    .split(";")[0];
}

test("Google stays unavailable until a valid server-side configuration exists", async (t) => {
  const f = await fixture(t);
  for (const config of [
    { GOOGLE_CLIENT_SECRET: "" },
    { SITE_ORIGIN: "http://public.example.test" },
    { SITE_ORIGIN: "https://user:pass@example.test" },
    { SITE_ORIGIN: origin + "/wrong" },
    { GOOGLE_CLIENT_ID: "invalid-client" },
  ]) {
    const me = await (await f.request("/api/me", { overrides: config })).json();
    assert.equal(me.auth.google, false);
    const response = await f.request("/api/auth/google/start", {
      method: "POST",
      overrides: config,
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.has("set-cookie"), false);
  }
  assert.ok(googleConfig({ ...f.env, SITE_ORIGIN: "http://127.0.0.1:4391" }));
});

test("Google start binds the browser, requests only profile scopes and uses PKCE", async (t) => {
  const f = await fixture(t);
  const denied = await f.request("/api/auth/google/start", {
    method: "POST",
    requestOrigin: "https://evil.test",
  });
  assert.equal(denied.status, 403);
  const flow = await f.begin();
  assert.equal(flow.url.origin, "https://accounts.google.com");
  assert.equal(flow.url.searchParams.get("scope"), "openid email profile");
  assert.equal(
    flow.url.searchParams.get("redirect_uri"),
    origin + "/api/auth/google/callback",
  );
  assert.equal(flow.url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(flow.url.href.includes(f.env.GOOGLE_CLIENT_SECRET), false);
  assert.match(
    flow.response.headers.get("set-cookie"),
    /HttpOnly; SameSite=Lax; Path=\/api\/auth\/google; Max-Age=600; Secure/,
  );
  const transaction = await f.store.DB.prepare(
    "SELECT * FROM oauth_states WHERE state_hash=?",
  )
    .bind(await hash(flow.state))
    .first();
  assert.notEqual(transaction.state_hash, flow.state);
  const challenge = Buffer.from(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(transaction.code_verifier),
    ),
  ).toString("base64url");
  assert.equal(flow.url.searchParams.get("code_challenge"), challenge);
  assert.equal(f.exchanges.length, 0);
});

test("verified Google sign-in creates a member session and returning users retain their account and activity", async (t) => {
  const f = await fixture(t);
  const flow = await f.begin();
  const response = await f.finish(flow, { role: "admin" });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), origin + "/?auth=google");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.getSetCookie().length, 2);
  const cookie = sessionCookie(response);
  let user = (await (await f.request("/api/me", { cookie })).json()).user;
  assert.equal(user.role, "member");
  const firstId = user.id;
  const exchange = f.exchanges[0];
  assert.equal(exchange.get("client_secret"), f.env.GOOGLE_CLIENT_SECRET);
  assert.equal(exchange.get("grant_type"), "authorization_code");
  assert.equal(
    exchange.get("redirect_uri"),
    origin + "/api/auth/google/callback",
  );
  assert.ok(exchange.get("code_verifier"));
  await f.request("/api/works/tiny-sail/like", {
    method: "POST",
    cookie,
    data: { active: true },
  });
  await f.request("/api/works/tiny-sail/save", {
    method: "POST",
    cookie,
    data: { active: true },
  });
  const next = await f.finish(await f.begin(), {
    email: "renamed@example.test",
  });
  const nextCookie = sessionCookie(next);
  user = (await (await f.request("/api/me", { cookie: nextCookie })).json())
    .user;
  assert.equal(user.id, firstId);
  assert.equal(
    (await f.store.DB.prepare("SELECT count(*) AS n FROM users").first()).n,
    1,
  );
  const identity = await f.store.DB.prepare(
    "SELECT * FROM auth_identities",
  ).first();
  assert.equal(identity.email, "renamed@example.test");
  assert.equal(JSON.stringify(identity).includes("not-to-be-stored"), false);
  const catalog = await (
    await f.request("/api/works", { cookie: nextCookie })
  ).json();
  assert.equal(catalog.works.find((work) => work.id === "tiny-sail").liked, 1);
  assert.equal(catalog.works.find((work) => work.id === "tiny-sail").saved, 1);
  const passwordAttempt = await f.request("/api/auth/login", {
    method: "POST",
    data: { handle: user.handle, password: "not-a-google-password" },
  });
  assert.equal(passwordAttempt.status, 401);
  await f.request("/api/auth/logout", { method: "POST", cookie: nextCookie });
  assert.equal(
    (await (await f.request("/api/me", { cookie: nextCookie })).json()).user,
    null,
  );
});

test("Google callbacks reject another browser, expired states and replays without creating a session", async (t) => {
  const f = await fixture(t);
  const a = await f.begin(),
    b = await f.begin();
  let response = await f.callback(a, "unissued-code", b.cookie);
  assert.equal(
    response.headers.get("location"),
    origin + "/?auth_error=expired",
  );
  assert.equal(
    response.headers
      .getSetCookie()
      .some((x) => x.startsWith("onehtml_session=")),
    false,
  );
  response = await f.finish(a);
  assert.equal(response.headers.get("location"), origin + "/?auth=google");
  const count = f.exchanges.length;
  response = await f.callback(a, "unissued-code");
  assert.equal(
    response.headers.get("location"),
    origin + "/?auth_error=expired",
  );
  assert.equal(f.exchanges.length, count);
  await f.store.DB.prepare(
    "UPDATE oauth_states SET expires_at=0 WHERE state_hash=?",
  )
    .bind(await hash(b.state))
    .run();
  response = await f.finish(b);
  assert.equal(
    response.headers.get("location"),
    origin + "/?auth_error=expired",
  );
  assert.equal(f.exchanges.length, count);
});

test("Google cancellation and token network failures return clean retry routes", async (t) => {
  const f = await fixture(t);
  const cancelled = await f.begin();
  const denied = await f.request(
    `/api/auth/google/callback?state=${cancelled.state}&error=access_denied`,
    { cookie: cancelled.cookie, requestOrigin: null },
  );
  assert.equal(
    denied.headers.get("location"),
    origin + "/?auth_error=cancelled",
  );
  assert.equal(f.exchanges.length, 0);
  const unavailable = await f.callback(
    await f.begin(),
    "simulate-network-failure",
  );
  assert.equal(
    unavailable.headers.get("location"),
    origin + "/?auth_error=unavailable",
  );
  assert.equal(
    (await f.store.DB.prepare("SELECT count(*) AS n FROM users").first()).n,
    0,
  );
});

test("Google identities use provider subjects and concurrent first logins produce one account", async (t) => {
  const f = await fixture(t);
  const a = await f.begin(),
    b = await f.begin();
  const [one, two] = await Promise.all([f.finish(a), f.finish(b)]);
  const first = (
    await (await f.request("/api/me", { cookie: sessionCookie(one) })).json()
  ).user;
  const second = (
    await (await f.request("/api/me", { cookie: sessionCookie(two) })).json()
  ).user;
  assert.equal(first.id, second.id);
  assert.equal(
    (await f.store.DB.prepare("SELECT count(*) AS n FROM users").first()).n,
    1,
  );
  const differentSubject = await f.finish(await f.begin(), {
    sub: "google-subject-two",
  });
  const other = (
    await (
      await f.request("/api/me", { cookie: sessionCookie(differentSubject) })
    ).json()
  ).user;
  assert.notEqual(other.id, first.id);
});

test("Google token signatures and OIDC claims must be valid", async (t) => {
  const keys = createLocalJWKSet({ keys: [publicKey] });
  const nonce = "unit-nonce";
  const cases = [
    { aud: "another-client.apps.googleusercontent.com" },
    { iss: "https://evil.test" },
    { nonce: "another-nonce" },
    { email_verified: false },
    { sub: "" },
    { email: "not-an-email" },
    { exp: Math.floor(Date.now() / 1000) - 60 },
    { exp: undefined },
    { iat: undefined },
    { iat: Math.floor(Date.now() / 1000) + 300 },
    { azp: "another-client" },
  ];
  for (const claims of cases) {
    await assert.rejects(
      verifyGoogleIdToken(await sign(nonce, claims), clientId, nonce, keys),
      { status: 401 },
    );
  }
  const wrongPair = await generateKeyPair("RS256");
  await assert.rejects(
    verifyGoogleIdToken(
      await sign(nonce, {}, wrongPair.privateKey),
      clientId,
      nonce,
      keys,
    ),
    { status: 401 },
  );
  assert.equal(
    (await verifyGoogleIdToken(await sign(nonce), clientId, nonce, keys))
      .subject,
    "google-subject-one",
  );
});

test("OAuth client import preserves unrelated configuration and saves secrets privately", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "onehtml-google-config-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const clientFile = join(directory, "client.json");
  await writeFile(
    join(directory, ".dev.vars"),
    "# Keep this setting\nOTHER_SETTING=preserved\nSITE_ORIGIN=http://127.0.0.1:4391\n",
  );
  const client = {
    web: {
      client_id: clientId,
      client_secret: "unit-private-secret",
      redirect_uris: ["http://127.0.0.1:4391/api/auth/google/callback"],
    },
  };
  await writeFile(clientFile, JSON.stringify(client));
  const result = await configureGoogle(clientFile, directory);
  const contents = await readFile(result.path, "utf8");
  assert.match(contents, /OTHER_SETTING=preserved/);
  assert.match(contents, /# Keep this setting/);
  assert.equal((await stat(result.path)).mode & 0o777, 0o600);
  assert.equal(contents.split("GOOGLE_CLIENT_SECRET=").length, 2);
  client.web.redirect_uris = ["http://localhost:4391/api/auth/google/callback"];
  await writeFile(clientFile, JSON.stringify(client));
  await assert.rejects(
    configureGoogle(clientFile, directory),
    /exact redirect URI/,
  );
  assert.equal(await readFile(result.path, "utf8"), contents);
});
