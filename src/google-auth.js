import { createRemoteJWKSet, jwtVerify } from "jose";
import { hash, constantEqual } from "./security.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_KEYS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const STATE_TTL = 10 * 60000;
const randomToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
const fail = (code, status = 401) => {
  throw Object.assign(
    new Error(
      code === "unavailable"
        ? "Google sign-in is temporarily unavailable."
        : "Google sign-in could not be completed. Please try again.",
    ),
    { status, authCode: code },
  );
};

export function googleConfig(env) {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret || !env.SITE_ORIGIN) return null;
  try {
    const site = new URL(env.SITE_ORIGIN);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
      site.hostname,
    );
    if (
      !/^[A-Za-z0-9_.-]+\.apps\.googleusercontent\.com$/.test(clientId) ||
      site.username ||
      site.password ||
      site.pathname !== "/" ||
      site.search ||
      site.hash ||
      (site.protocol !== "https:" && !(site.protocol === "http:" && loopback))
    )
      return null;
    return {
      clientId,
      clientSecret,
      origin: site.origin,
      redirectUri: `${site.origin}/api/auth/google/callback`,
    };
  } catch {
    return null;
  }
}
export function googleCookie(request, token = "") {
  return `onehtml_google=${token}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=${token ? 600 : 0}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
function requireConfig(request, env) {
  const config = googleConfig(env);
  if (!config)
    throw Object.assign(new Error("Google sign-in is not configured yet."), {
      status: 503,
    });
  if (new URL(request.url).origin !== config.origin) fail("invalid", 403);
  return config;
}
export async function startGoogleLogin(request, env) {
  const config = requireConfig(request, env);
  const state = randomToken(),
    binding = randomToken(),
    nonce = randomToken(),
    verifier = randomToken();
  const challenge = btoa(
    String.fromCharCode(
      ...new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(verifier),
        ),
      ),
    ),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_states WHERE expires_at<=?").bind(
      Date.now(),
    ),
    env.DB.prepare(
      "INSERT INTO oauth_states (state_hash,binding_hash,nonce,code_verifier,redirect_uri,expires_at) VALUES (?,?,?,?,?,?)",
    ).bind(
      await hash(state),
      await hash(binding),
      nonce,
      verifier,
      config.redirectUri,
      Date.now() + STATE_TTL,
    ),
  ]);
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { authorizationUrl: url.href, cookie: googleCookie(request, binding) };
}

export async function verifyGoogleIdToken(
  token,
  clientId,
  nonce,
  keys = GOOGLE_KEYS,
) {
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
      algorithms: ["RS256"],
      requiredClaims: [
        "iss",
        "aud",
        "sub",
        "exp",
        "iat",
        "nonce",
        "email",
        "email_verified",
      ],
      maxTokenAge: "10m",
      clockTolerance: 5,
    });
    if (
      typeof payload.sub !== "string" ||
      !payload.sub ||
      payload.sub.length > 255 ||
      typeof payload.nonce !== "string" ||
      !constantEqual(payload.nonce, nonce) ||
      (payload.azp !== undefined && payload.azp !== clientId) ||
      payload.email_verified !== true ||
      typeof payload.email !== "string" ||
      payload.email.length > 320 ||
      !payload.email.includes("@")
    )
      fail("invalid");
    return {
      subject: payload.sub,
      email: payload.email,
      name:
        typeof payload.name === "string"
          ? payload.name.trim().slice(0, 40)
          : "",
    };
  } catch {
    fail("invalid");
  }
}

export async function finishGoogleLogin(request, env) {
  const config = requireConfig(request, env);
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const binding = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)onehtml_google=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (
    !/^[a-f0-9]{64}$/.test(state) ||
    !binding ||
    url.searchParams.getAll("state").length !== 1
  )
    fail("expired");
  const transaction = await env.DB.prepare(
    "DELETE FROM oauth_states WHERE state_hash=? AND binding_hash=? AND expires_at>? RETURNING nonce,code_verifier,redirect_uri",
  )
    .bind(await hash(state), await hash(binding), Date.now())
    .first();
  if (!transaction || transaction.redirect_uri !== config.redirectUri)
    fail("expired");
  if (url.searchParams.has("error"))
    fail(
      url.searchParams.get("error") === "access_denied"
        ? "cancelled"
        : "invalid",
    );
  const code = url.searchParams.get("code");
  if (
    !code ||
    code.length > 4096 ||
    url.searchParams.getAll("code").length !== 1
  )
    fail("invalid");
  let tokens;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        code_verifier: transaction.code_verifier,
        redirect_uri: transaction.redirect_uri,
        grant_type: "authorization_code",
      }),
    });
    if (!response.ok) fail("invalid");
    tokens = await response.json();
  } catch (error) {
    if (error.authCode) throw error;
    fail("unavailable", 503);
  } finally {
    clearTimeout(timeout);
  }
  if (typeof tokens.id_token !== "string" || tokens.id_token.length > 16000)
    fail("invalid");
  const identity = await verifyGoogleIdToken(
    tokens.id_token,
    config.clientId,
    transaction.nonce,
  );
  const userId = crypto.randomUUID(),
    handle = "g_" + randomToken().slice(0, 20),
    now = Date.now();
  // The provider subject is stable; email addresses must never merge accounts.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id,handle,display_name,password_hash,password_salt,created_at)
      SELECT ?,?,?,'','',? WHERE NOT EXISTS(SELECT 1 FROM auth_identities WHERE provider='google' AND subject=?)`,
    ).bind(
      userId,
      handle,
      identity.name || identity.email.split("@")[0].slice(0, 40),
      now,
      identity.subject,
    ),
    env.DB.prepare(
      `INSERT INTO auth_identities (provider,subject,user_id,email,created_at)
      SELECT 'google',?,?,?,? FROM users WHERE id=?`,
    ).bind(identity.subject, userId, identity.email, now, userId),
    env.DB.prepare(
      "UPDATE auth_identities SET email=? WHERE provider='google' AND subject=?",
    ).bind(identity.email, identity.subject),
  ]);
  return env.DB.prepare(
    "SELECT u.id,u.handle,u.display_name,u.role FROM users u JOIN auth_identities i ON i.user_id=u.id WHERE i.provider='google' AND i.subject=?",
  )
    .bind(identity.subject)
    .first();
}
