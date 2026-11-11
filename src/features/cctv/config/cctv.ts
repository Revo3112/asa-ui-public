/** Tiles per page. Each one is a live player, so 16 is the cap. */
export const LAYOUTS = [1, 4, 9, 16] as const
export type Layout = (typeof LAYOUTS)[number]
export const DEFAULT_LAYOUT: Layout = 9

/** Move cameras with an active event to the top of the grid. */
export const PRIORITIZE_ALERTS = true

/** How long an event stays highlighted on its tile unless dismissed first. */
export const HIGHLIGHT_MS = 30_000

/** Page change interval while the wall is fullscreen. */
export const ROTATE_MS = 20_000

/** Hide the cursor after this long without mouse movement in fullscreen. */
export const CURSOR_IDLE_MS = 3_000
