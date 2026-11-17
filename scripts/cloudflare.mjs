import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { resolve } from "node:path";
import { examples } from "../src/seed.js";
import { randomBytes } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const cli = resolve(root, "node_modules/wrangler/bin/wrangler.js");
const production = resolve(root, "wrangler.production.json");
const sandbox = resolve(root, "wrangler.sandbox.production.json");
await mkdir(resolve(root, ".data"), { recursive: true });
const environment = {
  ...process.env,
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_LOG_PATH: resolve(root, ".data/wrangler.log"),
};
function run(
  arguments_,
  { capture = false, allowFailure = false, input } = {},
) {
  const result = spawnSync(process.execPath, [cli, ...arguments_], {
    cwd: root,
    env: environment,
    encoding: "utf8",
    stdio: capture || input !== undefined ? "pipe" : "inherit",
    input,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure)
    throw new Error(
      capture
        ? (
            result.stderr ||
            result.stdout ||
            "Cloudflare command failed."
          ).trim()
        : `Cloudflare command failed: ${arguments_[0]} ${arguments_[1] || ""}`,
    );
  return result;
}
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
async function readConfig(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
async function saveConfig(path, config) {
  await writeFile(path, JSON.stringify(config, null, 2) + "\n");
}
function sql(value) {
  return typeof value === "number"
    ? String(value)
    : "'" + String(value).replaceAll("'", "''") + "'";
}

async function setup() {
  const auth = run(["whoami", "--json"], { capture: true, allowFailure: true });
  if (auth.status !== 0)
    throw new Error(
      "Cloudflare is not signed in. Run npx wrangler login, then npm run cf:setup.",
    );
  if (!(await exists(production)))
    await saveConfig(
      production,
      await readConfig(resolve(root, "wrangler.json")),
    );
  let config = await readConfig(production);
  if (!config.d1_databases[0].database_id) {
    const list = run(["d1", "list", "--json", "--config", production], {
      capture: true,
    });
    const databases = JSON.parse(list.stdout);
    const existing = databases.find(
      (database) => database.name === "onehtml-db",
    );
    if (existing) {
      config.d1_databases[0].database_id = existing.uuid;
      await saveConfig(production, config);
    } else
      run([
        "d1",
        "create",
        "onehtml-db",
        "--binding",
        "DB",
        "--update-config",
        "--config",
        production,
      ]);
  }
  const bucket = run(
    ["r2", "bucket", "create", "onehtml-files", "--config", production],
    { capture: true, allowFailure: true },
  );
  if (
    bucket.status !== 0 &&
    !/already (exists|own)/i.test(bucket.stderr + bucket.stdout)
  )
    throw new Error((bucket.stderr + bucket.stdout).trim());
  run([
    "d1",
    "migrations",
    "apply",
    "onehtml-db",
    "--remote",
    "--config",
    production,
  ]);
  const fields = [
    "id",
    "title",
    "title_zh",
    "description",
    "description_zh",
    "category",
    "credit",
    "license",
    "status",
    "builtin_path",
    "cover",
    "created_at",
  ];
  const seedPath = resolve(root, ".data/cloudflare-seed.sql");
  await writeFile(
    seedPath,
    examples
      .map(
        (work) =>
          `INSERT OR IGNORE INTO works (${fields.join(",")}) VALUES (${fields.map((field) => sql(work[field])).join(",")});`,
      )
      .join("\n"),
  );
  run([
    "d1",
    "execute",
    "onehtml-db",
    "--remote",
    "--file",
    seedPath,
    "--config",
    production,
  ]);
  console.log(
    "Cloudflare storage and example catalog are ready. Run npm run cf:deploy.",
  );
}
async function deploy() {
  if (!(await exists(production)))
    throw new Error("Run npm run cf:setup first.");
  const config = await readConfig(production);
  const base = await readConfig(resolve(root, "wrangler.json"));
  config.main = base.main;
  config.compatibility_date = base.compatibility_date;
  config.assets = base.assets;
  config.observability = base.observability;
  if (!config.d1_databases[0].database_id)
    throw new Error("The D1 database is not ready. Run npm run cf:setup.");
  const playConfig = {
    ...config,
    name: "onehtml-play",
    vars: { DEMO_ONLY: "true" },
    assets: { ...config.assets, run_worker_first: true },
    observability: { enabled: false },
  };
  await saveConfig(sandbox, playConfig);
  const result = run(["deploy", "--config", sandbox], { capture: true });
  const candidates =
    result.stdout.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\b/g) || [];
  const playOrigin =
    config.vars?.SANDBOX_ORIGIN ||
    candidates.find(
      (value) => new URL(value).hostname.split(".")[0] === playConfig.name,
    );
  if (!playOrigin)
    throw new Error(
      "The player deployed, but its URL could not be verified. Check the Cloudflare dashboard before retrying.",
    );
  config.vars = {
    ...config.vars,
    DEMO_ONLY: "false",
    SANDBOX_ORIGIN: playOrigin,
  };
  await saveConfig(production, config);
  run(["deploy", "--config", production]);
  const secrets = [production, sandbox].map((configPath) => {
    const result = run(["secret", "list", "--config", configPath], {
      capture: true,
    });
    return JSON.parse(result.stdout).some(
      (secret) => secret.name === "PLAY_TOKEN_SECRET",
    );
  });
  if (!secrets.every(Boolean)) {
    const secret = randomBytes(48).toString("hex");
    for (const configPath of [production, sandbox])
      run(["secret", "put", "PLAY_TOKEN_SECRET", "--config", configPath], {
        capture: true,
        input: secret + "\n",
      });
  }
  console.log(
    `Isolated player deployed at ${playOrigin}. Register your owner account, then run npm run cf:admin -- <username>.`,
  );
}
async function admin() {
  const handle = process.argv[3];
  if (!/^[a-z0-9_]{3,24}$/.test(handle || ""))
    throw new Error("Usage: npm run cf:admin -- <registered-username>");
  if (!(await exists(production)))
    throw new Error("Run npm run cf:setup first.");
  run([
    "d1",
    "execute",
    "onehtml-db",
    "--remote",
    "--config",
    production,
    "--command",
    `UPDATE users SET role='admin' WHERE handle=${sql(handle)}; SELECT handle,role FROM users WHERE handle=${sql(handle)};`,
  ]);
}
try {
  const action = process.argv[2];
  if (action === "setup") await setup();
  else if (action === "deploy") await deploy();
  else if (action === "admin") await admin();
  else throw new Error("Choose setup, deploy, or admin.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
