import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

/** QR code en SVG, net à toutes les tailles et imprimable. */
export function QR({ value, size = 160 }: { value: string; size?: number }) {
  const path = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`
    return { d, n }
  }, [value])
  return (
    <svg width={size} height={size} viewBox={`-2 -2 ${path.n + 4} ${path.n + 4}`} role="img" aria-label="QR code" className="rounded-lg bg-white">
      <rect x="-2" y="-2" width={path.n + 4} height={path.n + 4} fill="#fff" />
      <path d={path.d} fill="#14213D" />
    </svg>
  )
}
