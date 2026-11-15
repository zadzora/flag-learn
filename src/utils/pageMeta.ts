import { useEffect } from "react"

/**
 * A page's own title and description, for search results and browser tabs.
 * The site is one index.html for every route, so without this every page is
 * listed under the home page's title. The previous values come back on leave.
 */
export function usePageMeta(title: string, description?: string) {
    useEffect(() => {
        const before = document.title
        const tag = document.querySelector<HTMLMetaElement>('meta[name="description"]')
        const beforeDescription = tag?.content
        document.title = title
        if (tag && description) tag.content = description
        return () => {
            document.title = before
            if (tag && beforeDescription !== undefined) tag.content = beforeDescription
        }
    }, [title, description])
}
