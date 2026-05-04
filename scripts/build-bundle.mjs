#!/usr/bin/env node
// Builds a valid Tyk plugin bundle: zip(plugin.js, manifest.json) with manifest.checksum filled in.
//
// The gateway computes md5(concat(file_list[0], file_list[1], ...)) and rejects bundles where
// this value does not match manifest.checksum. The CLI `tyk bundle build` does the same thing;
// this script is the portable, no-gateway-binary version.
//
// Usage:
//   node ../../scripts/build-bundle.mjs
//
// Reads ./manifest.json, ./dist/<file_list[*]>, writes ./dist/manifest.json and ./dist/bundle.zip.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const cwd = process.cwd();
const distDir = resolve(cwd, 'dist');
const manifestSrc = resolve(cwd, 'manifest.json');

if (!existsSync(manifestSrc)) {
  console.error(`✖ ${manifestSrc} not found. Run from a project root with a manifest.json.`);
  process.exit(1);
}
if (!existsSync(distDir)) {
  console.error(`✖ ${distDir} not found. Run \`npm run build\` first to produce the plugin file(s).`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestSrc, 'utf8'));
const fileList = Array.isArray(manifest.file_list) ? manifest.file_list : [];

if (fileList.length === 0) {
  console.error('✖ manifest.file_list is empty. Add the bundled file names webpack produces.');
  process.exit(1);
}

const md5 = createHash('md5');
for (const name of fileList) {
  const filePath = join(distDir, name);
  if (!existsSync(filePath)) {
    console.error(`✖ ${filePath} not found. Did webpack emit the file listed in manifest.file_list?`);
    process.exit(1);
  }
  md5.update(readFileSync(filePath));
}
manifest.checksum = md5.digest('hex');

const outManifest = join(distDir, 'manifest.json');
writeFileSync(outManifest, JSON.stringify(manifest, null, 2));

const outZip = join(distDir, 'bundle.zip');
if (existsSync(outZip)) rmSync(outZip);

const filesToZip = [...fileList, 'manifest.json'].map((f) => `'${f}'`).join(' ');
execSync(`zip -j '${outZip}' ${filesToZip}`, { cwd: distDir, stdio: 'inherit' });

console.log(`✔ dist/bundle.zip — checksum ${manifest.checksum}, ${fileList.length + 1} files`);
