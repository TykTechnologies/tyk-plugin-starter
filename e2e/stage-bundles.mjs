#!/usr/bin/env node
// Stage bundles into e2e/bundles/<slug>.zip with the driver swapped to "otto".
//
// Why the swap: the publicly published Tyk OSS image (tykio/tyk-gateway:v5.x) is
// pre-goja-merge, so it only recognises driver="otto" for the JS engine. Plugin
// code is identical between the two engines (same MiniRequestObject, same TykJS
// prelude, same registered globals), so flipping just the manifest field is
// enough. When the goja branch merges and a public image with driver="javascript"
// support ships, delete this file's swap logic and stage bundles as-is.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(new URL(import.meta.url).pathname);
const root = resolve(here, '..');
const examplesDir = join(root, 'examples');
const outDir = join(here, 'bundles');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const slugs = readdirSync(examplesDir).filter((name) => {
  const p = join(examplesDir, name);
  return statSync(p).isDirectory() && existsSync(join(p, 'dist', 'bundle.zip'));
});

if (slugs.length === 0) {
  console.error('No example bundles found. Run `npm run build:bundle` in each examples/* directory first.');
  process.exit(1);
}

for (const slug of slugs) {
  const src = join(examplesDir, slug, 'dist', 'bundle.zip');
  const stage = join(tmpdir(), `e2e-stage-${slug}-${Date.now()}`);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });

  // Extract
  execSync(`unzip -q -o "${src}" -d "${stage}"`);

  // Bundles ship with driver="javascript" (goja). The e2e gateway is built from
  // the goja branch so the manifest can stay as-is. No swap needed.
  const manifestPath = join(stage, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!manifest.custom_middleware) {
    throw new Error(`${slug}: manifest missing custom_middleware`);
  }

  // Recompute checksum (defensive — bundle.zip already has it, but staging
  // shouldn't trust the upstream checksum if anything else changes).
  const files = manifest.file_list || [];
  const hash = createHash('md5');
  for (const f of files) {
    hash.update(readFileSync(join(stage, f)));
  }
  manifest.checksum = hash.digest('hex');

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Re-zip
  const outZip = join(outDir, `${slug}.zip`);
  rmSync(outZip, { force: true });
  execSync(`cd "${stage}" && zip -q "${outZip}" ${files.join(' ')} manifest.json`);

  // Cleanup stage
  rmSync(stage, { recursive: true, force: true });

  console.log(`✔ ${slug}.zip — driver "${manifest.custom_middleware.driver}", checksum ${manifest.checksum}`);
}

console.log(`\nStaged ${slugs.length} bundle(s) to ${outDir}`);
