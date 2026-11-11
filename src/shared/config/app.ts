// App name, logo, colors and active modules are settings now: see src/shared/config/defaults.ts.

export const session = {
  /** Idle minutes before the session ends. Any click or key press restarts the count. */
  minutes: 15,
  /** The warning with the "Perpanjang" button shows this long before the end. */
  warnSeconds: 60,
}

export const notifications = {
  // Only Kritis and Tinggi events raise a toast (`isUrgent` in config/events.ts). Every event still reaches the bell.
  /** At most one toast per this many ms; the rest wait in the bell. */
  toastGapMs: 15_000,
  /** How many recent events the bell keeps. */
  bellSize: 20,
} as const
