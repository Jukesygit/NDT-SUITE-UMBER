#!/usr/bin/env node
/**
 * Bundle-analysis guard for the loginless client-share page.
 *
 * The design (docs/plans/2026-08-17-client-sharing-design.md, "Invariants")
 * requires that the `/share/:token` chunk's import graph contain no auth code
 * and no editor code, and says so is "enforceable by a bundle-analysis check".
 * This is that check. Run it after `npm run build`:
 *
 *     npm run build && npm run verify:share-chunk
 *
 * WHAT IT CAN AND CANNOT PROVE
 * ----------------------------
 * It walks the STATIC import closure of the ClientSharePage chunk and fails if
 * anything forbidden appears in it.
 *
 * It deliberately does NOT follow the edge into the SPA entry chunk
 * (`index-*`). Every route in a single-entry SPA loads the entry — it boots the
 * router — and the entry contains auth. The share page takes only the JSX
 * runtime from it. Making the client page genuinely free of the app shell would
 * need its own HTML entry point, which is a bigger change than the design asks
 * for; until then, this check enforces the part that IS enforceable: the share
 * page's own subtree pulls in nothing it shouldn't.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ASSETS = join(process.cwd(), 'dist', 'assets');

/** Chunk-name fragments that must never appear in the share page's closure. */
const FORBIDDEN = [
  { pattern: /^VesselModeler-/, why: 'the modeler (editor code)' },
  { pattern: /^supabase-vendor-/, why: 'supabase-js (auth + database client)' },
  { pattern: /auth/i, why: 'auth code' },
  { pattern: /^DrawingImportModal-/, why: 'the GA import editor' },
  { pattern: /^interaction-manager/, why: 'the edit-coupled interaction manager' },
];

/** The entry chunk: shared by every route, deliberately not followed. See above. */
const ENTRY = /^index-[^.]+\.js$/;

function staticImports(file) {
  if (!file.endsWith('.js')) return [];
  const source = readFileSync(join(ASSETS, file), 'utf8');
  const pattern = /(?:^|[;}\s])(?:import|export)[^;]*?from"\.\/([^"]+)"/g;
  const out = new Set();
  let match;
  while ((match = pattern.exec(source)) !== null) out.add(match[1]);
  return [...out];
}

function main() {
  let files;
  try {
    files = readdirSync(ASSETS);
  } catch {
    console.error('No dist/assets — run `npm run build` first.');
    process.exit(2);
  }

  const entry = files.find((f) => f.startsWith('ClientSharePage-') && f.endsWith('.js'));
  if (!entry) {
    console.error('No ClientSharePage chunk in the build. Did the /share route survive?');
    process.exit(2);
  }

  const seen = new Set([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    for (const dep of staticImports(file)) {
      if (seen.has(dep) || ENTRY.test(dep)) continue;
      seen.add(dep);
      queue.push(dep);
    }
  }

  const violations = [];
  for (const chunk of seen) {
    for (const { pattern, why } of FORBIDDEN) {
      if (pattern.test(chunk)) violations.push(`${chunk} — ${why}`);
    }
  }

  console.log(`share chunk: ${entry}`);
  console.log(`static closure: ${seen.size} chunks (entry chunk excluded by design)`);

  if (violations.length > 0) {
    console.error('\nFORBIDDEN IMPORTS in the loginless client page:');
    for (const violation of violations) console.error(`  ${violation}`);
    console.error('\nThe /share page must not reach auth or editor code. See the design doc.');
    process.exit(1);
  }

  console.log('OK — no auth or editor code in the client-share page closure.');
}

main();
