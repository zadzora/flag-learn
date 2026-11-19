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

/**
 * Every flag SVG as one module: `{ ad: "<svg ...>", ... }`.
 *
 * Road Trip and the Daily Rally draw every country's flag, and fetched one file
 * each that was ~200 CDN requests per visit (and again whenever the browser's
 * copy went stale). Imported dynamically, this becomes one lazy chunk under
 * /assets/ - one request, named by its content hash, cached for a year.
 * Built from public/flags at build time, so it can never fall behind the files.
 */
function flagPack(): Plugin {
  const id = 'virtual:flag-pack'
  let dir = ''
  return {
    name: 'flag-pack',
    configResolved(config) {
      dir = path.join(config.publicDir, 'flags')
    },
    resolveId: source => (source === id ? '\0' + id : undefined),
    load(source) {
      if (source !== '\0' + id) return
      const pack: Record<string, string> = {}
      for (const name of readdirSync(dir)) {
        if (!name.endsWith('.svg')) continue
        this.addWatchFile(path.join(dir, name))
        pack[name.slice(0, -4)] = readFileSync(path.join(dir, name), 'utf8')
      }
      return `export default ${JSON.stringify(pack)}`
    },
  }
}

/**
 * The dev-only trivia question editor's back end (/__trivia/*, page at
 * /dev/trivia): reads and writes data/trivia/*.json and the review queue in
 * .trivia-editor/. `apply: 'serve'` keeps it out of every build, so the live
 * site has no such endpoint. It is loaded through Vite's own module graph
 * (`ssrLoadModule`) on each request, not with a plain import: Node keeps an
 * imported module for the life of the process, so after an edit to
 * scripts/trivia-*.mjs - even across Vite's own restarts - the old code kept
 * answering. Vite re-evaluates the module once any of those files changes.
 */
function triviaEditor(): Plugin {
  return {
    name: 'trivia-editor',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/__trivia/')) return next()
        server.ssrLoadModule('/scripts/trivia-editor-server.mjs').then(
          mod => mod.triviaEditor()(req, res, next),
          error => next(error),
        )
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), assetVersions(), flagPack(), triviaEditor()],
  // The payment functions in api/ run on Vercel; locally `npm run webhook:dev` serves them on 8787.
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: {
    rollupOptions: {
      output: {
        // The lazily loaded chunks (World Trivia's question packs) live under
        // their own prefix. Before `/assets/` was left out of the SPA rewrite,
        // a missing chunk came back as index.html cached `immutable` for a
        // year, and some browsers kept that page under the packs' real URLs -
        // where a hard reload does not reach, since the import happens after
        // load. New URLs are the only cure for a cache like that. If it ever
        // happens again, bump the prefix.
        chunkFileNames: 'assets/q2-[name]-[hash].js',
      },
    },
  },
})
