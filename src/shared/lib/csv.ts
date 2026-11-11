/**
 * Builds a CSV in the browser and downloads it. Excel in an Indonesian locale splits on
 * semicolons, and the BOM keeps the text UTF-8.
 * ponytail: fine for the dummy data; with tens of thousands of rows from the real API the
 * server should build the file instead (see README).
 */
export function downloadCsv(filename: string, header: string[], rows: string[][]) {
  const csv = [header, ...rows].map((cells) => cells.map((c) => `"${c.replaceAll('"', '""')}"`).join(";")).join("\r\n")
  const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
