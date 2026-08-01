#!/usr/bin/env node
/**
 * Copies packages/shared → apps/server/vendor/shared so Railway can build
 * apps/server in isolation (Root Directory = apps/server) without publishing
 * the private workspace package to npm.
 *
 * Source of truth remains packages/shared. Run after editing shared types:
 *   node apps/server/scripts/sync-shared.js
 */
const fs = require('fs')
const path = require('path')

const serverRoot = path.join(__dirname, '..')
const monorepoShared = path.resolve(serverRoot, '../../packages/shared')
const vendorShared = path.join(serverRoot, 'vendor/shared')

if (!fs.existsSync(monorepoShared)) {
  // On Railway the monorepo package is outside the build context — keep vendored copy.
  console.log('packages/shared not found; using existing vendor/shared')
  process.exit(0)
}

fs.rmSync(vendorShared, { recursive: true, force: true })
fs.mkdirSync(path.join(vendorShared, 'src'), { recursive: true })
fs.copyFileSync(
  path.join(monorepoShared, 'package.json'),
  path.join(vendorShared, 'package.json'),
)
for (const file of fs.readdirSync(path.join(monorepoShared, 'src'))) {
  if (!file.endsWith('.ts')) continue
  fs.copyFileSync(
    path.join(monorepoShared, 'src', file),
    path.join(vendorShared, 'src', file),
  )
}
console.log('Synced packages/shared → apps/server/vendor/shared')
