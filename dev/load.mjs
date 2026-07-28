#!/usr/bin/env node
// dev/load.mjs — build a plugin, mount it into the local gateway, hot-reload, smoke-test.
//
//   node dev/load.mjs                          # the root plugin (src/ -> dist/plugin.js)
//   node dev/load.mjs examples/request-mirror  # any example / plugin dir
//
// The plugin's own manifest.json is the source of truth for the hook + handler
// name; this script just rewrites the file path to the mounted location and
// wraps it in a keyless API definition pointed at the local httpbin upstream.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url)); // .../dev/
const repoRoot = resolve(here, '..');

const pluginDir = resolve(process.argv[2] || repoRoot);
const port = process.env.GW_PORT || '8080';
const upstream = process.env.UPSTREAM_URL || 'http://httpbin:8080';
const base = `http://localhost:${port}`;
const CONTAINER_MW_DIR = '/opt/tyk-gateway/middleware';

// --- derive a url-safe slug for the API / staged file -----------------------
let slug;
if (pluginDir === repoRoot) {
  slug = 'plugin';
} else {
  try {
    slug = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8')).name;
  } catch {}
  slug = (slug || basename(pluginDir))
    .toLowerCase()
    .replace(/^tyk-plugin-/, '')
    .replace(/[^a-z0-9-]/g, '-');
}

// --- 1. build -----------------------------------------------------------------
console.log(`▶ building ${pluginDir}`);
execFileSync('npm', ['run', 'build'], { cwd: pluginDir, stdio: 'inherit' });

// --- 2. stage the built bundle into the mounted middleware dir ----------------
const devApps = join(here, 'apps');
const devMw = join(here, 'middleware');
mkdirSync(devApps, { recursive: true });
mkdirSync(devMw, { recursive: true });
const stagedFile = `${slug}.js`;
copyFileSync(join(pluginDir, 'dist', 'plugin.js'), join(devMw, stagedFile));
const containerPath = `${CONTAINER_MW_DIR}/${stagedFile}`;

// --- 3. translate the plugin manifest into an API definition ------------------
const manifest = JSON.parse(readFileSync(join(pluginDir, 'manifest.json'), 'utf8'));
const mcm = manifest.custom_middleware || {};
const HOOKS = ['pre', 'post', 'post_key_auth', 'response'];

const cm = { driver: mcm.driver || 'javascript' };
const loadedHooks = [];
for (const h of HOOKS) {
  if (Array.isArray(mcm[h]) && mcm[h].length) {
    cm[h] = mcm[h].map((e) => ({ ...e, path: containerPath }));
    loadedHooks.push(h);
  }
}
let hasAuth = false;
if (mcm.auth_check && mcm.auth_check.name) {
  cm.auth_check = { ...mcm.auth_check, path: containerPath };
  loadedHooks.push('auth_check');
  hasAuth = true;
}

const apiDef = {
  name: slug,
  api_id: slug,
  org_id: 'default',
  active: true,
  use_keyless: !hasAuth, // an auth_check plugin IS the authenticator
  version_data: {
    not_versioned: true,
    versions: { Default: { name: 'Default', use_extended_paths: true } },
  },
  proxy: { listen_path: `/${slug}/`, target_url: upstream, strip_listen_path: true },
  custom_middleware: cm,
  enable_detailed_recording: true,
};
writeFileSync(join(devApps, `${slug}.json`), JSON.stringify(apiDef, null, 2) + '\n');

// --- 4. reload the running gateway --------------------------------------------
const secret = JSON.parse(readFileSync(join(here, 'tyk.conf'), 'utf8')).secret;

async function waitForReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${base}/hello`);
      if (r.ok) return true;
    } catch {}
    await new Promise((s) => setTimeout(s, 1000));
  }
  return false;
}

console.log(`▶ waiting for gateway at ${base} ...`);
if (!(await waitForReady())) {
  console.error(`✗ gateway not reachable at ${base} — is it up?  (npm run dev:up)`);
  process.exit(1);
}

const reload = await fetch(`${base}/tyk/reload/?block=true`, {
  headers: { 'x-tyk-authorization': secret },
});
if (!reload.ok) {
  console.error(`✗ reload failed: HTTP ${reload.status}`);
  process.exit(1);
}
await new Promise((s) => setTimeout(s, 1000)); // let the async API load settle

// --- 5. smoke test ------------------------------------------------------------
let smoke = null;
try {
  smoke = await fetch(`${base}/${slug}/get`);
} catch {}

console.log('');
console.log(`✓ loaded "${slug}"  hooks: ${loadedHooks.join(', ') || '(none found in manifest)'}`);
console.log(`  upstream: ${upstream}`);
console.log(`  try it:   curl ${base}/${slug}/get`);
if (smoke) console.log(`  smoke:    GET /${slug}/get -> HTTP ${smoke.status}`);
