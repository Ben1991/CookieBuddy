import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDir = join(root, "artifacts");
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const packageName = `cookiebuddy-${manifest.version}`;
const stageDir = join(artifactsDir, `.${packageName}-stage`);
const zipPath = join(artifactsDir, `${packageName}.zip`);

const files = [
  "manifest.json",
  "popup.html",
  "details.html",
  "src",
  "_locales",
  "assets/logo-v2-16.png",
  "assets/logo-v2-32.png",
  "assets/logo-v2-48.png",
  "assets/logo-v2-128.png"
];

async function collectStageFiles(currentDir, baseDir = currentDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const path = join(currentDir, entry.name);
    if (entry.isDirectory()) result.push(...await collectStageFiles(path, baseDir));
    else result.push(relative(baseDir, path).split(sep).join("/"));
  }
  return result;
}

await rm(stageDir, { recursive: true, force: true });
await rm(zipPath, { force: true });
await mkdir(stageDir, { recursive: true });

for (const entry of files) {
  const source = join(root, entry);
  const destination = join(stageDir, entry);
  const sourceStat = await stat(source);
  if (sourceStat.isDirectory()) {
    await cp(source, destination, { recursive: true });
  } else {
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination);
  }
}

const stagedManifest = JSON.parse(await readFile(join(stageDir, "manifest.json"), "utf8"));
assert.equal(stagedManifest.manifest_version, 3, "store package must use Manifest V3");
assert.match(stagedManifest.version, /^\d+(?:\.\d+){1,3}$/, "manifest version must be numeric");
assert.ok(stagedManifest.icons?.["128"], "manifest must declare a 128px icon");
assert.ok(stagedManifest.homepage_url, "manifest must declare a public homepage");

for (const locale of ["en", "de"]) {
  const messages = JSON.parse(await readFile(join(stageDir, "_locales", locale, "messages.json"), "utf8"));
  const description = messages.extensionDescription?.message;
  assert.ok(description, `${locale} extension description is required`);
  assert.ok(description.length <= 132, `${locale} extension description must be 132 characters or fewer`);
}

const stageFiles = (await collectStageFiles(stageDir)).sort();
assert.ok(stageFiles.includes("manifest.json"), "manifest must be at the ZIP root");
assert.ok(!stageFiles.some((file) => /(?:node_modules|tests|docs|\.git|package-lock\.json)/.test(file)), "development-only files must not enter the store package");

if (process.platform === "win32") {
  execFileSync("tar.exe", ["-a", "-c", "-f", zipPath, "-C", stageDir, "."], { stdio: "inherit" });
} else {
  execFileSync("zip", ["-qr", zipPath, "."], { cwd: stageDir, stdio: "inherit" });
}

const zipStat = await stat(zipPath);
assert.ok(zipStat.size > 0, "store ZIP must not be empty");
const zipListing = execFileSync(process.platform === "win32" ? "tar.exe" : "tar", ["-tf", zipPath], { encoding: "utf8" })
  .split(/\r?\n/)
  .map((entry) => entry.replace(/^\.\//, ""))
  .filter(Boolean);
assert.ok(zipListing.includes("manifest.json"), "ZIP must contain manifest.json at its root");
assert.ok(!zipListing.some((entry) => /(?:node_modules|tests|docs|\.git|package-lock\.json)/.test(entry)), "ZIP must not contain development-only files");
console.log(`Prepared ${zipPath}`);
console.log(`Manifest ${stagedManifest.version}; ${stageFiles.length} packaged files; ${zipStat.size} bytes`);
