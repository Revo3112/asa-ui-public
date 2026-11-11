/**
 * Interface language: Indonesian (default) or English. Text is written as pairs at the point of
 * use, `tr("Simpan", "Save")`, so a reader sees both and nothing hides behind a key.
 *
 * Switching remounts the app (App.tsx keys the router on the language), so every label, chart and
 * date re-renders without a reload. Records keep the language they were written in: a review
 * reason or an action title typed in Indonesian stays Indonesian.
 *
 * The choice is a per-viewer convenience kept in localStorage; it falls back to Indonesian.
 */

import { useSyncExternalStore } from "react"

export type Lang = "id" | "en"

const KEY = "hse-lang"

function read(): Lang {
  try {
    return localStorage.getItem(KEY) === "en" ? "en" : "id"
  } catch {
    return "id"
  }
}

let lang: Lang = read()
const listeners = new Set<() => void>()

export const getLang = () => lang

/** The Indonesian or the English text, by the current language. */
export const tr = (id: string, en: string) => (lang === "en" ? en : id)

/** BCP 47 locale for dates and numbers. */
export const locale = () => (lang === "en" ? "en-GB" : "id-ID")

export function setLang(next: Lang) {
  if (next === lang) return
  lang = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // Storage blocked: the choice lasts until reload.
  }
  if (typeof document !== "undefined") document.documentElement.lang = next
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useLang = () => useSyncExternalStore(subscribe, getLang)

if (typeof document !== "undefined") document.documentElement.lang = lang
