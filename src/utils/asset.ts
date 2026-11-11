import versions from "virtual:asset-versions"

/**
 * The URL of a file in public/, with `?v=<content hash>` appended (see the
 * asset-versions plugin in vite.config.ts). vercel.json caches versioned URLs
 * for a year, so a returning player never asks for them again - and because
 * the hash follows the file's content, replacing a picture still reaches
 * everyone on the next deploy.
 *
 * Every reference to a file in public/ (except flags/ and us_states/) should go
 * through here. A path the table does not know is returned unchanged.
 */
export function asset(path: string): string {
    const v = (versions as Record<string, string>)[path]
    if (!v) {
        if (import.meta.env.DEV) console.warn(`asset(): no file public${path}`)
        return path
    }
    return `${path}?v=${v}`
}
