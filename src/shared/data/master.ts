/**
 * Master data: the zone catalog, sites, cameras, sensors, shifts and users. Every other
 * dummy module reads its places, devices and shifts from here.
 *
 * Zona → Site → Kamera: a zone is a catalog entry made once, a site picks the zones it has
 * (one zone can serve several sites), and a camera or sensor sits at one site + zone pair.
 * Nothing is deleted. Records are deactivated, so old events still find their zone and camera.
 *
 * ponytail: an in-memory store that resets on reload. Each `save` is one API call later.
 */

import { useSyncExternalStore } from "react";

import type { Severity } from "@/shared/config/events";
import { defaultFungsi } from "@/shared/config/fungsi-kamera";
import {
  defaultAcuan,
  defaultArea,
  type AreaTerlarang,
} from "@/shared/config/area-terlarang";
import { seedPabrik } from "@/shared/data/seed/pabrik";

import { seedTambang } from "@/shared/data/seed/tambang";
import type { Role } from "@/shared/auth/session";
import { tr } from "@/shared/lib/i18n";
import { isWithin } from "@/shared/lib/shift-time";

/** `risiko` is the zone's default risk: it sets the severity of indications there and feeds the risk score. */
export type Zona = {
  id: string;
  kode: string;
  nama: string;
  risiko?: Severity;
  /** How many people the zone may hold at once; people counting alarms above it. */
  kapasitas?: number;
  aktif: boolean;
};
/** `koordinat` is the site centre as [lat, lng], for the map. */
export type Site = {
  id: string;
  kode: string;
  nama: string;
  alamat: string;
  zonaWaktu: string;
  zona: string[];
  koordinat?: [number, number];
  aktif: boolean;
};
/** `perangkat` is the device that runs detection for this camera: an edge server, an Aegis pole or a Manpack. */
export type Kamera = {
  id: string;
  nama: string;
  site: string;
  zona: string;
  streamUrl: string;
  streamUrlHd: string;
  streamType: string;
  tipe?: string;
  mount?: string;
  perangkat?: string;
  /** The analytics models the edge runs on this stream, see config/fungsi-kamera. Seed cameras get defaults on load. */
  fungsi?: string[];
  /** Restricted areas on its view, for cameras running the restricted-zone use case. */
  area?: AreaTerlarang;
  /** Reference areas for the object-change use case: the stacks and racks compared with their reference image. */
  acuan?: AreaTerlarang;
  aktif: boolean;
};
export type SensorMaster = {
  id: string;
  nama: string;
  jenis: string;
  site: string;
  zona: string;
  aktif: boolean;
};
export type Shift = {
  id: string;
  nama: string;
  mulai: string;
  selesai: string;
  aktif: boolean;
};
/** `site` is ignored for Super Admin, who sees every site. */
export type Pengguna = {
  id: string;
  nama: string;
  email: string;
  role: Role;
  site: string[];
  aktif: boolean;
};

/**
 * A monitoring source other than a camera. An edge server sends its events over `uplink`; an Aegis
 * pole and a Manpack carry their own terminal, so they are their own uplink. `zona` and `dipasang`
 * (ISO 8601) say where a movable device stands now and since when.
 */
export type PerangkatJenis = "edge" | "uplink" | "aegis" | "manpack";
export type Perangkat = {
  id: string;
  nama: string;
  jenis: PerangkatJenis;
  site: string;
  zona?: string;
  media?: "satelit" | "fiber" | "4g";
  uplink?: string;
  dipasang?: string;
  aktif: boolean;
};

export type Master = {
  zona: Zona[];
  site: Site[];
  kamera: Kamera[];
  sensor: SensorMaster[];
  shift: Shift[];
  pengguna: Pengguna[];
  perangkat: Perangkat[];
};
export type MasterKind = keyof Master;

// ---- Store, one per data profile ----

/**
 * Which demo data set is loaded: a factory or a mine. Picked in Pengaturan → Profil data and carried
 * by the presets, so a mining demo never shows a warehouse in Cikarang. Each profile keeps its own
 * edits until reload.
 */
export type Profil = "pabrik" | "tambang";

/** Demo cameras run PPE plus the categories their zone produces. */
function withFungsi(m: Master): Master {
  const risk = new Map(m.zona.map((z) => [z.id, z.risiko]));
  return {
    ...m,
    kamera: m.kamera.map((k) => {
      const fungsi = k.fungsi?.length
        ? k.fungsi
        : defaultFungsi(k.zona, risk.get(k.zona));
      return {
        ...k,
        fungsi,
        area: k.area ?? defaultArea(k.id, k.zona, fungsi),
        acuan: k.acuan ?? defaultAcuan(k.id, fungsi),
      };
    }),
  };
}

const seeds: Record<Profil, () => Master> = {
  pabrik: () => withFungsi(seedPabrik()),
  tambang: () => withFungsi(seedTambang()),
};
const states = new Map<Profil, Master>();
let profil: Profil = "pabrik";
let state: Master = seeds.pabrik();
states.set("pabrik", state);
const listeners = new Set<() => void>();

/** Switches the data set. Called by the settings store whenever the active profile changes. */
export function setProfil(next: Profil) {
  if (next === profil) return;
  states.set(profil, state);
  profil = next;
  state = states.get(next) ?? seeds[next]();
  states.set(next, state);
  listeners.forEach((l) => l());
}

export const currentProfil = () => profil;

export const master = () => state;

export function subscribeMaster(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useMaster = () => useSyncExternalStore(subscribeMaster, master);

/** Adds the record, or replaces the one with the same id. */
export function saveRecord<K extends MasterKind>(
  kind: K,
  row: Master[K][number],
) {
  return new Promise<void>((resolve) =>
    setTimeout(
      () => {
        const rows = state[kind] as Master[K][number][];
        const next = rows.some((r) => r.id === row.id)
          ? rows.map((r) => (r.id === row.id ? row : r))
          : [...rows, row];
        state = { ...state, [kind]: next };
        states.set(profil, state);
        listeners.forEach((l) => l());
        resolve();
      },
      300 + Math.random() * 300,
    ),
  );
}

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}`;

// ---- Lookups ----

export const zonaById = (id: string) => state.zona.find((z) => z.id === id);
export const siteById = (id: string) => state.site.find((s) => s.id === id);
export const zoneName = (id: string) => zonaById(id)?.nama ?? id;
export const siteName = (id: string) => siteById(id)?.nama ?? id;
export const siteTimeZone = (id: string) =>
  siteById(id)?.zonaWaktu ?? "Asia/Jakarta";

/** Active zones registered at a site, in the site's order. */
export const zonesOfSite = (siteId: string) =>
  (siteById(siteId)?.zona ?? []).flatMap((id) => {
    const z = zonaById(id);
    return z?.aktif ? [z] : [];
  });

export const perangkatById = (id: string) =>
  state.perangkat.find((p) => p.id === id);
export const perangkatAt = (siteId: string) =>
  state.perangkat.filter((p) => p.aktif && p.site === siteId);

export const camerasAt = (siteId: string, zonaId?: string) =>
  state.kamera.filter(
    (c) => c.aktif && c.site === siteId && (!zonaId || c.zona === zonaId),
  );
export const sensorsAt = (siteId: string, zonaId?: string) =>
  state.sensor.filter(
    (s) => s.aktif && s.site === siteId && (!zonaId || s.zona === zonaId),
  );

export const activeShifts = () => state.shift.filter((s) => s.aktif);
export const shiftLabel = (id: string) => {
  const s = state.shift.find((x) => x.id === id);
  return s
    ? `${s.nama} (${s.mulai.replace(":", ".")}–${s.selesai.replace(":", ".")})`
    : id || tr("Di luar shift", "Outside shifts");
};

const clocks = new Map<string, Intl.DateTimeFormat>();

/** Minutes since midnight at the site, in its own time zone. */
export function siteMinutes(date: Date, siteId: string) {
  const tz = siteTimeZone(siteId);
  let clock = clocks.get(tz);
  if (!clock)
    clocks.set(
      tz,
      (clock = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })),
    );
  const [h, m] = clock.format(date).split(":").map(Number);
  return h * 60 + m;
}

/** The active shift running at the site at that moment, or "" in a gap between shifts. */
export const shiftOf = (date: Date, siteId: string) => {
  const minute = siteMinutes(date, siteId);
  return (
    activeShifts().find((s) => isWithin(minute, s.mulai, s.selesai))?.id ?? ""
  );
};

// ---- Rules the API would enforce ----

const count = (n: number, noun: string) => `${n} ${noun}`;
const and = () => tr(" dan ", " and ");

/** Why this record can't be deactivated, or undefined when it can. */
export function deactivateBlocker(
  kind: MasterKind,
  id: string,
  by?: Pengguna,
): string | undefined {
  if (kind === "zona") {
    const places = state.site
      .map((s) => ({
        s,
        kamera: camerasAt(s.id, id).length,
        sensor: sensorsAt(s.id, id).length,
      }))
      .filter((p) => p.kamera || p.sensor);
    if (places.length)
      return tr(
        `Zona ini masih dipakai ${places.map((p) => [p.kamera && count(p.kamera, "kamera"), p.sensor && count(p.sensor, "sensor")].filter(Boolean).join(and()) + ` di ${p.s.nama}`).join(", ")}. Nonaktifkan atau pindahkan perangkatnya dulu.`,
        `This zone is still used by ${places.map((p) => [p.kamera && count(p.kamera, "cameras"), p.sensor && count(p.sensor, "sensors")].filter(Boolean).join(and()) + ` at ${p.s.nama}`).join(", ")}. Deactivate or move those devices first.`,
      );
  }
  if (kind === "site") {
    const kamera = camerasAt(id).length;
    const sensor = sensorsAt(id).length;
    if (kamera || sensor)
      return tr(
        `Site ini masih punya ${[kamera && count(kamera, "kamera aktif"), sensor && count(sensor, "sensor aktif")].filter(Boolean).join(and())}. Nonaktifkan perangkatnya dulu.`,
        `This site still has ${[kamera && count(kamera, "active cameras"), sensor && count(sensor, "active sensors")].filter(Boolean).join(and())}. Deactivate those devices first.`,
      );
  }
  if (kind === "pengguna") {
    if (by?.id === id)
      return tr(
        "Anda tidak bisa menonaktifkan akun sendiri.",
        "You can't deactivate your own account.",
      );
    if (isLastSuperAdmin(id))
      return tr(
        "Ini Super Admin aktif terakhir. Jadikan pengguna lain Super Admin dulu supaya sistem tidak terkunci.",
        "This is the last active Super Admin. Make another user Super Admin first so the system isn't locked.",
      );
  }
  return undefined;
}

export const isLastSuperAdmin = (id: string) => {
  const admins = state.pengguna.filter(
    (u) => u.aktif && u.role === "super-admin",
  );
  return admins.length === 1 && admins[0].id === id;
};

/** Zones taken off a site that still have active cameras or sensors there. */
export function removedZoneBlocker(siteId: string, zonaIds: string[]) {
  const before = siteById(siteId)?.zona ?? [];
  const used = before.filter(
    (z) =>
      !zonaIds.includes(z) &&
      (camerasAt(siteId, z).length || sensorsAt(siteId, z).length),
  );
  if (used.length)
    return tr(
      `${used.map(zoneName).join(", ")} masih dipakai kamera atau sensor di site ini. Pindahkan atau nonaktifkan perangkatnya dulu, baru lepas zonanya.`,
      `${used.map(zoneName).join(", ")} is still used by cameras or sensors at this site. Move or deactivate those devices first, then remove the zone.`,
    );
  return undefined;
}
