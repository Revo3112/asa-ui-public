/**
 * One shared timer for many listeners, running only while someone listens. Mock streams use it
 * so the header bell and the page see the same new events, as they would on one WebSocket.
 */
export function ticker<T>(ms: number, make: () => T | null | undefined | false | "") {
  const listeners = new Set<(value: T) => void>()
  let timer: ReturnType<typeof setInterval> | undefined
  return (listener: (value: T) => void) => {
    listeners.add(listener)
    if (listeners.size === 1)
      timer = setInterval(() => {
        const value = make()
        if (value) listeners.forEach((l) => l(value))
      }, ms)
    return () => {
      listeners.delete(listener)
      if (!listeners.size) clearInterval(timer)
    }
  }
}
