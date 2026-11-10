/**
 * Makes a click on a pannable map survive a shaky hand, and lets Ctrl hold the
 * map still.
 *
 * d3-zoom (under react-simple-maps' ZoomableGroup) pans on the very first pixel
 * of movement and, with its default `clickDistance` of 0, swallows the click
 * that ends any press that moved at all. So a click that drifted one pixel
 * nudged the world and never reached the country. react-simple-maps does not
 * expose the zoom behaviour, so `clickDistance` cannot be set; instead this
 * holds back the mouse moves themselves.
 *
 * While the left button is down after a press on the map, moves within
 * `SLOP_PX` of the press are stopped in the window's capture phase - ahead of
 * d3, which attaches its own window listeners only when the press starts, so
 * this one (attached at mount) always runs first. d3 then never sees them: the
 * map stays put, and it never marks the press as moved, so the click goes
 * through. The first move past the slop is let through and d3 lays the map
 * back under the cursor from where the press started, so a real drag loses
 * nothing - it just starts a few pixels late.
 *
 * With Ctrl held at any point in a press, every move of that press is held
 * back: the map does not move at all, and releasing Ctrl mid-press does not
 * make it jump to catch up. (The maps' zoom filters already refuse a press that
 * starts with Ctrl; this also covers Ctrl pressed after the drag began.)
 *
 * Use as a callback ref on the element around the map. It is a module-level
 * function, so React attaches it once rather than on every render.
 */
const SLOP_PX = 8

/**
 * The buttons a map pans with: the primary one, and the middle one held down -
 * which never clicks, so it pans from the first pixel with no slop. No Ctrl:
 * that is the hold-still key. For a ZoomableGroup's `filterZoomEvent`; a wheel
 * or touch event has `button` 0 or none, so it passes.
 */
export function panButton(e: MouseEvent): boolean {
    return !e.ctrlKey && (!e.button || e.button === 1)
}

export function steadyClicks(el: HTMLElement | null): (() => void) | undefined {
    if (!el) return undefined
    let start: { x: number; y: number } | null = null
    let inSlop = false
    let ctrl = false

    const down = (e: MouseEvent) => {
        // Only presses on the map itself - not the zoom buttons laid over it.
        if (!(e.target instanceof Element) || !e.target.closest("svg")) return
        // The middle button pans the map (see `panButton`); without this Windows browsers
        // would also start their own autoscroll, the round icon that scrolls the page.
        if (e.button === 1) e.preventDefault()
        if (e.button !== 0) return
        start = { x: e.clientX, y: e.clientY }
        inSlop = true
        ctrl = e.ctrlKey
    }
    const move = (e: MouseEvent) => {
        if (!start) return
        if ((e.buttons & 1) === 0) {
            // The release happened somewhere we did not hear it.
            start = null
            return
        }
        if (e.ctrlKey) ctrl = true
        if (inSlop && Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP_PX) inSlop = false
        if (inSlop || ctrl) e.stopImmediatePropagation()
    }
    const up = () => { start = null }

    el.addEventListener("mousedown", down, true)
    window.addEventListener("mousemove", move, true)
    window.addEventListener("mouseup", up, true)
    return () => {
        el.removeEventListener("mousedown", down, true)
        window.removeEventListener("mousemove", move, true)
        window.removeEventListener("mouseup", up, true)
    }
}
