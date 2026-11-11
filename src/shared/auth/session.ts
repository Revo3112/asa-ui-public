/**
 * The signed-in user, the site picked in the header, and when the session ends.
 * ponytail: mock login against the master user list, kept in sessionStorage so a reload stays
 * signed in. Swap `login` for the auth endpoint; the rest reads from `getSession`.
 */

import { useSyncExternalStore } from "react"

import { session as sessionConfig } from "@/shared/config/app"
import { master, useMaster } from "@/shared/data/master"
import { tr } from "@/shared/lib/i18n"

/**
 * The first four are the template's own roles. The rest are the operational roles of the review →
 * case → corrective action workflow; what each may do there is in config/roles.ts.
 */
export type Role =
  | "super-admin"
  | "admin-site"
  | "hse-officer"
  | "viewer"
  | "site-manager"
  | "hse-manager"
  | "control-room"
  | "area-supervisor"
  | "it-ot"

export const roleLabel: Record<Role, string> = {
  "super-admin": "Super Admin",
  "admin-site": "Admin Site",
  "hse-officer": "HSE Officer",
  get viewer() { return tr("Viewer", "Viewer") },
  "site-manager": "Site Manager",
  "hse-manager": "HSE Manager",
  "control-room": "Operator Control Room",
  "area-supervisor": "Area Supervisor",
  "it-ot": "IT/OT Admin",
}

export const allRoles = Object.keys(roleLabel) as Role[]

type Session = { userId: string; activeSite: string }
type Stored = Session & { expiresAt: number }

const KEY = "hse-session"
/** Demo accounts all use this password. */
export const DEMO_PASSWORD = "demo123"
const SESSION_MS = sessionConfig.minutes * 60_000

function read(): Stored | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Stored | null
    return s && s.expiresAt > Date.now() ? s : null
  } catch {
    return null
  }
}

const stored = read()
let session: Session | null = stored && { userId: stored.userId, activeSite: stored.activeSite }
// Kept apart from `session` so extending it on every click doesn't re-render the app.
let expiresAt = stored?.expiresAt ?? 0
const listeners = new Set<() => void>()

function persist() {
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify({ ...session, expiresAt }))
    else sessionStorage.removeItem(KEY)
  } catch {
    // Private mode: the session lives until the tab reloads.
  }
}

function set(next: Session | null) {
  session = next
  persist()
  listeners.forEach((l) => l())
}

export const getSession = () => session
export const sessionEndsAt = () => expiresAt

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const currentUser = () => (session ? master().pengguna.find((u) => u.id === session!.userId) : undefined)

/** Active sites the user may see. Super Admin sees them all. */
export function userSites(user = currentUser()) {
  const active = master().site.filter((s) => s.aktif)
  if (!user || user.role === "super-admin") return active.map((s) => s.id)
  return active.filter((s) => user.site.includes(s.id)).map((s) => s.id)
}

/** The header's site, checked against what the user may see now: one site id, or "all". */
export function activeSite() {
  const sites = userSites()
  const picked = session?.activeSite
  if (picked === "all" && sites.length > 1) return "all"
  return picked && sites.includes(picked) ? picked : (sites[0] ?? "")
}

export type EndReason = "keluar" | "sesi-habis"
/** Why the last session ended, so the login page can say so. Null when there was none. */
let endedBy: EndReason | null = null

export function useSession() {
  // Reads the master and session stores during render, which the React Compiler would cache once.
  "use no memo"
  useMaster()
  const s = useSyncExternalStore(subscribe, getSession)
  return { session: s, user: s ? currentUser() : undefined, activeSite: activeSite(), endReason: endedBy }
}

export function login(email: string, password: string) {
  return new Promise<void>((resolve, reject) =>
    setTimeout(() => {
      const user = master().pengguna.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
      if (!user || password !== DEMO_PASSWORD) return reject(new Error(tr("Email atau kata sandi salah.", "Wrong email or password.")))
      if (!user.aktif) return reject(new Error(tr("Akun ini sudah dinonaktifkan. Hubungi admin untuk mengaktifkannya lagi.", "This account has been deactivated. Ask an admin to reactivate it.")))
      expiresAt = Date.now() + SESSION_MS
      endedBy = null
      set({ userId: user.id, activeSite: userSites(user)[0] ?? "" })
      resolve()
    }, 500),
  )
}

export function logout(reason: EndReason = "keluar") {
  endedBy = reason
  set(null)
}

/** Restarts the countdown. Called on activity and from the "Perpanjang" button. */
export function extendSession() {
  expiresAt = Date.now() + SESSION_MS
  persist()
}

export const setActiveSite = (activeSite: string) => session && set({ ...session, activeSite })

export function useRole(): Role {
  return useSession().user?.role ?? "viewer"
}

/** Sensor thresholds: the template's editing roles, plus HSE Manager and IT/OT, who own the sensors in the new roles. */
export const canEditThresholds = (role: Role) => (["super-admin", "admin-site", "hse-officer", "hse-manager", "it-ot"] as Role[]).includes(role)

/**
 * Acknowledge and Close on the simple event flow (APD, Lingkungan, ERT, Kamera). The template's
 * roles keep what they had; of the new roles only those who acknowledge in the review workflow
 * (HSE Manager, Control Room) do it here too.
 */
export const canHandleEvents = (role: Role) => (["super-admin", "admin-site", "hse-officer", "hse-manager", "control-room"] as Role[]).includes(role)

/** The Administrasi menu is for Super Admin and Admin Site only. */
export const canAdminister = (role: Role) => role === "super-admin" || role === "admin-site"

/** Shown in an event's status history. */
export const currentUserName = () => currentUser()?.nama ?? tr("Sistem", "System")
