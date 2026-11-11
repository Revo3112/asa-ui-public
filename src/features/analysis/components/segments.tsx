import { Link } from "react-router"

import type { Seg } from "@/features/analysis/data/analisis"

/**
 * Text with record IDs as links, so every claim can be opened and checked. `onRef` can take a link
 * over in place (the assistant opens indications in its evidence viewer); returning false lets it
 * navigate as usual.
 */
export function Segments({ segs, onRef }: { segs: Seg[]; onRef?: (id: string) => boolean }) {
  return (
    <>
      {segs.map((s, i) =>
        typeof s === "string" ? (
          <span key={i}>{s}</span>
        ) : (
          <Link
            key={i}
            to={s.href}
            className="font-medium text-link underline-offset-2 hover:underline"
            onClick={(e) => {
              if (!onRef || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
              if (onRef(s.id)) e.preventDefault()
            }}
          >
            {s.id}
          </Link>
        ),
      )}
    </>
  )
}
