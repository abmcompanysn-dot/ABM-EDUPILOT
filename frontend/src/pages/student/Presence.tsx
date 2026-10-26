import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarCheck2, CheckCircle2, Clock, QrCode, XCircle } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import type { ScanResult } from '../../lib/types'
import { Button, Spinner, cx } from '../../components/ui'

const tone: Record<ScanResult['outcome'], { bg: string; title: string; Icon: typeof CheckCircle2 }> = {
  present: { bg: 'bg-emerald-600', title: 'Présence confirmée', Icon: CheckCircle2 },
  retard: { bg: 'bg-amber-500', title: 'Présence en retard', Icon: Clock },
  deja: { bg: 'bg-slate-600', title: 'Déjà pointé', Icon: CalendarCheck2 },
  depart: { bg: 'bg-brand', title: 'Départ enregistré', Icon: CalendarCheck2 },
  refuse: { bg: 'bg-red-600', title: 'Pointage refusé', Icon: XCircle },
}

// Le lieu accompagne le pointage quand l'étudiant l'autorise ; un refus ou une
// lenteur du GPS ne bloque jamais la confirmation.
function position(): Promise<{ lat: number; lng: number } | undefined> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(undefined)
    const timer = setTimeout(() => resolve(undefined), 4000)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(timer)
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude })
      },
      () => {
        clearTimeout(timer)
        resolve(undefined)
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 4000 },
    )
  })
}

export function PresencePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('t') ?? ''
  const [res, setRes] = useState<ScanResult>()
  const sent = useRef(false)

  useEffect(() => {
    if (!token || sent.current) return
    sent.current = true
    position()
      .then((geo) => api.post<ScanResult>('/checkin', { token, ...(geo ?? {}) }))
      .then(setRes)
      .catch((e) => setRes({ outcome: 'refuse', message: errorMessage(e), at: new Date().toISOString() }))
  }, [token])

  if (!token) {
    return (
      <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <QrCode className="mx-auto h-14 w-14 text-navy" />
        <h1 className="mt-3 font-display text-xl font-bold text-navy">Scannez le QR du cours</h1>
        <p className="mt-2 text-sm text-slate-600">Ouvrez l'appareil photo de votre téléphone et visez le QR code affiché par votre responsable : votre présence est confirmée en une seconde.</p>
      </div>
    )
  }
  if (!res) return <Spinner label="Confirmation de votre présence…" />
  const t = tone[res.outcome]
  return (
    <div className="mx-auto max-w-md overflow-hidden rounded-2xl shadow-lg">
      <div className={cx('flex flex-col items-center px-6 py-10 text-center text-white', t.bg)}>
        <t.Icon className="h-20 w-20" />
        <h1 className="mt-4 font-display text-2xl font-bold">{t.title}</h1>
        {res.student && <p className="mt-1 text-lg font-semibold">{res.student.full_name}</p>}
        <p className="mt-2 text-sm opacity-90">{res.message}</p>
      </div>
      <div className="flex flex-col gap-2 bg-white p-5 sm:flex-row">
        <Button variant="secondary" className="flex-1" onClick={() => navigate('/etudiant/presences')}>
          Mes présences
        </Button>
        <Button className="flex-1" onClick={() => navigate('/etudiant')}>
          Accueil
        </Button>
      </div>
    </div>
  )
}
