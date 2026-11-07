#!/usr/bin/env node
/*
 * Fork release: <upstream version>.<fork revision>
 *
 *   2.1.28    upstream 2.1.28 + the custom harmonization (first release on that base)
 *   2.1.28.1  a fix in this fork on the same base
 *   2.1.29    after syncing to upstream 2.1.29 (revision back to 0)
 *
 * package.json keeps the upstream version (npm only accepts semver, and it keeps syncs
 * conflict-free); the fork revision only lives in the git tag / GitHub release, which is what
 * HACS and the HA Marketplace show and offer as an update.
 *
 * Usage:
 *   npm run release:fork                 # plan, ask, then build + push + release
 *   npm run release:fork -- --dry-run    # only show what would happen
 *   npm run release:fork -- --yes        # no confirmation prompt
 *   npm run release:fork -- --notes "Fix: …"   # release notes (default: commits since the last release)
 *
 * Needs: a clean working tree on the release branch, `gh` logged in. Never force-pushes.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const BRANCH = "harmonize-custom-colors";
const DIST = "dist/material-you-utilities.min.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const yes = args.includes("--yes");
const notesArg = args.includes("--notes") ? args[args.indexOf("--notes") + 1] : null;

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const run = (cmd, a) => {
  console.log(`$ ${cmd} ${a.join(" ")}`);
  const r = spawnSync(cmd, a, { stdio: "inherit" });
  if (r.status !== 0) fail(`${cmd} ${a.join(" ")} failed`);
};
function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

// 1. Preconditions
const branch = git("branch", "--show-current");
if (branch !== BRANCH) fail(`on '${branch}', expected '${BRANCH}'`);
if (git("status", "--porcelain")) fail("working tree not clean; commit or discard changes first");
git("fetch", "--quiet", "origin");
const [behind] = git("rev-list", "--left-right", "--count", `origin/${BRANCH}...HEAD`).split(/\s+/).map(Number);
if (behind > 0) fail(`behind origin/${BRANCH} by ${behind} commit(s); pull first`);

// 2. Next version from the tags on GitHub (not local tags: upstream's tags live under upstream/*)
const base = JSON.parse(readFileSync("package.json", "utf8")).version;
if (!/^\d+\.\d+\.\d+$/.test(base)) fail(`package.json version '${base}' is not a plain upstream x.y.z`);
const remoteTags = git("ls-remote", "--tags", "--refs", "origin")
  .split("\n").map((l) => l.split("refs/tags/")[1]).filter(Boolean);
const escaped = base.replace(/\./g, "\\.");
const onBase = remoteTags.filter((t) => new RegExp(`^${escaped}(\\.\\d+)?$`).test(t));
const revision = onBase.length === 0 ? 0 : Math.max(...onBase.map((t) => Number(t.split(".")[3] ?? 0))) + 1;
const version = revision === 0 ? base : `${base}.${revision}`;

// Previous fork release (for the default notes): highest tag of the x.y.z(.n) form
const vkey = (t) => t.split(".").map(Number).concat([0]).slice(0, 4);
const cmp = (a, b) => { const x = vkey(a), y = vkey(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const previous = remoteTags.filter((t) => /^\d+\.\d+\.\d+(\.\d+)?$/.test(t)).sort(cmp).pop();

console.log(`Upstream base : ${base}`);
console.log(`Last release  : ${previous ?? "(none)"}`);
console.log(`Next release  : ${version}${revision ? `  (fork revision ${revision})` : "  (first release on this upstream version)"}`);
if (remoteTags.includes(version)) fail(`tag ${version} already exists on origin`);

if (dryRun) {
  console.log("\n--dry-run: nothing built, pushed or released.");
  process.exit(0);
}
if (!yes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`\nBuild, push ${BRANCH} and release ${version}? [y/N] `)).trim().toLowerCase();
  rl.close();
  if (answer !== "y" && answer !== "yes") fail("cancelled");
}

// 3. Lint + build; commit the rebuilt bundle if it changed
run("npm", ["run", "lint"]);
if (git("status", "--porcelain").split("\n").some((l) => l && !l.endsWith(DIST)))
  fail("lint changed source files; review and commit them, then run again");
run("npm", ["run", "build"]);
if (git("status", "--porcelain", "--", DIST)) {
  run("git", ["add", DIST]);
  run("git", ["commit", "-m", `build: dist for ${version}`]);
}

// 4. Push (never forced) and release from the exact commit
run("git", ["push", "origin", `HEAD:${BRANCH}`]);
const sha = git("rev-parse", "HEAD");
const notes = notesArg ?? (() => {
  const range = previous ? `${previous}..HEAD` : "HEAD~5..HEAD";
  let log = "";
  try { log = git("log", "--no-merges", "--format=- %s", range); } catch { /* tag not local */ }
  return `Upstream Nerwyn/material-you-utilities ${base} + json_file custom color harmonization.\n\n${log}`.trim();
})();
run("gh", ["release", "create", version, "--target", sha, "--title", `${version} - custom harmonization`, "--notes", notes]);

console.log(`\n✓ Released ${version} (${sha.slice(0, 7)}). In HA: Marketplace → this repo → "Refresh information" to see it.`);
