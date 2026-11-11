/**
 * For a `md:grid-cols-2 xl:grid-cols-3` grid of `n` items: widens the last item to close its row,
 * so an odd count never leaves an empty slot. Class names are written out in full for Tailwind.
 */
export function fillLastRow(n: number) {
  const md = n % 2 ? "md:[&>:last-child]:col-span-2" : ""
  const xl = ["xl:[&>:last-child]:col-span-1", "xl:[&>:last-child]:col-span-3", "xl:[&>:last-child]:col-span-2"][n % 3]
  return `${md} ${xl}`
}
