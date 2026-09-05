/**
 * Start the WebSocket server whether Railway's Root Directory is the
 * repo root or apps/server. `node dist/index.js` from the wrong cwd is a
 * silent crash loop → 502 on the public domain.
 */
const fs = require('fs')
const path = require('path')

const candidates = [
  path.join(process.cwd(), 'dist/index.js'),
  path.join(process.cwd(), 'apps/server/dist/index.js'),
  path.resolve(__dirname, '../dist/index.js'),
]

const entry = candidates.find((file) => fs.existsSync(file))
if (!entry) {
  console.error('[start] dist/index.js not found')
  console.error('[start] cwd=', process.cwd())
  console.error('[start] tried=', candidates)
  process.exit(1)
}

console.log('[start] cwd=', process.cwd(), 'entry=', entry, 'PORT=', process.env.PORT || '(unset)')
require(entry)
