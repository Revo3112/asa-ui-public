import { useState } from "react"
import { Button, Input, Label, Switch, TextField, ToggleButton, ToggleButtonGroup } from "@heroui/react"
import { Pencil, Plus, Trash2, Undo2 } from "lucide-react"

import { fullFrame, isAreaActive, newAreaId, type AreaTerlarang, type Point, type ZoneArea } from "@/shared/config/area-terlarang"
import { tr } from "@/shared/lib/i18n"
import { useNow } from "@/shared/lib/time"
import { cn } from "@/shared/lib/utils"

const pts = (p: Point[]) => p.map(([x, y]) => `${x},${y}`).join(" ")

/**
 * The restricted areas drawn over a camera picture. Active areas are filled; one outside its hours
 * is a grey dashed outline. `compact` drops the labels, for thumbnails.
 */
export function AreaOverlay({ area, compact = false, tone = "danger", className }: { area?: AreaTerlarang; compact?: boolean; tone?: "danger" | "accent"; className?: string }) {
  const color = tone === "danger" ? "var(--danger)" : "var(--accent)"
  // Re-checks the hours every minute, so an area switches on at 18.00 without a reload.
  const now = new Date(useNow(60_000))
  if (!area?.areas.length) return null
  return (
    <div className={cn("pointer-events-none absolute inset-0", className)} aria-hidden>
      {area.mode === "seluruh" ? (
        <div className={cn("absolute inset-0 rounded-[inherit] border-dashed", compact ? "border-2" : "border-4", isAreaActive(area.areas[0]!, now) ? (tone === "danger" ? "border-danger bg-danger/10" : "border-accent bg-accent/10") : "border-muted")} />
      ) : (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
          {area.areas.map((a) => {
            const on = isAreaActive(a, now)
            return (
              <polygon
                key={a.id}
                points={pts(a.points)}
                fill={on ? color : "transparent"}
                fillOpacity={0.18}
                stroke={on ? color : "var(--muted)"}
                strokeWidth={compact ? 1.5 : 2.5}
                strokeDasharray={on ? undefined : "6 4"}
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
        </svg>
      )}
      {!compact &&
        area.areas.map((a) => {
          const on = isAreaActive(a, now)
          // The label sits at the area's top-left corner; whole-frame areas label the top right, clear of the camera name.
          const [x, y] = area.mode === "seluruh" ? [100, 0] : [Math.min(...a.points.map((p) => p[0])), Math.min(...a.points.map((p) => p[1]))]
          return (
            <span
              key={a.id}
              className={cn("absolute rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", on ? (tone === "danger" ? "bg-danger text-danger-foreground" : "bg-accent text-accent-foreground") : "bg-black/60 text-white")}
              style={area.mode === "seluruh" ? { right: 8, top: 48 } : { left: `${x}%`, top: `${y}%`, transform: "translateY(-110%)" }}
            >
              {a.nama}
              {a.jam && ` · ${a.jam.mulai}–${a.jam.selesai}`}
              {!on && tr(" (nonaktif)", " (inactive)")}
            </span>
          )
        })}
    </div>
  )
}

function AreaFields({ a, onChange, onRemove, readOnly, hoursLabel }: { a: ZoneArea; onChange: (a: ZoneArea) => void; onRemove?: () => void; readOnly: boolean; hoursLabel: string }) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <TextField value={a.nama} onChange={(nama) => onChange({ ...a, nama })} isReadOnly={readOnly} isRequired>
        <Label>{tr("Nama area", "Area name")}</Label>
        <Input placeholder={tr("Mis. Sekitar Tangki 2", "E.g. Around Tank 2")} />
      </TextField>
      <div className="flex flex-wrap items-end gap-3">
        <Switch isSelected={!!a.jam} isDisabled={readOnly} onChange={(on) => onChange({ ...a, jam: on ? { mulai: "18:00", selesai: "06:00" } : undefined })}>
          <Switch.Content className="flex-row items-center gap-2">
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Label className="text-sm">{hoursLabel}</Label>
          </Switch.Content>
        </Switch>
        {a.jam && (
          <div className="flex items-center gap-2 text-sm">
            {(["mulai", "selesai"] as const).map((k, i) => (
              <label key={k} className="flex items-center gap-1.5">
                <span className="text-muted">{i ? tr("sampai", "to") : tr("dari", "from")}</span>
                <input
                  type="time"
                  value={a.jam![k]}
                  disabled={readOnly}
                  onChange={(e) => onChange({ ...a, jam: { ...a.jam!, [k]: e.target.value } })}
                  className="rounded-lg border border-border bg-field px-2 py-1 tabular-nums"
                />
              </label>
            ))}
          </div>
        )}
        {onRemove && !readOnly && (
          <Button size="sm" variant="tertiary" className="ms-auto" onPress={onRemove}>
            <Trash2 aria-hidden />
            {tr("Hapus area", "Remove area")}
          </Button>
        )}
      </div>
    </li>
  )
}

/**
 * Sets a camera's restricted areas: the whole frame with one switch, or shapes clicked point by
 * point on a still from the camera. Used in the camera form and from the Restricted Zone page.
 */
export function AreaEditor({ value, onChange, src, readOnly = false, kind = "terlarang" }: { value?: AreaTerlarang; onChange: (v: AreaTerlarang) => void; src?: string; readOnly?: boolean; kind?: "terlarang" | "acuan" }) {
  const title = kind === "acuan" ? tr("Area acuan", "Reference areas") : tr("Area terlarang", "Restricted areas")
  const hoursLabel = kind === "acuan" ? tr("Hanya diperiksa jam tertentu", "Checked at certain hours only") : tr("Hanya jam tertentu", "Certain hours only")
  const area: AreaTerlarang = value ?? { mode: "area", areas: [] }
  const [drawing, setDrawing] = useState<Point[] | null>(null)

  const setMode = (mode: AreaTerlarang["mode"]) => {
    setDrawing(null)
    if (mode === area.mode) return
    onChange(mode === "seluruh" ? { mode, areas: [{ id: newAreaId(), nama: tr("Seluruh area kamera", "Whole camera view"), points: fullFrame, jam: area.areas[0]?.jam }] } : { mode, areas: [] })
  }
  const update = (a: ZoneArea) => onChange({ ...area, areas: area.areas.map((x) => (x.id === a.id ? a : x)) })
  const finish = () => {
    if (!drawing || drawing.length < 3) return
    onChange({ ...area, areas: [...area.areas, { id: newAreaId(), nama: tr(`Area ${area.areas.length + 1}`, `Area ${area.areas.length + 1}`), points: drawing }] })
    setDrawing(null)
  }
  const addPoint = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawing) return
    const r = e.currentTarget.getBoundingClientRect()
    const p: Point = [Math.round(((e.clientX - r.left) / r.width) * 1000) / 10, Math.round(((e.clientY - r.top) / r.height) * 1000) / 10]
    setDrawing([...drawing, p])
  }

  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        {kind === "acuan" && <p className="text-xs text-muted">{tr("Gambar tumpukan atau rak yang harus tetap. Gambar kamera saat ini dipakai sebagai acuan.", "Draw the stacks or racks that should stay put. The camera's current picture is used as the reference.")}</p>}
        <ToggleButtonGroup aria-label={tr("Cara menentukan area", "How the area is set")} size="sm" selectionMode="single" disallowEmptySelection selectedKeys={[area.mode]} onSelectionChange={(k) => setMode([...k][0] as AreaTerlarang["mode"])} isDisabled={readOnly}>
          <ToggleButton id="seluruh">{tr("Seluruh gambar kamera", "Whole camera view")}</ToggleButton>
          <ToggleButton id="area">
            <ToggleButtonGroup.Separator />
            {tr("Gambar area", "Draw areas")}
          </ToggleButton>
        </ToggleButtonGroup>
      </div>

      <div className={cn("relative aspect-video overflow-hidden rounded-lg bg-black select-none", drawing && "cursor-crosshair ring-2 ring-accent")} onClick={addPoint}>
        {src && <video src={`${src}#t=2`} preload="metadata" muted playsInline aria-hidden className="size-full object-cover" />}
        <AreaOverlay area={area} tone={kind === "acuan" ? "accent" : "danger"} />
        {drawing && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden>
            <polyline points={pts(drawing)} fill="var(--accent)" fillOpacity={0.15} stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            {drawing.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={0.9} fill="white" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
        )}
        {drawing && <p className="pointer-events-none absolute inset-x-2 bottom-2 rounded-md bg-black/70 px-2 py-1 text-center text-xs text-white">{tr("Klik untuk menambah titik. Minimal 3 titik.", "Click to add points. At least 3.")}</p>}
      </div>

      {area.mode === "area" && !readOnly && (
        <div className="flex flex-wrap gap-2">
          {drawing ? (
            <>
              <Button size="sm" onPress={finish} isDisabled={drawing.length < 3}>
                {tr(`Selesai (${drawing.length} titik)`, `Done (${drawing.length} points)`)}
              </Button>
              <Button size="sm" variant="secondary" onPress={() => setDrawing(drawing.slice(0, -1))} isDisabled={!drawing.length}>
                <Undo2 aria-hidden />
                {tr("Hapus titik terakhir", "Undo point")}
              </Button>
              <Button size="sm" variant="tertiary" onPress={() => setDrawing(null)}>
                {tr("Batal", "Cancel")}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onPress={() => setDrawing([])}>
              {area.areas.length ? <Plus aria-hidden /> : <Pencil aria-hidden />}
              {area.areas.length ? tr("Tambah area", "Add area") : tr("Gambar area", "Draw an area")}
            </Button>
          )}
        </div>
      )}

      {area.areas.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {area.areas.map((a) => (
            <AreaFields key={a.id} a={a} readOnly={readOnly} hoursLabel={hoursLabel} onChange={update} onRemove={area.mode === "area" ? () => onChange({ ...area, areas: area.areas.filter((x) => x.id !== a.id) }) : undefined} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{tr("Belum ada area. Gambar satu, atau pilih seluruh gambar kamera.", "No area yet. Draw one, or pick the whole camera view.")}</p>
      )}
    </section>
  )
}
