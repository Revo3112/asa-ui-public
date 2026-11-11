import { useState } from "react"
import { Button, Description, Input, Label, TextField } from "@heroui/react"
import { Play } from "lucide-react"

import { CrudPage, type CrudConfig } from "@/features/admin/components/crud-page"
import { CameraPlayer, type PlayerStatus } from "@/features/cctv/components/camera-player"
import { sensorTypes } from "@/shared/config/lingkungan"
import {
  camerasAt,
  isLastSuperAdmin,
  master,
  newId,
  removedZoneBlocker,
  sensorsAt,
  siteName,
  zoneName,
  zonesOfSite,
  type Kamera,
  type Master,
  type Pengguna,
  type SensorMaster,
  type Shift,
  type Site,
  type Zona,
} from "@/shared/data/master"
import { currentUser, roleLabel, userSites, type Role } from "@/shared/auth/session"
import { overlaps, toMinutes } from "@/shared/lib/shift-time"
import { tr } from "@/shared/lib/i18n"
import { fungsiDefs, fungsiLabel, fungsiOptionLabel } from "@/shared/config/fungsi-kamera"
import { AreaEditor } from "@/features/detection/components/area-terlarang"
import { acuanProblem, areaProblem, usesAcuan, usesRestricted } from "@/shared/config/area-terlarang"

const superAdminOnly = (role: Role) => role === "super-admin"
const admins = (role: Role) => role === "super-admin" || role === "admin-site"
const taken = (rows: { id: string }[], id: string, value: string, of: (r: never) => string) =>
  rows.some(
    (r) =>
      r.id !== id &&
      of(r as never)
        .trim()
        .toLowerCase() === value.trim().toLowerCase(),
  )
const isUrl = (v: string) => /^(https?:\/\/|\/)\S+$/.test(v.trim())
const place = (site: string, zona: string) => `${zoneName(zona)} · ${siteName(site)}`
/** Sites that use the zone, limited to the ones this user may see. */
const usersOfZone = (id: string) => sitesOf(master(), currentUser()).filter((s) => s.zona.includes(id))
/** Active zones, plus inactive ones the site still lists so they can be taken off. */
const zoneOptionsFor = (d: Site) =>
  master()
    .zona.filter((z) => z.aktif || d.zona.includes(z.id))
    .map((z) => ({ id: z.id, label: z.aktif ? z.nama : `${z.nama} (nonaktif)` }))

/** Sites a user's records may sit on. Inactive ones stay listed so old records still show where they are. */
const sitesOf = (m: Master, user: Pengguna | undefined) => (user?.role === "super-admin" ? m.site : m.site.filter((s) => user?.site.includes(s.id)))

/** Kamera and Sensor need a zone in the catalog and a site that has it. */
function missingPlace() {
  if (!master().zona.some((z) => z.aktif))
    return { message: tr("Belum ada zona di katalog. Kamera dan sensor menempel ke zona, jadi buat zonanya dulu.", "The zone catalog is empty. Cameras and sensors attach to a zone, so create the zone first."), to: "/admin/zona", action: tr("Buat zona dulu", "Create a zone first") }
  if (!userSites().some((s) => zonesOfSite(s).length))
    return {
      message: tr("Belum ada site yang punya zona. Kamera dan sensor menempel ke pasangan site dan zona, jadi pilih zona untuk site dulu.", "No site has a zone yet. Cameras and sensors attach to a site and zone pair, so pick zones for a site first."),
      to: "/admin/site",
      action: tr("Buat site dulu", "Create a site first"),
    }
  return null
}

const siteChoices = () => userSites().map((id) => ({ id, label: siteName(id) }))
const zoneChoices = (site: string) => zonesOfSite(site).map((z) => ({ id: z.id, label: z.nama }))
/** A new site keeps the picked zone only if that site has it too. */
const keepZone = <T extends { site: string; zona: string }>(d: T): T => (zonesOfSite(d.site).some((z) => z.id === d.zona) ? d : { ...d, zona: "" })

// ---- Zona ----

const zonaConfig: CrudConfig<Zona> = {
  kind: "zona",
  get noun() { return tr("zona", "zone") },
  get description() { return tr("Katalog area, dibuat sekali lalu dipilih oleh tiap site. Satu zona boleh dipakai beberapa site.", "Area catalog, created once and then picked by each site. One zone can serve several sites.") },
  rows: (m, user) => (user?.role === "super-admin" ? m.zona : m.zona.filter((z) => sitesOf(m, user).some((s) => s.zona.includes(z.id)))),
  columns: [
    { get label() { return tr("Nama", "Name") }, isRowHeader: true, render: (z) => z.nama },
    { get label() { return tr("Kode", "Code") }, render: (z) => <span className="tabular-nums">{z.kode}</span> },
    {
      get label() { return tr("Dipakai di", "Used at") },
      render: (z) =>
        usersOfZone(z.id)
          .map((s) => s.nama)
          .join(", ") || <span className="text-muted">{tr("Belum dipakai site mana pun", "Not used by any site yet")}</span>,
    },
  ],
  fields: [
    { key: "nama", get label() { return tr("Nama", "Name") }, kind: "text", isRequired: true, get placeholder() { return tr("mis. Gudang", "e.g. Warehouse") } },
    { key: "kode", get label() { return tr("Kode", "Code") }, kind: "text", isRequired: true, get placeholder() { return tr("mis. GDG", "e.g. WHS") }, description: () => tr("Unik untuk semua site.", "Unique across all sites.") },
  ],
  blank: () => ({ id: newId("zona"), kode: "", nama: "", aktif: true }),
  title: (z) => z.nama || "baru",
  search: (z) => `${z.nama} ${z.kode}`,
  canEdit: superAdminOnly,
  validate: (d) => ({ kode: taken(master().zona, d.id, d.kode, (r: Zona) => r.kode) ? tr(`Kode ${d.kode.trim()} sudah dipakai zona lain.`, `Code ${d.kode.trim()} is already used by another zone.`) : undefined }),
  extra: (d, set, readOnly) => (
    <>
      <TextField
        type="number"
        value={d.kapasitas?.toString() ?? ""}
        isReadOnly={readOnly}
        onChange={(v) => set({ ...d, kapasitas: v.trim() && Number(v) > 0 ? Math.round(Number(v)) : undefined })}
      >
        <Label>{tr("Kapasitas orang", "People capacity")}</Label>
        <Input inputMode="numeric" min={1} placeholder={tr("mis. 25", "e.g. 25")} />
        <Description>{tr("Batas jumlah orang sekaligus. Hitung orang memberi alarm di atasnya. Kosongkan bila tidak dibatasi.", "How many people may be in at once. People counting alarms above it. Leave empty for no limit.")}</Description>
      </TextField>
      <ZoneImpact zona={d} />
    </>
  ),
}

/** Where the zone is used, so the admin sees the impact before renaming or deactivating it. */
function ZoneImpact({ zona }: { zona: Zona }) {
  const sites = usersOfZone(zona.id)
  if (!sites.length) return <Description>{tr("Belum dipakai site mana pun.", "Not used by any site yet.")}</Description>
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className="font-medium">{tr("Dipakai di", "Used at")}</p>
      <ul className="flex flex-col gap-1 text-muted">
        {sites.map((s) => (
          <li key={s.id}>
            {s.nama}: {camerasAt(s.id, zona.id).length} {tr("kamera", "cameras")}, {sensorsAt(s.id, zona.id).length} {tr("sensor", "sensors")}
          </li>
        ))}
      </ul>
      <Description>{tr("Perubahan nama langsung terlihat di semua site ini.", "A rename shows at all these sites right away.")}</Description>
    </div>
  )
}

export function ZonaAdminPage() {
  return <CrudPage config={zonaConfig} />
}

// ---- Site ----

const timeZones = [
  { id: "Asia/Jakarta", label: "WIB (Asia/Jakarta)" },
  { id: "Asia/Makassar", label: "WITA (Asia/Makassar)" },
  { id: "Asia/Jayapura", label: "WIT (Asia/Jayapura)" },
]

const siteConfig: CrudConfig<Site> = {
  kind: "site",
  noun: "site",
  get description() { return tr("Lokasi kerja beserta zona yang dimilikinya. Zona waktu dipakai untuk shift dan jadwal inspeksi ERT.", "Work locations and the zones they have. The time zone is used for shifts and ERT inspection schedules.") },
  rows: sitesOf,
  columns: [
    { get label() { return tr("Nama", "Name") }, isRowHeader: true, render: (s) => s.nama },
    { get label() { return tr("Kode", "Code") }, render: (s) => s.kode },
    { get label() { return tr("Zona", "Zones") }, render: (s) => s.zona.map(zoneName).join(", ") || <span className="text-muted">{tr("Belum ada", "None yet")}</span> },
    { get label() { return tr("Zona waktu", "Time zone") }, render: (s) => timeZones.find((t) => t.id === s.zonaWaktu)?.label.split(" ")[0] ?? s.zonaWaktu },
  ],
  fields: [
    { key: "nama", get label() { return tr("Nama", "Name") }, kind: "text", isRequired: true, get placeholder() { return tr("mis. Site Cikarang", "e.g. Cikarang Site") } },
    { key: "kode", get label() { return tr("Kode", "Code") }, kind: "text", isRequired: true, get placeholder() { return tr("mis. CKR", "e.g. CKR") }, description: () => tr("Dipakai di nomor event dan kode peralatan.", "Used in event numbers and equipment codes.") },
    { key: "alamat", get label() { return tr("Alamat", "Address") }, kind: "textarea" },
    { key: "zonaWaktu", get label() { return tr("Zona waktu", "Time zone") }, kind: "select", isRequired: true, options: () => timeZones },
    {
      key: "zona",
      get label() { return tr("Zona", "Zones") },
      kind: "multiselect",
      isRequired: true,
      options: (d) => zoneOptionsFor(d),
      description: () => tr("Pilih dari katalog. Zona baru dibuat di menu Zona.", "Pick from the catalog. New zones are created in the Zones menu."),
    },
  ],
  blank: () => ({ id: newId("site"), kode: "", nama: "", alamat: "", zonaWaktu: "Asia/Jakarta", zona: [], aktif: true }),
  title: (s) => s.nama || "baru",
  search: (s) => `${s.nama} ${s.kode} ${s.alamat}`,
  canEdit: superAdminOnly,
  validate: (d) => ({ kode: taken(master().site, d.id, d.kode, (r: Site) => r.kode) ? tr(`Kode ${d.kode.trim()} sudah dipakai site lain.`, `Code ${d.kode.trim()} is already used by another site.`) : undefined }),
  saveBlocker: (d, isNew) => (isNew ? undefined : removedZoneBlocker(d.id, d.zona)),
  missingParent: () =>
    master().zona.some((z) => z.aktif)
      ? null
      : { message: tr("Katalog zona masih kosong. Site memilih zona dari katalog, jadi buat zonanya dulu.", "The zone catalog is empty. Sites pick zones from it, so create the zones first."), to: "/admin/zona", action: tr("Buat zona dulu", "Create a zone first") },
}

export function SiteAdminPage() {
  return <CrudPage config={siteConfig} />
}

// ---- Kamera ----

const streamTypes = [
  { id: "video/mp4", label: "MP4" },
  { id: "application/x-mpegURL", label: "HLS (.m3u8)" },
]

const kameraConfig: CrudConfig<Kamera> = {
  kind: "kamera",
  get noun() { return tr("kamera", "camera") },
  get description() { return tr("Kamera menempel ke satu pasangan site dan zona. Kamera nonaktif hilang dari Monitor CCTV.", "A camera attaches to one site and zone pair. Inactive cameras disappear from the CCTV Monitor.") },
  rows: (m, user) => m.kamera.filter((k) => sitesOf(m, user).some((s) => s.id === k.site)),
  columns: [
    { get label() { return tr("Kode", "Code") }, isRowHeader: true, render: (k) => <span className="tabular-nums">{k.id}</span> },
    { get label() { return tr("Nama", "Name") }, render: (k) => k.nama },
    { get label() { return tr("Lokasi", "Location") }, render: (k) => place(k.site, k.zona) },
    { get label() { return tr("Fungsi", "Functions") }, render: (k) => <FungsiList ids={k.fungsi ?? []} /> },
    { label: "Stream", render: (k) => streamTypes.find((t) => t.id === k.streamType)?.label ?? k.streamType },
  ],
  fields: [
    {
      key: "id",
      get label() { return tr("Kode", "Code") },
      kind: "text",
      isRequired: true,
      get placeholder() { return tr("mis. CAM-28", "e.g. CAM-28") },
      fixedAfterCreate: true,
      description: () => tr("Tidak bisa diubah setelah disimpan, karena event merujuk ke kode ini.", "Can't be changed after saving, because events refer to this code."),
    },
    { key: "nama", get label() { return tr("Nama", "Name") }, kind: "text", isRequired: true, get placeholder() { return tr("mis. Gudang 3", "e.g. Warehouse 3") } },
    { key: "site", label: "Site", kind: "select", isRequired: true, options: siteChoices, after: keepZone },
    {
      key: "zona",
      get label() { return tr("Zona", "Zones") },
      kind: "select",
      isRequired: true,
      options: (d) => zoneChoices(d.site),
      isDisabled: (d) => !d.site,
      description: (d) => (d.site ? tr(`Hanya zona milik ${siteName(d.site)}.`, `Only zones of ${siteName(d.site)}.`) : tr("Pilih site dulu.", "Pick a site first.")),
    },
    {
      key: "streamUrl",
      get label() { return tr("URL stream", "Stream URL") },
      kind: "url",
      isRequired: true,
      get placeholder() { return tr("https://… atau /mock/cctv/gudang.mp4", "https://… or /mock/cctv/gudang.mp4") },
      description: () => tr("Resolusi rendah, untuk grid.", "Low resolution, for the grid."),
    },
    {
      key: "streamUrlHd",
      get label() { return tr("URL stream HD", "HD stream URL") },
      kind: "url",
      get placeholder() { return tr("Opsional", "Optional") },
      description: () => tr("Untuk tampilan satu kamera. Kosong berarti memakai URL stream.", "For the single-camera view. Empty means the stream URL is used."),
    },
    {
      key: "fungsi",
      get label() { return tr("Fungsi / use case", "Functions / use cases") },
      kind: "multiselect",
      isRequired: true,
      options: () => fungsiDefs.map((f) => ({ id: f.id, label: fungsiOptionLabel(f) })),
      get placeholder() { return tr("Pilih satu atau lebih", "Pick one or more") },
      description: () => tr("Model AI yang dijalankan edge pada kamera ini. Satu kamera bisa lebih dari satu fungsi, sesuai area yang dilihatnya.", "The AI models the edge runs on this camera. One camera can have several, depending on the area it sees."),
    },
    { key: "streamType", get label() { return tr("Jenis stream", "Stream type") }, kind: "select", isRequired: true, options: () => streamTypes },
  ],
  blank: () => {
    const sites = userSites()
    return { id: "", nama: "", site: sites.length === 1 ? sites[0] : "", zona: "", streamUrl: "", streamUrlHd: "", streamType: "video/mp4", fungsi: [], aktif: true }
  },
  title: (k) => k.id || "baru",
  search: (k) => `${k.id} ${k.nama} ${place(k.site, k.zona)} ${(k.fungsi ?? []).map(fungsiLabel).join(" ")}`,
  canEdit: admins,
  validate: (d, isNew) => ({
    id: isNew && taken(master().kamera, "", d.id, (r: Kamera) => r.id) ? tr(`Kode ${d.id.trim()} sudah dipakai kamera lain.`, `Code ${d.id.trim()} is already used by another camera.`) : undefined,
    streamUrl: d.streamUrl && !isUrl(d.streamUrl) ? tr("Masukkan URL lengkap yang diawali https:// atau /.", "Enter a full URL starting with https:// or /.") : undefined,
    streamUrlHd: d.streamUrlHd && !isUrl(d.streamUrlHd) ? tr("Masukkan URL lengkap yang diawali https:// atau /.", "Enter a full URL starting with https:// or /.") : undefined,
  }),
  missingParent: missingPlace,
  // A restricted-zone camera can't be saved without saying what is restricted.
  saveBlocker: (d) => (usesRestricted(d.fungsi) ? areaProblem(d.area) : undefined) ?? (usesAcuan(d.fungsi) ? acuanProblem(d.acuan) : undefined),
  extra: (d, set, readOnly) => (
    <>
      <StreamTest key={`${d.streamUrl}|${d.streamType}`} src={d.streamUrl} type={d.streamType} />
      {/* Only the restricted-zone use case has areas. */}
      {usesRestricted(d.fungsi) && <AreaEditor value={d.area} src={d.streamUrl || undefined} readOnly={readOnly} onChange={(area) => set({ ...d, area })} />}
      {/* And the object-change use case its reference areas. */}
      {usesAcuan(d.fungsi) && <AreaEditor kind="acuan" value={d.acuan} src={d.streamUrl || undefined} readOnly={readOnly} onChange={(acuan) => set({ ...d, acuan })} />}
    </>
  ),
}

/** The camera's functions as small tags, two at most so the column stays one line. */
function FungsiList({ ids }: { ids: string[] }) {
  if (!ids.length) return <span className="text-muted">—</span>
  const shown = ids.slice(0, 2)
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((id) => (
        <span key={id} className="rounded-md bg-default px-1.5 py-0.5 text-xs">
          {fungsiLabel(id)}
        </span>
      ))}
      {ids.length > shown.length && (
        <span className="rounded-md bg-default px-1.5 py-0.5 text-xs text-muted" title={ids.slice(2).map(fungsiLabel).join(", ")}>
          +{ids.length - shown.length}
        </span>
      )}
    </span>
  )
}

const testText: Record<PlayerStatus, string> = {
  loading: tr("Menghubungkan…", "Connecting…"),
  playing: tr("Stream berjalan.", "Stream is playing."),
  error: tr("Stream tidak bisa diputar. Periksa URL dan jenis stream.", "The stream can't be played. Check the URL and stream type."),
}

/** Plays the URL before it is saved, so a typo shows up now and not on the CCTV wall. */
function StreamTest({ src, type }: { src: string; type: string }) {
  const [on, setOn] = useState(false)
  const [status, setStatus] = useState<PlayerStatus>("loading")
  if (!on)
    return (
      <Button variant="secondary" className="self-start" isDisabled={!isUrl(src)} onPress={() => setOn(true)}>
        <Play aria-hidden />
        {tr("Uji stream", "Test stream")}
      </Button>
    )
  return (
    <div className="flex flex-col gap-2">
      <CameraPlayer src={src} type={type} label={tr("Pratinjau stream", "Stream preview")} className="aspect-video w-full overflow-hidden rounded-xl bg-black" onStatusChange={setStatus} />
      <p role="status" className={status === "error" ? "text-sm text-danger" : "text-sm text-muted"}>
        {testText[status]}
      </p>
    </div>
  )
}

export function KameraAdminPage() {
  return <CrudPage config={kameraConfig} />
}

// ---- Sensor ----

const typeOf = (id: string) => sensorTypes.find((t) => t.id === id)

const sensorConfig: CrudConfig<SensorMaster> = {
  kind: "sensor",
  noun: "sensor",
  get description() { return tr("Sensor menempel ke satu pasangan site dan zona. Batas waspada dan bahaya diatur di halaman Lingkungan.", "A sensor attaches to one site and zone pair. Warning and danger limits are set on the Environment page.") },
  rows: (m, user) => m.sensor.filter((s) => sitesOf(m, user).some((x) => x.id === s.site)),
  columns: [
    { get label() { return tr("Nama", "Name") }, isRowHeader: true, render: (s) => s.nama },
    { get label() { return tr("Jenis", "Type") }, render: (s) => typeOf(s.jenis)?.label ?? s.jenis },
    { get label() { return tr("Lokasi", "Location") }, render: (s) => place(s.site, s.zona) },
    { get label() { return tr("Satuan", "Unit") }, render: (s) => typeOf(s.jenis)?.unit },
  ],
  fields: [
    { key: "nama", get label() { return tr("Nama", "Name") }, kind: "text", isRequired: true, get placeholder() { return tr("mis. Suhu Gudang", "e.g. Warehouse temperature") } },
    {
      key: "jenis",
      get label() { return tr("Jenis", "Type") },
      kind: "select",
      isRequired: true,
      options: () => sensorTypes.map((t) => ({ id: t.id, label: t.label })),
      description: (d) => (typeOf(d.jenis) ? tr(`Satuan ${typeOf(d.jenis)!.unit}, mengikuti jenis.`, `Unit ${typeOf(d.jenis)!.unit}, set by the type.`) : undefined),
    },
    { key: "site", label: "Site", kind: "select", isRequired: true, options: siteChoices, after: keepZone },
    {
      key: "zona",
      get label() { return tr("Zona", "Zones") },
      kind: "select",
      isRequired: true,
      options: (d) => zoneChoices(d.site),
      isDisabled: (d) => !d.site,
      description: (d) => (d.site ? tr(`Hanya zona milik ${siteName(d.site)}.`, `Only zones of ${siteName(d.site)}.`) : tr("Pilih site dulu.", "Pick a site first.")),
    },
  ],
  blank: () => {
    const sites = userSites()
    return { id: newId("sensor"), nama: "", jenis: "", site: sites.length === 1 ? sites[0] : "", zona: "", aktif: true }
  },
  title: (s) => s.nama || "baru",
  search: (s) => `${s.nama} ${typeOf(s.jenis)?.label} ${place(s.site, s.zona)}`,
  canEdit: admins,
  missingParent: missingPlace,
}

export function SensorAdminPage() {
  return <CrudPage config={sensorConfig} />
}

// ---- Shift ----

const clock = (hhmm: string) => hhmm.replace(":", ".")
const hours = (s: Shift) => {
  const minutes = (toMinutes(s.selesai) - toMinutes(s.mulai) + 1440) % 1440 || 1440
  return tr(`${Math.floor(minutes / 60)} jam${minutes % 60 ? ` ${minutes % 60} menit` : ""}`, `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`)
}
const crossesMidnight = (s: Shift) => toMinutes(s.selesai) <= toMinutes(s.mulai)

const shiftConfig: CrudConfig<Shift> = {
  kind: "shift",
  noun: "shift",
  get description() { return tr("Berlaku untuk semua site, dibaca di jam setempat tiap site. Shift aktif tidak boleh tumpang tindih.", "Applies to every site, read in each site's local time. Active shifts must not overlap.") },
  rows: (m) => m.shift,
  columns: [
    { get label() { return tr("Nama", "Name") }, isRowHeader: true, render: (s) => s.nama },
    { get label() { return tr("Jam", "Hours") }, render: (s) => `${clock(s.mulai)}–${clock(s.selesai)}` },
    { get label() { return tr("Durasi", "Duration") }, render: (s) => `${hours(s)}${crossesMidnight(s) ? tr(", lewat tengah malam", ", past midnight") : ""}` },
  ],
  fields: [
    { key: "nama", get label() { return tr("Nama", "Name") }, kind: "text", isRequired: true, get placeholder() { return tr("mis. Pagi", "e.g. Morning") } },
    { key: "mulai", get label() { return tr("Jam mulai", "Start time") }, kind: "time", isRequired: true },
    {
      key: "selesai",
      get label() { return tr("Jam selesai", "End time") },
      kind: "time",
      isRequired: true,
      description: (d) =>
        d.mulai && d.selesai && d.mulai !== d.selesai && crossesMidnight(d) ? tr(`Lewat tengah malam: berakhir ${clock(d.selesai)} esok harinya.`, `Past midnight: ends ${clock(d.selesai)} the next day.`) : undefined,
    },
  ],
  blank: () => ({ id: newId("shift"), nama: "", mulai: "", selesai: "", aktif: true }),
  title: (s) => s.nama || "baru",
  search: (s) => s.nama,
  canEdit: superAdminOnly,
  validate: (d) => ({ selesai: d.mulai && d.mulai === d.selesai ? tr("Jam selesai tidak boleh sama dengan jam mulai.", "The end time can't equal the start time.") : undefined }),
  saveBlocker: (d) => {
    if (!d.aktif) return undefined
    const clash = master().shift.find((s) => s.aktif && s.id !== d.id && overlaps(s, d))
    return clash && tr(`Bertabrakan dengan shift ${clash.nama} (${clock(clash.mulai)}–${clock(clash.selesai)}). Geser jamnya atau nonaktifkan shift itu dulu.`, `Overlaps the ${clash.nama} shift (${clock(clash.mulai)}–${clock(clash.selesai)}). Move the hours or deactivate that shift first.`)
  },
}

export function ShiftAdminPage() {
  return <CrudPage config={shiftConfig} />
}

// ---- Pengguna ----

const roles = (Object.keys(roleLabel) as Role[]).map((id) => ({ id, label: roleLabel[id] }))

const penggunaConfig: CrudConfig<Pengguna> = {
  kind: "pengguna",
  get noun() { return tr("pengguna", "user") },
  get description() { return tr("Satu role per pengguna, ditambah daftar site yang boleh diakses.", "One role per user, plus the list of sites they may access.") },
  rows: (m, user) => (user?.role === "super-admin" ? m.pengguna : m.pengguna.filter((u) => u.role !== "super-admin" && u.site.some((s) => user?.site.includes(s)))),
  columns: [
    {
      get label() { return tr("Nama", "Name") },
      isRowHeader: true,
      render: (u) => (
        <>
          <p>{u.nama}</p>
          <p className="text-sm text-muted">{u.email}</p>
        </>
      ),
    },
    { label: "Role", render: (u) => roleLabel[u.role] },
    { get label() { return tr("Akses site", "Site access") }, render: (u) => (u.role === "super-admin" ? tr("Semua site", "All sites") : u.site.map(siteName).join(", ") || <span className="text-muted">{tr("Belum ada", "None yet")}</span>) },
  ],
  fields: [
    { key: "nama", get label() { return tr("Nama", "Name") }, kind: "text", isRequired: true },
    { key: "email", label: "Email", kind: "email", isRequired: true, get placeholder() { return tr("nama@perusahaan.co.id", "name@company.com") }, description: () => tr("Dipakai untuk masuk.", "Used to sign in.") },
    { key: "role", label: "Role", kind: "select", isRequired: true, options: () => roles },
    {
      key: "site",
      get label() { return tr("Akses site", "Site access") },
      kind: "multiselect",
      isRequired: true,
      options: () => userSites().map((id) => ({ id, label: siteName(id) })),
      isDisabled: (d) => d.role === "super-admin",
      description: (d) => (d.role === "super-admin" ? tr("Super Admin otomatis punya akses ke semua site.", "Super Admin automatically has access to every site.") : undefined),
    },
  ],
  blank: () => ({ id: newId("u"), nama: "", email: "", role: "viewer", site: [], aktif: true }),
  title: (u) => u.nama || "baru",
  search: (u) => `${u.nama} ${u.email} ${roleLabel[u.role]}`,
  canEdit: superAdminOnly,
  validate: (d) => ({
    email:
      d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())
        ? tr("Format email belum benar.", "The email format is not right.")
        : taken(master().pengguna, d.id, d.email, (r: Pengguna) => r.email)
          ? tr("Email ini sudah dipakai pengguna lain.", "This email is already used by another user.")
          : undefined,
  }),
  saveBlocker: (d, isNew) =>
    !isNew && d.role !== "super-admin" && isLastSuperAdmin(d.id)
      ? tr("Ini Super Admin aktif terakhir. Jadikan pengguna lain Super Admin dulu supaya sistem tidak terkunci.", "This is the last active Super Admin. Make another user Super Admin first so the system isn't locked.")
      : undefined,
}

export function PenggunaAdminPage() {
  return <CrudPage config={penggunaConfig} />
}
