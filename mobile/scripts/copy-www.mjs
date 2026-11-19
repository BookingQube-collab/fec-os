/** Ensures mobile/www exists for `npx cap sync` when CAPACITOR_SERVER_URL loads remote UI. */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const www = join(root, "www");
const index = join(www, "index.html");
mkdirSync(www, { recursive: true });
if (!existsSync(index)) {
  writeFileSync(
    index,
    `<!doctype html><html><body><p>FEC Call Center shell</p></body></html>\n`,
    "utf8",
  );
}
console.log("www ready:", www);
