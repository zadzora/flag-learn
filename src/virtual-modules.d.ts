declare module "virtual:asset-versions" {
    /** Public path ("/badges/x.webp") to a short content hash. */
    const versions: Record<string, string>
    export default versions
}

declare module "virtual:flag-pack" {
    /** Flag code ("ad") to the text of public/flags/<code>.svg. */
    const pack: Record<string, string>
    export default pack
}
