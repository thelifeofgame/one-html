import { resolve } from "node:path";
import { openStore } from "./local-store.mjs";

const handle = process.argv[2];
if (!handle) {
  console.error("Usage: npm run admin -- <registered-username>");
  process.exit(1);
}
const store = await openStore(
  process.env.DATA_DIR || resolve(import.meta.dirname, "../.data"),
);
const user = await store.DB.prepare("SELECT id FROM users WHERE handle=?")
  .bind(handle)
  .first();
if (!user) {
  console.error("Register this account on the website first.");
  store.close();
  process.exit(1);
}
await store.DB.prepare("UPDATE users SET role='admin' WHERE id=?")
  .bind(user.id)
  .run();
store.close();
console.log(
  "Administrator access enabled. Refresh the website to open the review desk.",
);
