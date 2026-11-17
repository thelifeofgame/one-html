import { constantEqual } from "./security.js";

export const PLAY_TTL_MS = 60000;
const bytes = new TextEncoder();
function encode(value) {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid encoding");
  return Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (character) => character.charCodeAt(0),
  );
}
async function signature(secret, value) {
  if (typeof secret !== "string" || secret.length < 32)
    throw Object.assign(
      new Error("The isolated player is not configured yet."),
      { status: 503 },
    );
  const key = await crypto.subtle.importKey(
    "raw",
    bytes.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return encode(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes.encode(value))),
  );
}
export async function issuePlayTicket(
  secret,
  { work, version, audience, siteOrigin, sessionHash },
  now = Date.now(),
) {
  const payload = {
    v: 1,
    wid: work.id,
    vid: version.id,
    sha: version.sha256,
    aud: audience,
    site: siteOrigin,
    exp: now + PLAY_TTL_MS,
  };
  if (audience === "review") payload.sid = sessionHash;
  const encoded = encode(bytes.encode(JSON.stringify(payload)));
  return {
    ticket: `${encoded}.${await signature(secret, encoded)}`,
    expires_at: payload.exp,
  };
}
export async function readPlayTicket(secret, ticket, now = Date.now()) {
  const denied = () => {
    throw Object.assign(
      new Error(
        "This play link has expired or is not valid. Please open it again from the gallery.",
      ),
      { status: 403 },
    );
  };
  if (typeof ticket !== "string" || ticket.length > 2048) return denied();
  const parts = ticket.split(".");
  if (
    parts.length !== 2 ||
    !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))
  )
    return denied();
  if (!constantEqual(await signature(secret, parts[0]), parts[1]))
    return denied();
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(decode(parts[0])));
  } catch {
    return denied();
  }
  if (
    payload.v !== 1 ||
    typeof payload.wid !== "string" ||
    typeof payload.vid !== "string" ||
    !/^[a-f0-9]{64}$/.test(payload.sha) ||
    !["public", "review"].includes(payload.aud) ||
    !Number.isSafeInteger(payload.exp) ||
    payload.exp <= now ||
    payload.exp > now + PLAY_TTL_MS + 5000
  )
    return denied();
  try {
    const site = new URL(payload.site);
    if (
      !["http:", "https:"].includes(site.protocol) ||
      site.origin !== payload.site
    )
      return denied();
  } catch {
    return denied();
  }
  if (payload.aud === "review" && !/^[a-f0-9]{64}$/.test(payload.sid || ""))
    return denied();
  return payload;
}
