import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const distRoot = path.join(projectRoot, "dist");
const publicRoot = path.join(distRoot, "public_html");

const filesToCopy = [
  "index.html",
  "engineer.html",
  "styles.css",
  "shared.js",
  "master.js",
  "engineer.js",
  "New Logo.png",
  "thumbnail.png",
  ".htaccess",
  ".env"
];

const dirsToCopy = [
  "Images",
  "json",
  "api"
];

async function copyItem(relativePath) {
  await cp(path.join(projectRoot, relativePath), path.join(publicRoot, relativePath), {
    recursive: true,
    force: true
  });
}

async function main() {
  await rm(distRoot, { recursive: true, force: true });
  await mkdir(publicRoot, { recursive: true });

  for (const file of filesToCopy) {
    await copyItem(file);
  }

  for (const dir of dirsToCopy) {
    await copyItem(dir);
  }

  const callbackDir = path.join(publicRoot, "auth", "callback");
  await mkdir(callbackDir, { recursive: true });
  await cp(
    path.join(projectRoot, "auth", "callback", "index.html"),
    path.join(callbackDir, "index.html"),
    { force: true }
  );

  console.log(`Hostinger build ready at ${publicRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
