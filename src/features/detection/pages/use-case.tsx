import { DetectionView } from "@/features/detection/components/detection-view"
import { useFilters } from "@/shared/components/filter-bar"
import type { Kategori } from "@/shared/config/indikasi"

/** The camera-based use cases that have no page of their own; PPE uses the same view in pages/apd.tsx. */
function UseCasePage({ kategori }: { kategori: Kategori | Kategori[] }) {
  const { key } = useFilters()
  return <DetectionView key={`${kategori}|${key}`} kategori={kategori} />
}

/** A person detected inside a restricted area drawn on the camera (tanks, vehicle lanes, the buffer forest). */
export const ZonaTerlarangPage = () => <UseCasePage kategori="zona-terlarang" />
