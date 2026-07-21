import { access, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const required = [
  "site/index.html", "site/config.js", "site/.nojekyll", "site/assets/app.js", "site/assets/styles.css",
  "site/templates/social-signals-template.csv", "worker/wrangler.jsonc", "worker/src/index.js",
  "worker/migrations/0001_initial.sql", "worker/migrations/0002_social_signals.sql",
  ".github/workflows/pages.yml", ".github/workflows/worker.yml", "README.md", "QUICK_START.md"
];

for (const file of required) await access(path.join(root, file));
for (const file of [
  "site/assets/app.js", "site/service-worker.js", "worker/src/index.js",
  "worker/src/lib/utils.js", "worker/src/lib/scoring.js", "worker/src/lib/db.js",
  "worker/src/lib/food-taxonomy.js", "worker/src/collectors/google-trends.js", "worker/src/collectors/youtube.js"
]) {
  execFileSync(process.execPath, ["--check", path.join(root, file)], { stdio: "inherit" });
}
const html = await readFile(path.join(root, "site/index.html"), "utf8");
for (const reference of ["./assets/styles.css", "./assets/app.js", "./config.js", "./assets/icon.svg", "socialSignalsBody", "socialAdminToken"]) {
  if (!html.includes(reference)) throw new Error(`Missing HTML reference or element: ${reference}`);
}
console.log(`Validated ${required.length} required files, social inbox elements, and JavaScript syntax.`);
