import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { googleConfig } from "../src/google-auth.js";

export async function configureGoogle(
  clientFile,
  directory = resolve(import.meta.dirname, ".."),
) {
  const downloaded = JSON.parse(await readFile(resolve(clientFile), "utf8"));
  const client = downloaded.web;
  if (
    !client ||
    typeof client.client_id !== "string" ||
    typeof client.client_secret !== "string" ||
    /[\r\n]/.test(client.client_id + client.client_secret)
  )
    throw new Error(
      "Choose the JSON downloaded for a Web application OAuth client.",
    );
  const path = resolve(directory, ".dev.vars");
  let existing = "";
  try {
    existing = await readFile(path, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const vars = parseEnv(existing);
  const origin = vars.SITE_ORIGIN || "http://127.0.0.1:4391";
  const config = googleConfig({
    GOOGLE_CLIENT_ID: client.client_id,
    GOOGLE_CLIENT_SECRET: client.client_secret,
    SITE_ORIGIN: origin,
  });
  if (!config) throw new Error("The OAuth client or SITE_ORIGIN is invalid.");
  if (!client.redirect_uris?.includes(config.redirectUri))
    throw new Error(
      `Add this exact redirect URI to the Google client, then download its JSON again: ${config.redirectUri}`,
    );
  const preserved = existing
    .replace(
      /^[\t ]*(?:export[\t ]+)?(?:GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|SITE_ORIGIN)[\t ]*=.*\r?\n?/gm,
      "",
    )
    .trimEnd();
  const contents = `${preserved ? preserved + "\n" : ""}GOOGLE_CLIENT_ID=${JSON.stringify(config.clientId)}\nGOOGLE_CLIENT_SECRET=${JSON.stringify(config.clientSecret)}\nSITE_ORIGIN=${JSON.stringify(config.origin)}\n`;
  const temporary = path + "." + crypto.randomUUID();
  try {
    await writeFile(temporary, contents, { flag: "wx", mode: 0o600 });
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  return { path, redirectUri: config.redirectUri };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (!process.argv[2])
      throw new Error(
        "Usage: npm run google:configure -- /absolute/path/to/client_secret.json",
      );
    const result = await configureGoogle(process.argv[2]);
    console.log(
      `Google client saved privately to ${result.path}.\nRedirect URI: ${result.redirectUri}\nRestart npm run dev to enable Google sign-in.`,
    );
  } catch (error) {
    console.error(
      error instanceof SyntaxError
        ? "The selected file is not valid OAuth client JSON."
        : error.code
          ? "Could not read or save the local OAuth configuration."
          : error.message,
    );
    process.exitCode = 1;
  }
}
