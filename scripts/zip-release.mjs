// Builds two ZIPs: the Chrome Web Store package and a public source archive.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, rm, readFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);
const releaseDir = "release";
const { version } = JSON.parse(await readFile("manifest.json", "utf8"));
const chromeZip = `${releaseDir}/netab-chrome-webstore.zip`;
const publicZip = `${releaseDir}/netab-public-source.zip`;

const packageFiles = ["manifest.json", "_locales", "assets", "src", "data/links.json", "data/media.json", "media/samples", "LICENSE"];

const publicFiles = [
  ...packageFiles,
  ".github/workflows/ci.yml",
  ".gitignore",
  ".env.example",
  "README.md",
  "PRIVACY.md",
  "STORE_LISTING.md",
  "CHANGELOG.md",
  "package.json",
  "eslint.config.mjs",
  "scripts",
  "tests",
  "data/links.example.json",
  "data/media.example.json",
  "docs",
  "media/.gitkeep",
];

async function zip(outPath, files) {
  await rm(outPath, { force: true });
  await execFileAsync("zip", ["-r", "-q", "-X", outPath, ...files, "-x", "*.DS_Store", "*/.gitkeep", "*.local.json"]);
}

await mkdir(releaseDir, { recursive: true });
await zip(chromeZip, packageFiles);
await zip(publicZip, publicFiles);

console.log(`NeTab ${version}`);
console.log(`Created ${chromeZip}`);
console.log(`Created ${publicZip}`);
