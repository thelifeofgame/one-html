export function serverConfig(env = process.env) {
  const serverMode = env.ONEHTML_SERVER_MODE === "1";
  const port = Number(env.PORT || 4391);
  const sandboxPort = Number(env.SANDBOX_PORT || port + 1);
  if (
    ![port, sandboxPort].every(
      (value) => Number.isInteger(value) && value > 0 && value <= 65535,
    ) ||
    port === sandboxPort
  )
    throw new Error("Choose two different valid ports.");
  function origin(value, name) {
    try {
      const url = new URL(value);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        throw new Error();
      return url;
    } catch {
      throw new Error(
        `${name} must be an http:// or https:// origin without a path.`,
      );
    }
  }
  const site = origin(
    serverMode ? env.SITE_ORIGIN : `http://127.0.0.1:${port}`,
    "SITE_ORIGIN",
  );
  const sandbox = origin(
    serverMode ? env.SANDBOX_ORIGIN : `http://localhost:${sandboxPort}`,
    "SANDBOX_ORIGIN",
  );
  if (site.hostname === sandbox.hostname)
    throw new Error(
      "Website and player must use different hostnames; different ports do not isolate cookies.",
    );
  if (site.protocol !== sandbox.protocol)
    throw new Error("Website and player must use the same protocol.");
  const host = serverMode ? env.HOST || "0.0.0.0" : "127.0.0.1";
  const trustProxy = serverMode && env.TRUST_PROXY === "1";
  if (trustProxy && !["127.0.0.1", "::1"].includes(host))
    throw new Error("TRUST_PROXY requires a loopback-only listener.");
  return {
    serverMode,
    port,
    sandboxPort,
    host,
    trustProxy,
    siteOrigin: site.origin,
    siteHost: site.host,
    sandboxOrigin: sandbox.origin,
    sandboxHost: sandbox.host,
  };
}
