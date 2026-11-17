import { createServer } from "node:http";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve, extname } from "node:path";
import { Readable } from "node:stream";
import { parseEnv } from "node:util";
import worker from "../src/worker.js";
import { openStore } from "./local-store.mjs";
import { ensureArchive } from "../src/archive.js";
import { importCollection } from "./import-collection.mjs";
import { serverConfig } from "./server-config.mjs";

const root = resolve(import.meta.dirname, "..");
const dataDir = process.env.DATA_DIR || resolve(root, ".data");
let localVars = {};
try {
  localVars = parseEnv(await readFile(resolve(root, ".dev.vars"), "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const config = serverConfig({ ...localVars, ...process.env });
const { port, sandboxPort } = config;
const googleVars = Object.fromEntries(
  ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SITE_ORIGIN"].map((key) => [
    key,
    process.env[key] ||
      localVars[key] ||
      (key === "SITE_ORIGIN" ? config.siteOrigin : ""),
  ]),
);
const store = await openStore(dataDir);
const secretFile = resolve(dataDir, "play-secret");
try {
  await writeFile(secretFile, randomBytes(48).toString("hex"), {
    flag: "wx",
    mode: 0o600,
  });
} catch (error) {
  if (error.code !== "EEXIST") throw error;
}
await chmod(secretFile, 0o600);
const playSecret = (await readFile(secretFile, "utf8")).trim();
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const ASSETS = {
  async fetch(request) {
    const url = new URL(request.url);
    let path;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    const file = resolve(
      root,
      "public",
      path === "/" ? "index.html" : "." + path,
    );
    if (!file.startsWith(resolve(root, "public") + "/"))
      return new Response("Forbidden", { status: 403 });
    try {
      return new Response(await readFile(file), {
        headers: {
          "Content-Type": types[extname(file)] || "application/octet-stream",
          "Cache-Control": "no-cache",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
};
function server(demoOnly) {
  return createServer(async (incoming, outgoing) => {
    try {
      if (!incoming.url?.startsWith("/") || incoming.url.startsWith("//")) {
        outgoing.writeHead(400);
        outgoing.end("Invalid request path");
        return;
      }
      const host = incoming.headers.host;
      if (
        !config.serverMode &&
        !demoOnly &&
        host === `localhost:${port}` &&
        ["GET", "HEAD"].includes(incoming.method)
      ) {
        outgoing.writeHead(307, {
          Location: `${config.siteOrigin}${incoming.url}`,
        });
        outgoing.end();
        return;
      }
      if (host !== (demoOnly ? config.sandboxHost : config.siteHost)) {
        outgoing.writeHead(403);
        outgoing.end("Invalid host");
        return;
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers))
        if (value)
          headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      headers.set(
        "CF-Connecting-IP",
        config.trustProxy && incoming.headers["x-onehtml-client-ip"]
          ? incoming.headers["x-onehtml-client-ip"]
          : incoming.socket.remoteAddress || "local",
      );
      if (demoOnly) headers.delete("cookie");
      const request = new Request(
        new URL(
          incoming.url,
          demoOnly ? config.sandboxOrigin : config.siteOrigin,
        ),
        {
          method: incoming.method,
          headers,
          ...(incoming.method !== "GET" && incoming.method !== "HEAD"
            ? { body: Readable.toWeb(incoming), duplex: "half" }
            : {}),
        },
      );
      const response = await worker.fetch(request, {
        ...store,
        ASSETS,
        SANDBOX_ORIGIN: config.sandboxOrigin,
        PLAY_TOKEN_SECRET: playSecret,
        ...(!demoOnly ? { ...googleVars, SITE_ORIGIN: config.siteOrigin } : {}),
        DEMO_ONLY: demoOnly ? "true" : "false",
      });
      const outgoingHeaders = Object.fromEntries(response.headers);
      const cookies = response.headers.getSetCookie();
      if (cookies.length) outgoingHeaders["set-cookie"] = cookies;
      outgoing.writeHead(response.status, outgoingHeaders);
      if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
      else outgoing.end();
    } catch (error) {
      console.error(error.message);
      outgoing.writeHead(500);
      outgoing.end("Server error");
    }
  });
}
if (
  !(await store.DB.prepare("SELECT id FROM works WHERE id='saltline'").first())
)
  await importCollection(store, { replaceDemos: true });
for (const work of (
  await store.DB.prepare(
    "SELECT * FROM works WHERE current_version_id IS NULL",
  ).all()
).results)
  await ensureArchive(work, { ...store, ASSETS });
const servers = config.serverMode
  ? [server(false), server(true)]
  : [server(false), server(true), server(true)];
for (const item of servers) item.requestTimeout = 30000;
await Promise.all(
  servers.map(
    (item, index) =>
      new Promise((done, reject) =>
        item
          .once("error", reject)
          .listen(
            index ? sandboxPort : port,
            index === 2 ? "::1" : config.host,
            done,
          ),
      ),
  ),
);
console.log(
  `OneHTML: ${config.siteOrigin}\nIsolated player: ${config.sandboxOrigin}`,
);
const shutdown = () => {
  for (const item of servers) item.close();
  store.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
