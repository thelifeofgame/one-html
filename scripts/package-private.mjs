import {
  cp,
  mkdir,
  readFile,
  writeFile,
  mkdtemp,
  readdir,
  lstat,
  chmod,
  rm,
} from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

process.umask(0o077);
const root = resolve(import.meta.dirname, "..");
const data = process.env.DATA_DIR || resolve(root, ".data");
const stamp = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
})
  .format(new Date())
  .replace(/\D/g, "");
const releaseDir = resolve(root, "releases");
await mkdir(releaseDir, { recursive: true, mode: 0o700 });
const archive = join(releaseDir, `onehtml-private-${stamp}.zip`);
const staging = await mkdtemp(join(tmpdir(), "onehtml-private-package-"));
const output = join(staging, "onehtml");
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--google-client"))
  throw new Error(
    "Usage: npm run package:private -- [--google-client /absolute/path/to/client.json]",
  );
async function copy(source, destination) {
  await cp(source, destination, {
    recursive: true,
    filter: async (file) => {
      if (basename(file) === ".DS_Store") return false;
      if ((await lstat(file)).isSymbolicLink())
        throw new Error("Symbolic links are not included in private packages.");
      return true;
    },
  });
}
async function files(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      result.push(...(await files(join(directory, entry.name), relative)));
    else result.push(relative);
  }
  return result.sort();
}
try {
  await mkdir(output, { mode: 0o700 });
  for (const directory of [
    "src",
    "public",
    "collections",
    "migrations",
    "scripts",
    "tests",
  ])
    await copy(join(root, directory), join(output, directory));
  for (const file of [
    "package.json",
    "package-lock.json",
    ".gitignore",
    "wrangler.json",
    ".dev.vars",
  ])
    await copy(join(root, file), join(output, file));
  await chmod(join(output, ".dev.vars"), 0o600);
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const jose = JSON.parse(
    await readFile(join(root, "node_modules/jose/package.json"), "utf8"),
  );
  if (
    Object.keys(pkg.dependencies).join() !== "jose" ||
    pkg.dependencies.jose !== jose.version
  )
    throw new Error("Runtime dependency bundle does not match package.json.");
  await mkdir(join(output, "node_modules"));
  await copy(
    join(root, "node_modules/jose"),
    join(output, "node_modules/jose"),
  );
  const outputData = join(output, ".data");
  await mkdir(outputData, { mode: 0o700 });
  const sourceDb = new DatabaseSync(join(data, "onehtml.sqlite"));
  try {
    sourceDb.prepare("VACUUM INTO ?").run(join(outputData, "onehtml.sqlite"));
  } finally {
    sourceDb.close();
  }
  await chmod(join(outputData, "onehtml.sqlite"), 0o600);
  await copy(join(data, "objects"), join(outputData, "objects"));
  await copy(join(data, "play-secret"), join(outputData, "play-secret"));
  await chmod(join(outputData, "play-secret"), 0o600);
  if (args.length) {
    const client = JSON.parse(await readFile(resolve(args[1]), "utf8"));
    if (!client.web?.client_id || !client.web?.client_secret)
      throw new Error("Expected a Google Web OAuth client JSON.");
    await mkdir(join(output, "private"), { mode: 0o700 });
    await writeFile(
      join(output, "private/google-client.json"),
      JSON.stringify(client, null, 2) + "\n",
      { mode: 0o600 },
    );
  }
  const snapshot = new DatabaseSync(join(outputData, "onehtml.sqlite"), {
    readOnly: true,
  });
  let counts;
  try {
    if (
      snapshot.prepare("PRAGMA integrity_check").get().integrity_check !== "ok"
    )
      throw new Error("SQLite snapshot integrity check failed.");
    counts = Object.fromEntries(
      [
        "users",
        "auth_identities",
        "works",
        "work_versions",
        "votes",
        "favorites",
        "comments",
      ].map((table) => [
        table,
        snapshot.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,
      ]),
    );
    for (const version of snapshot
      .prepare(
        "SELECT object_key,sha256 FROM work_versions WHERE object_key IS NOT NULL",
      )
      .all()) {
      const bytes = await readFile(
        join(outputData, "objects", version.object_key),
      );
      if (createHash("sha256").update(bytes).digest("hex") !== version.sha256)
        throw new Error("An archived HTML file failed integrity verification.");
    }
  } finally {
    snapshot.close();
  }
  await writeFile(
    join(output, "SERVER-START.txt"),
    `OneHTML 私有服务器迁移包\n\n本包含 Google OAuth 配置、账号数据库、作品文件和播放签名密钥。\n只发送到你自己的服务器；本次不包含 GitHub 上传操作。\n数据库为打包时已提交数据的一致性快照。\n\n运行要求：Node.js 22.5 以上，推荐 Node.js 22 最新补丁版。\n已带上跨平台运行依赖 jose；不包含 macOS 专用开发工具和 Node 可执行文件。\n\n一、暂时用 IP 公开预览\n1. 解压本包并进入 onehtml 目录。\n2. 执行：bash scripts/start-ip.sh 你的服务器IPv4\n3. 防火墙允许 TCP 4391、4392；访问 http://你的服务器IP:4391/\n4. 播放器使用 你的服务器IP.sslip.io:4392，与主站隔离。需能访问 sslip.io DNS。\n5. 此模式是 HTTP 临时预览；不要用它传输私人内容或登录密码。Google 登录在此模式下不可用。\n6. 若需后台运行，可用进程管理器或：nohup bash scripts/start-ip.sh 你的服务器IPv4 > onehtml.log 2>&1 &\n\n二、没有域名也继续使用已配置的 Google 登录（SSH 私有预览）\n1. 在服务器的 onehtml 目录执行：npm run dev\n2. 在自己的电脑关闭占用 4391/4392 的本地 OneHTML。\n3. 在自己的电脑执行：bash scripts/tunnel.sh 用户名@服务器IP\n4. 保持 SSH 终端打开，用浏览器访问 http://127.0.0.1:4391/\n5. 这样两个端口都会转发到服务器，现有 Google 回调地址无需修改。\n\n三、以后改成 HTTPS 域名\n配置两个不同主机名的 SITE_ORIGIN 与 SANDBOX_ORIGIN，再运行 npm start。\nGoogle 控制台需增加 SITE_ORIGIN/api/auth/google/callback 的完整地址。\n反向代理须保留 Host；后端可设置 HOST=127.0.0.1。\n若启用 TRUST_PROXY=1，代理必须覆盖 X-OneHTML-Client-IP，且后端只监听回环地址。\n\n四、数据与维护\n.data/onehtml.sqlite：账号、互动、审核、版本及会话数据。\n.data/objects/：不可变 HTML 版本存档。\n.data/play-secret：播放凭证签名密钥。\n.dev.vars：Google 客户端配置。\nprivate/google-client.json：原始 Google 客户端 JSON（提供时包含）。\n备份和更新时保留 .data 与 .dev.vars；不要覆盖服务器新增的数据。\n开发构建需先 npm ci；普通启动不需要重新构建作品。\n`,
    { mode: 0o600 },
  );
  const entries = [];
  for (const file of await files(output)) {
    const bytes = await readFile(join(output, file));
    entries.push({
      path: file,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  await writeFile(
    join(output, "PRIVATE-PACKAGE.json"),
    JSON.stringify(
      {
        created_at: new Date().toISOString(),
        contains_credentials: true,
        database_counts: counts,
        files: entries,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  const zipped = spawnSync("zip", ["-q", "-r", archive, "onehtml"], {
    cwd: staging,
    encoding: "utf8",
  });
  if (zipped.status !== 0)
    throw new Error("Could not create the private ZIP archive.");
  await chmod(archive, 0o600);
  const bytes = await readFile(archive);
  const digest = createHash("sha256").update(bytes).digest("hex");
  await writeFile(archive + ".sha256", `${digest}  ${basename(archive)}\n`, {
    mode: 0o600,
  });
  console.log(
    JSON.stringify(
      {
        archive,
        bytes: bytes.length,
        sha256: digest,
        files: entries.length,
        database_counts: counts,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(staging, { recursive: true, force: true });
}
