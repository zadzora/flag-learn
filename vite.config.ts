import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Content hashes for the files in public/, so they can be cached forever.
 *
 * Vite fingerprints what it bundles (/assets/*), but public/ is copied as-is,
 * and a file whose URL never changes can only be cached briefly - or players
 * keep an old picture after it is replaced. `asset("/badges/x.webp")`
 * (src/utils/asset.ts) appends `?v=<hash of the file>`: the URL changes exactly
 * when the file does, so vercel.json can mark every versioned URL immutable and
 * a browser asks for it once. Each Vercel request counts against the plan.
 *
 * flags/ and us_states/ are left out: their paths are data (flags.json `image`)
 * read in dozens of places, and they keep their own one-week header instead.
 */
const UNVERSIONED = new Set(['flags', 'us_states'])

function hashPublic(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (abs: string, rel: string) => {
    for (const name of readdirSync(abs)) {
      const a = path.join(abs, name)
      const r = `${rel}/${name}`
      if (statSync(a).isDirectory()) {
        if (rel === '' && UNVERSIONED.has(name)) continue
        walk(a, r)
      } else {
        out[r] = createHash('sha256').update(readFileSync(a)).digest('hex').slice(0, 10)
      }
    }
  }
  walk(dir, '')
  return out
}

function assetVersions(): Plugin {
  const id = 'virtual:asset-versions'
  let versions: Record<string, string> = {}
  return {
    name: 'asset-versions',
    configResolved(config) {
      versions = hashPublic(config.publicDir)
    },
    resolveId: source => (source === id ? '\0' + id : undefined),
    load: source => (source === '\0' + id ? `export default ${JSON.stringify(versions)}` : undefined),
    // index.html's own references (favicon) go through the same table.
    transformIndexHtml: html =>
      html.replace(/(href|src)="(\/[^"?#]+)"/g, (m, attr: string, p: string) =>
        versions[p] ? `${attr}="${p}?v=${versions[p]}"` : m),
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), assetVersions()],
})
