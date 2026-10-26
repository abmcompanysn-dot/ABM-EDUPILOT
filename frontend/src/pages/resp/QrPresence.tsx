import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Maximize2, Smartphone, X } from 'lucide-react'
import { api } from '../../lib/api'
import { QR } from '../../components/QR'
import { Button, ErrorBox, Spinner } from '../../components/ui'

type SessionQR = { token: string; url: string; expires_at: string; refresh_in: number; module_name: string }

/** QR de présence à projeter en classe : il change toutes les quelques secondes. */
export function QrPresence({ sessionId, present, total, onClose }: { sessionId: string; present: number; total: number; onClose: () => void }) {
  const qr = useQuery({
    queryKey: ['session-qr', sessionId],
    queryFn: () => api.get<SessionQR>(`/sessions/${sessionId}/qr`),
    refetchInterval: (q) => (q.state.data?.refresh_in ?? 15) * 1000,
    refetchIntervalInBackground: true,
    retry: false,
    gcTime: 0,
  })
  const [left, setLeft] = useState(0)
  const [side, setSide] = useState(() => Math.min(window.innerWidth, window.innerHeight) * 0.62)

  useEffect(() => {
    const period = qr.data?.refresh_in ?? 15
    const start = qr.dataUpdatedAt
    const tick = () => setLeft(Math.max(0, period - (Date.now() - start) / 1000))
    tick()
    const i = setInterval(tick, 250)
    return () => clearInterval(i)
  }, [qr.data, qr.dataUpdatedAt])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onResize = () => setSide(Math.min(window.innerWidth, window.innerHeight) * 0.62)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [onClose])

  const period = qr.data?.refresh_in ?? 15
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-navy-900 text-white" role="dialog" aria-label="QR de présence">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <div className="truncate font-display text-lg font-bold sm:text-2xl">{qr.data?.module_name ?? 'QR de présence'}</div>
          <div className="text-sm text-navy-100/80">
            <span className="font-bold text-gold">{present}</span> présents sur {total}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} aria-label="Plein écran">
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button variant="secondary" onClick={onClose} aria-label="Fermer">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-5 pb-8">
        {qr.isLoading ? (
          <Spinner />
        ) : qr.error ? (
          <div className="max-w-md">
            <ErrorBox error={qr.error} />
          </div>
        ) : (
          <>
            <div className="rounded-3xl bg-white p-4 shadow-2xl">
              <QR value={qr.data!.url} size={Math.round(side)} />
            </div>
            <div className="h-1.5 rounded-full bg-white/15" style={{ width: Math.round(side) }}>
              <div className="h-full rounded-full bg-gold transition-[width] duration-200 ease-linear" style={{ width: `${(left / period) * 100}%` }} />
            </div>
            <p className="flex max-w-lg items-center gap-2 text-center text-sm text-navy-100/90 sm:text-base">
              <Smartphone className="h-5 w-5 shrink-0 text-gold" />
              Ouvrez l'appareil photo de votre téléphone et visez ce code pour confirmer votre présence. Il change toutes les {period} secondes.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
