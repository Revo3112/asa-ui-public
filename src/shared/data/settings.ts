/**
 * Settings store: branding, theme and active modules. Components read `useSettings()` and never
 * keep their own copy of a brand value or module list.
 *
 * Load order: the last settings cached in localStorage are applied when this file is imported,
 * before the first render, so the default brand never flashes. The API answer replaces them once
 * it arrives. A failed request keeps the cache, then the defaults.
 *
 * ponytail: the "server" is localStorage too (`DB`), and images are stored inline as data URLs.
 * Swap the four `fetch*`/`save*` functions for real calls; their shapes follow the API contract in
 * the README.
 */

import { useSyncExternalStore } from "react"

import { defaultSettings, type AssetRef, type ModuleId, type Settings } from "@/shared/config/defaults"
import { setProfil, type Profil } from "@/shared/data/master"
import { currentUser, getSession } from "@/shared/auth/session"
import { locale, tr } from "@/shared/lib/i18n"

const CACHE = "hse-settings"
const DB = "hse-settings-db"
const MB = 1024 * 1024

// ---- Validation, shared by the form and the mock server ----

export type AssetKind = "logo" | "favicon" | "appIcon"
export type FieldErrors = Partial<Record<"appName" | "primary" | "accent" | AssetKind, string>>

const HEX = /^#[0-9a-f]{6}$/i
// From the defaults, so a new module can never be left out of parsing.
const moduleIds = Object.keys(defaultSettings.modules) as ModuleId[]
const profiles: Profil[] = ["pabrik", "tambang"]

export const assetRules: Record<AssetKind, { mimes: string[]; maxBytes: number; accept: string; hint: string }> = {
  logo: { mimes: ["image/svg+xml", "image/png"], maxBytes: MB, accept: ".svg,.png", get hint() { return tr("SVG atau PNG, maksimal 512 × 512 px dan 1 MB.", "SVG or PNG, at most 512 × 512 px and 1 MB.") } },
  favicon: { mimes: ["image/png", "image/x-icon", "image/vnd.microsoft.icon"], maxBytes: 256 * 1024, accept: ".png,.ico", get hint() { return tr("PNG atau ICO persegi, maksimal 256 KB.", "Square PNG or ICO, at most 256 KB.") } },
  appIcon: { mimes: ["image/png"], maxBytes: MB, accept: ".png", get hint() { return tr("PNG persegi, maksimal 512 × 512 px dan 1 MB.", "Square PNG, at most 512 × 512 px and 1 MB.") } },
}

const kb = (bytes: number) => (bytes >= MB ? `${(bytes / MB).toLocaleString(locale(), { maximumFractionDigits: 1 })} MB` : `${Math.ceil(bytes / 1024)} KB`)

const assetName: Record<AssetKind, string> = { logo: "Logo", favicon: "Favicon", get appIcon() { return tr("Ikon aplikasi", "App icon") } }

/** File type and size, which can be checked before the image is decoded. */
function fileError(kind: AssetKind, mime: string, size: number) {
  const rule = assetRules[kind]
  if (!rule.mimes.includes(mime)) return tr(`${assetName[kind]} harus ${rule.hint.split(",")[0]}.`, `${assetName[kind]} must be ${rule.hint.split(",")[0]}.`)
  if (size > rule.maxBytes) return tr(`${assetName[kind]} ${kb(size)}. Maksimal ${kb(rule.maxBytes)}.`, `${assetName[kind]} is ${kb(size)}. Maximum ${kb(rule.maxBytes)}.`)
}

/** Why this image breaks its rules, or undefined when it is fine. */
export function assetError(kind: AssetKind, a: AssetRef): string | undefined {
  // The image shipped in the repo is the default, not an upload.
  if (a.url === defaultSettings.brand[kind]?.url) return undefined
  const early = fileError(kind, a.mime, a.size)
  if (early) return early
  const name = assetName[kind]
  const { width: w = 0, height: h = 0 } = a
  if (!w || !h) return tr(`Ukuran ${name.toLowerCase()} tidak terbaca. Pastikan file tidak rusak.`, `The ${name.toLowerCase()} size can't be read. Make sure the file isn't damaged.`)
  if (kind === "logo") {
    // SVG scales, so only its proportion counts; a logo wider than 4:1 turns into a thin line in the sidebar.
    if (a.mime === "image/svg+xml") return Math.max(w / h, h / w) > 4 ? tr("Logo SVG terlalu memanjang. Rasio maksimal 4 : 1.", "The SVG logo is too elongated. Maximum ratio 4 : 1.") : undefined
    if (w > 512 || h > 512) return tr(`Logo ${w} × ${h} px. Maksimal 512 × 512 px.`, `Logo ${w} × ${h} px. Maximum 512 × 512 px.`)
  }
  if (kind === "favicon" && w !== h) return tr(`Favicon harus persegi. File ini ${w} × ${h} px.`, `The favicon must be square. This file is ${w} × ${h} px.`)
  if (kind === "appIcon") {
    if (w !== h) return tr(`Ikon aplikasi harus persegi. File ini ${w} × ${h} px.`, `The app icon must be square. This file is ${w} × ${h} px.`)
    if (w > 512) return tr(`Ikon aplikasi ${w} × ${h} px. Maksimal 512 × 512 px.`, `App icon ${w} × ${h} px. Maximum 512 × 512 px.`)
  }
  return undefined
}

export function validateSettings(s: Settings): FieldErrors {
  const errors: FieldErrors = {}
  const name = s.brand.appName.trim()
  if (!name) errors.appName = tr("Nama aplikasi wajib diisi.", "App name is required.")
  else if (name.length > 40) errors.appName = tr(`Nama aplikasi ${name.length} karakter. Maksimal 40.`, `App name is ${name.length} characters. Maximum 40.`)
  if (!HEX.test(s.theme.primary)) errors.primary = tr("Gunakan format #RRGGBB, misalnya #205478.", "Use the #RRGGBB format, e.g. #205478.")
  if (!HEX.test(s.theme.accent)) errors.accent = tr("Gunakan format #RRGGBB, misalnya #F1AA2F.", "Use the #RRGGBB format, e.g. #F1AA2F.")
  for (const kind of ["logo", "favicon", "appIcon"] as const) {
    const a = s.brand[kind]
    const error = a && assetError(kind, a)
    if (error) errors[kind] = error
  }
  return errors
}

const isAsset = (a: unknown): a is AssetRef | null =>
  a === null || (typeof a === "object" && typeof (a as AssetRef).url === "string" && typeof (a as AssetRef).mime === "string" && typeof (a as AssetRef).size === "number")

/** The settings if `raw` has their shape, otherwise null. Used on everything read from storage or the API. */
export function parseSettings(raw: unknown): Settings | null {
  const s = raw as Settings
  if (!s || s.version !== 1 || !s.brand || !s.theme || !s.modules) return null
  const { appName, logo, favicon, appIcon } = s.brand
  if (typeof appName !== "string" || ![logo, favicon, appIcon].every(isAsset)) return null
  if (!HEX.test(s.theme.primary) || !HEX.test(s.theme.accent)) return null
  // A module or profile added after these settings were saved takes its default instead of throwing the rest away.
  if (!moduleIds.every((id) => s.modules[id] === undefined || typeof s.modules[id] === "boolean")) return null
  const profil = profiles.includes(s.data?.profil) ? s.data.profil : defaultSettings.data.profil
  return {
    version: 1,
    brand: { appName, logo, favicon, appIcon },
    theme: { primary: s.theme.primary, accent: s.theme.accent },
    modules: Object.fromEntries(moduleIds.map((id) => [id, s.modules[id] ?? defaultSettings.modules[id]])) as Settings["modules"],
    data: { profil },
    updatedAt: String(s.updatedAt ?? ""),
    updatedBy: String(s.updatedBy ?? ""),
  }
}

/** Reads an uploaded file into an AssetRef, or throws with the reason it can't be used. */
export async function readAsset(kind: AssetKind, file: File): Promise<AssetRef> {
  // Windows reports .ico files with an empty type.
  const mime = file.type || (file.name.toLowerCase().endsWith(".ico") ? "image/x-icon" : "")
  // Type and size first: no point decoding a 20 MB JPEG.
  const early = fileError(kind, mime, file.size)
  if (early) throw new Error(early)
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error(tr("File tidak bisa dibaca.", "The file can't be read.")))
    reader.readAsDataURL(file)
  })
  const { width, height } = mime === "image/svg+xml" ? svgSize(await file.text()) : await imageSize(url)
  const asset: AssetRef = { url, mime, size: file.size, width, height }
  const error = assetError(kind, asset)
  if (error) throw new Error(error)
  return asset
}

/** An SVG's size from its width/height, or its viewBox when those are missing or relative. */
function svgSize(text: string) {
  const svg = new DOMParser().parseFromString(text, "image/svg+xml").documentElement
  const num = (v: string | null) => (v && /^[\d.]+(px)?$/.test(v) ? parseFloat(v) : 0)
  const box = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number)
  return { width: num(svg.getAttribute("width")) || box[2] || 0, height: num(svg.getAttribute("height")) || box[3] || 0 }
}

const imageSize = (url: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error(tr("File ini tidak bisa dibuka sebagai gambar.", "This file can't be opened as an image.")))
    img.src = url
  })

// ---- Mock API ----

export class ApiError extends Error {
  status: number
  fields: FieldErrors
  constructor(status: number, message: string, fields: FieldErrors = {}) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

function readStored(key: string) {
  try {
    return parseSettings(JSON.parse(localStorage.getItem(key) ?? "null"))
  } catch {
    return null
  }
}

const respond = <T>(make: () => T) =>
  new Promise<T>((resolve, reject) =>
    setTimeout(() => {
      try {
        resolve(make())
      } catch (e) {
        reject(e)
      }
    }, 250 + Math.random() * 250),
  )

const serverSettings = () => readStored(DB) ?? defaultSettings

/** GET /settings/public: brand and theme, no session needed. For the login page. */
export const fetchPublicSettings = () =>
  respond(() => {
    const { brand, theme } = serverSettings()
    return { brand, theme }
  })

/** GET /settings: everything, for a signed-in user. */
export const fetchSettings = () =>
  respond(() => {
    if (!getSession()) throw new ApiError(401, tr("Sesi sudah berakhir.", "The session has ended."))
    return serverSettings()
  })

/** PUT /settings: Super Admin only. Answers with what was stored, or 422 with an error per field. */
export const putSettings = (next: Settings) =>
  respond(() => {
    const user = currentUser()
    if (user?.role !== "super-admin") throw new ApiError(403, tr("Hanya Super Admin yang bisa mengubah pengaturan.", "Only Super Admin can change settings."))
    const fields = validateSettings(next)
    if (Object.keys(fields).length) throw new ApiError(422, tr("Ada isian yang belum benar.", "Some entries are not right yet."), fields)
    const stored: Settings = { ...next, brand: { ...next.brand, appName: next.brand.appName.trim() }, updatedAt: new Date().toISOString(), updatedBy: user.nama }
    try {
      localStorage.setItem(DB, JSON.stringify(stored))
    } catch {
      throw new ApiError(422, tr("Gambar terlalu besar untuk disimpan di browser.", "The images are too large to store in the browser."), { logo: tr("Total ukuran gambar melebihi kapasitas penyimpanan browser. Pakai file yang lebih kecil.", "The images exceed the browser's storage. Use smaller files.") })
    }
    return stored
  })

// ---- Client store ----

let current = readStored(CACHE) ?? defaultSettings
/** A preset shown without saving, for the component catalog. */
let preview: Settings | null = null
const listeners = new Set<() => void>()

export const getSettings = () => preview ?? current

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useSettings = () => useSyncExternalStore(subscribe, getSettings)

function writeCache(s: Settings) {
  try {
    localStorage.setItem(CACHE, JSON.stringify(s))
  } catch {
    try {
      // Full storage: keep the colors, name and modules, and let the images come from the API.
      localStorage.setItem(CACHE, JSON.stringify({ ...s, brand: { ...s.brand, logo: null, favicon: null, appIcon: null } }))
    } catch {
      // Storage blocked: the API answer is used without a cache.
    }
  }
}

function commit(s: Settings) {
  current = s
  writeCache(s)
  applySettings(getSettings())
  listeners.forEach((l) => l())
}

/** Fetches settings and applies them. `public` before sign-in, `full` after. Errors keep what is there. */
export async function loadSettings(scope: "public" | "full") {
  try {
    const next = parseSettings(scope === "public" ? { ...current, ...(await fetchPublicSettings()) } : await fetchSettings())
    if (next) commit(next)
  } catch {
    // Keep the cache, then the defaults. Settings failing must not take the app down.
  }
}

/** Saves through the API and applies the stored result: theme, title, favicon, menu, all without a reload. */
export async function saveSettings(next: Settings) {
  const stored = await putSettings(next)
  commit(stored)
  return stored
}

/** Shows a preset without saving it. Pass null to go back to the saved settings. */
export function previewSettings(s: Settings | null) {
  preview = s
  applySettings(getSettings())
  listeners.forEach((l) => l())
}

/**
 * Another session saved settings. ponytail: the `storage` event stands in for the `settings.updated`
 * WebSocket message; it fires in every other tab of this browser when the mock server writes.
 */
export function subscribeSettingsUpdated(onUpdate: () => void) {
  const onStorage = (e: StorageEvent) => e.key === DB && onUpdate()
  window.addEventListener("storage", onStorage)
  return () => window.removeEventListener("storage", onStorage)
}

export const isModuleOn = (id: ModuleId) => getSettings().modules[id]

// ---- Theme ----

const INK = "#0E1D2B"

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two #RRGGBB colors. */
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** White or ink, whichever reads better on this color. */
export const textOn = (hex: string) => (contrast(hex, "#FFFFFF") >= contrast(hex, INK) ? "#FFFFFF" : INK)

/** The CSS variables a theme sets. Also used on the settings preview, scoped to one element. */
export function themeVars({ primary, accent }: Settings["theme"]) {
  return {
    "--brand-primary": primary,
    "--brand-on-primary": textOn(primary),
    "--brand-accent": accent,
    "--brand-on-accent": textOn(accent),
  }
}

function setLink(rel: string, href: string | undefined) {
  let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  // An empty icon, so the browser doesn't fall back to requesting /favicon.ico.
  if (!href && rel === "icon") href = "data:,"
  if (!href) return link?.remove()
  if (!link) link = Object.assign(document.createElement("link"), { rel })
  link.href = href
  // A data URL of an ICO would otherwise keep the type from index.html.
  link.removeAttribute("type")
  document.head.append(link)
}

export function applySettings(s: Settings) {
  setProfil(s.data.profil)
  const style = document.documentElement.style
  for (const [name, value] of Object.entries(themeVars(s.theme))) style.setProperty(name, value)
  document.title = s.brand.appName
  const { favicon, appIcon, logo } = s.brand
  setLink("icon", (favicon ?? appIcon ?? logo)?.url)
  setLink("apple-touch-icon", (appIcon ?? logo)?.url)
}

applySettings(current)
