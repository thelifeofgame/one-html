import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { request as httpRequest } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";

test("server runtime preserves public origins, host isolation and secure sessions behind HTTP transport", async (t) => {
  const reservations = [createServer(), createServer()];
  for (const listener of reservations) {
    listener.listen(0, "127.0.0.1");
    await once(listener, "listening");
  }
  const [port, sandboxPort] = reservations.map(
    (listener) => listener.address().port,
  );
  for (const listener of reservations)
    await new Promise((done) => listener.close(done));
  const directory = await mkdtemp(join(tmpdir(), "onehtml-server-"));
  const origin = "https://gallery.example.test",
    sandbox = "https://player.example.test";
  const child = spawn(
    process.execPath,
    ["--experimental-sqlite", "--no-warnings", "scripts/dev.mjs"],
    {
      cwd: resolve(import.meta.dirname, ".."),
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ONEHTML_SERVER_MODE: "1",
        HOST: "127.0.0.1",
        PORT: String(port),
        SANDBOX_PORT: String(sandboxPort),
        DATA_DIR: directory,
        SITE_ORIGIN: origin,
        SANDBOX_ORIGIN: sandbox,
        GOOGLE_CLIENT_ID: "runtime.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET: "runtime-only-test-secret",
      },
    },
  );
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    await rm(directory, { recursive: true, force: true });
  });
  await new Promise((done, reject) => {
    let output = "",
      errors = "";
    const timer = setTimeout(
      () => reject(new Error("Server startup timed out.")),
      15000,
    );
    child.stdout.on("data", (data) => {
      output += data;
      if (output.includes("Isolated player:")) {
        clearTimeout(timer);
        done();
      }
    });
    child.stderr.on("data", (data) => {
      errors += data;
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code) reject(new Error(`Server failed: ${errors.slice(0, 200)}`));
    });
  });
  async function request(
    path,
    {
      player = false,
      host,
      method = "GET",
      body,
      cookie,
      requestOrigin = origin,
    } = {},
  ) {
    return new Promise((done, reject) => {
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port: player ? sandboxPort : port,
          path,
          method,
          headers: {
            Host:
              host || (player ? "player.example.test" : "gallery.example.test"),
            Origin: requestOrigin,
            "Content-Type": "application/json",
            ...(cookie ? { Cookie: cookie } : {}),
          },
        },
        (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => {
            const headers = new Headers();
            for (let index = 0; index < response.rawHeaders.length; index += 2)
              headers.append(
                response.rawHeaders[index],
                response.rawHeaders[index + 1],
              );
            done(
              new Response(Buffer.concat(chunks), {
                status: response.statusCode,
                headers,
              }),
            );
          });
          response.on("error", reject);
        },
      );
      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
  const catalog = await (await request("/api/works")).json();
  assert.equal(catalog.works.length, 7);
  assert.equal(catalog.sandbox_origin, sandbox);
  assert.equal((await request("/", { host: "untrusted.test" })).status, 403);
  assert.equal((await request("//untrusted.test/api/me")).status, 400);
  assert.equal((await request("/.dev.vars")).status, 404);
  assert.equal(
    (
      await request("/api/auth/register", {
        method: "POST",
        body: {},
        requestOrigin: "http://127.0.0.1",
      })
    ).status,
    403,
  );
  const registration = await request("/api/auth/register", {
    method: "POST",
    body: {
      handle: "runtime_user",
      password: "runtime-password-example",
      display_name: "Runtime QA",
    },
  });
  assert.equal(registration.status, 200);
  const cookie = registration.headers.get("set-cookie").split(";")[0];
  assert.match(registration.headers.get("set-cookie"), /; Secure/);
  assert.equal(
    (await (await request("/api/me", { cookie })).json()).user.handle,
    "runtime_user",
  );
  const play = await (
    await request("/api/works/openai-ocean/play", { method: "POST" })
  ).json();
  const url = new URL(play.play_url);
  assert.equal(url.origin, sandbox);
  const demo = await request(url.pathname, { player: true, cookie });
  assert.equal(demo.status, 200);
  assert.match(
    demo.headers.get("content-security-policy"),
    /frame-ancestors https:\/\/gallery\.example\.test/,
  );
  assert.match(await demo.text(), /Ocean Wave Simulation/);
  assert.equal(
    (
      await request(url.pathname, {
        player: true,
        host: "gallery.example.test",
      })
    ).status,
    403,
  );
  const callback = await request("/api/auth/google/callback?state=invalid");
  assert.equal(callback.status, 303);
  assert.equal(
    callback.headers.get("location"),
    origin + "/?auth_error=expired",
  );
  assert.match(callback.headers.get("set-cookie"), /; Secure/);
});
