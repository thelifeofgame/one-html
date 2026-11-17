import test from "node:test";
import assert from "node:assert/strict";
import { serverConfig } from "../scripts/server-config.mjs";

test("local startup retains separate loopback hostnames", () => {
  const config = serverConfig({});
  assert.equal(config.siteOrigin, "http://127.0.0.1:4391");
  assert.equal(config.sandboxOrigin, "http://localhost:4392");
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.trustProxy, false);
});
const hosted = {
  ONEHTML_SERVER_MODE: "1",
  SITE_ORIGIN: "https://gallery.example.test",
  SANDBOX_ORIGIN: "https://play.example.test",
};
test("server mode uses fixed public origins behind a loopback proxy", () => {
  const config = serverConfig({
    ...hosted,
    HOST: "127.0.0.1",
    TRUST_PROXY: "1",
  });
  assert.equal(config.siteHost, "gallery.example.test");
  assert.equal(config.sandboxHost, "play.example.test");
  assert.equal(config.trustProxy, true);
  assert.throws(
    () => serverConfig({ ...hosted, TRUST_PROXY: "1" }),
    /loopback/,
  );
});
test("server mode rejects shared cookie hosts, malformed origins and mixed content", () => {
  for (const changes of [
    { SITE_ORIGIN: undefined },
    { SITE_ORIGIN: "https://user:pass@example.test" },
    { SITE_ORIGIN: "https://gallery.example.test/path" },
    { SITE_ORIGIN: "https://gallery.example.test/?key=value" },
    { SANDBOX_ORIGIN: "https://gallery.example.test:4392" },
    { SANDBOX_ORIGIN: "http://play.example.test" },
    { PORT: "0" },
    { PORT: "70000" },
    { PORT: "4392", SANDBOX_PORT: "4392" },
  ])
    assert.throws(() => serverConfig({ ...hosted, ...changes }));
});
test("IP preview uses a distinct player hostname", () => {
  const config = serverConfig({
    ONEHTML_SERVER_MODE: "1",
    SITE_ORIGIN: "http://203.0.113.1:4391",
    SANDBOX_ORIGIN: "http://203.0.113.1.sslip.io:4392",
  });
  assert.equal(config.host, "0.0.0.0");
  assert.notEqual(config.siteHost, config.sandboxHost);
});
