import { createHash } from "node:crypto";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultDist = path.join(projectRoot, "dist");
const requiredStaticFiles = ["index.html", "manifest.json", "bootstrap.mjs"];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function releaseProvenance() {
  const [upstreamBytes, packageLockBytes, packageBytes] = await Promise.all([
    readFile(path.join(projectRoot, "upstream.lock.json")),
    readFile(path.join(projectRoot, "package-lock.json")),
    readFile(path.join(projectRoot, "package.json")),
  ]);
  const upstream = JSON.parse(upstreamBytes.toString("utf8"));
  const project = JSON.parse(packageBytes.toString("utf8"));
  if (!/^[a-f0-9]{40}$/.test(upstream.commit)) {
    throw new Error("Release provenance requires a pinned 40-character upstream SHA.");
  }
  return {
    schemaVersion: 1,
    project: project.name,
    projectVersion: project.version,
    upstreamRepository: upstream.repository,
    upstreamCommit: upstream.commit,
    upstreamLicenseDeclared: upstream.license,
    upstreamLockSHA256: sha256(upstreamBytes),
    npmLockSHA256: sha256(packageLockBytes),
  };
}

async function enumerateFiles(root) {
  const rootStats = await lstat(root);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error("Release path must be a regular directory.");
  }
  const paths = [];
  async function visit(relative) {
    const absolute = path.join(root, relative);
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      if (/[\r\n\\]/.test(entry.name)) {
        throw new Error("Release filename contains unsafe characters.");
      }
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        throw new Error(`Symlink not allowed in static release: ${child}`);
      }
      if (entry.isDirectory()) {
        await visit(child);
      } else if (entry.isFile()) {
        if (child !== "SHA256SUMS") {
          paths.push(child);
        }
      } else {
        throw new Error(`Unsupported static asset type: ${child}`);
      }
    }
  }
  await visit("");
  paths.sort();
  for (const required of requiredStaticFiles) {
    if (!paths.includes(required)) {
      throw new Error(`Incomplete static release: missing ${required}`);
    }
  }
  return paths;
}

/** Hash every static asset, including NOTICE and provenance; exclude only the hash file itself. */
export async function createReleaseManifest(dist = defaultDist) {
  const files = await enumerateFiles(dist);
  const lines = [];
  for (const relative of files) {
    const content = await readFile(path.join(dist, ...relative.split("/")));
    lines.push(`${sha256(content)}  ${relative}`);
  }
  return `${lines.join("\n")}\n`;
}

export async function prepareRelease(dist = defaultDist) {
  const notice = await readFile(path.join(projectRoot, "docs", "RELEASE-NOTICE.txt"), "utf8");
  const provenance = await releaseProvenance();
  await enumerateFiles(dist);
  await writeFile(path.join(dist, "NOTICE.txt"), notice, "utf8");
  await writeFile(path.join(dist, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);
  await writeFile(path.join(dist, "SHA256SUMS"), await createReleaseManifest(dist));
}

export async function verifyRelease(dist = defaultDist) {
  const actual = await readFile(path.join(dist, "SHA256SUMS"), "utf8");
  const expected = await createReleaseManifest(dist);
  if (actual !== expected) {
    throw new Error("Release SHA256SUMS mismatch: missing, extra or modified static assets.");
  }
  const expectedProvenance = await releaseProvenance();
  const foundProvenance = await readFile(path.join(dist, "provenance.json"), "utf8");
  if (foundProvenance !== `${JSON.stringify(expectedProvenance, null, 2)}\n`) {
    throw new Error("Release provenance differs from checked-in lockfiles.");
  }
  const expectedNotice = await readFile(path.join(projectRoot, "docs", "RELEASE-NOTICE.txt"), "utf8");
  if ((await readFile(path.join(dist, "NOTICE.txt"), "utf8")) !== expectedNotice) {
    throw new Error("Release attribution notice differs from checked-in source.");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  const dist = process.argv[3] ? path.resolve(process.argv[3]) : defaultDist;
  if (command === "prepare") {
    await prepareRelease(dist);
  } else if (command === "verify") {
    await verifyRelease(dist);
  } else {
    throw new Error("Usage: node scripts/release-assets.mjs prepare|verify [dist-directory]");
  }
  console.log(`Static release ${command} succeeded: ${dist}`);
}
