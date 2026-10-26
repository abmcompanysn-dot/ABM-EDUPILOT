import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCheck, CloudOff, MapPin, Nfc, Radio, Square, UserCheck, UserX, Wifi } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import { fmtRange, fmtTime, statusLabel } from '../../lib/format'
import { useLive } from '../../lib/live'
import { beep, nfcSupported, startScan, vibrate, type Tap } from '../../lib/nfc'
import { enqueue, flush, pendingCount } from '../../lib/offline'
import type { RosterEntry, ScanResult, Session } from '../../lib/types'
import { Avatar, Badge, Button, Card, ErrorBox, Select, Spinner, attendanceTone, cx, useToast } from '../../components/ui'

type Roster = { session: Session; students: RosterEntry[] }

const outcomeStyle: Record<ScanResult['outcome'], string> = {
  present: 'bg-emerald-600',
  retard: 'bg-amber-500',
  deja: 'bg-slate-600',
  depart: 'bg-brand',
  refuse: 'bg-red-600',
}

const outcomeTitle: Record<ScanResult['outcome'], string> = {
  present: 'Présent',
  retard: 'En retard',
  deja: 'Déjà pointé',
  depart: 'Départ',
  refuse: 'Refusé',
}

export function PointagePage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const roster = useQuery({ queryKey: ['roster', id], queryFn: () => api.get<Roster>(`/sessions/${id}/roster`), refetchInterval: 30_000 })
  const [scanning, setScanning] = useState(false)
  const [last, setLast] = useState<ScanResult & { pending?: boolean }>()
  const [nfcErr, setNfcErr] = useState<string>()
  const [useGeo, setUseGeo] = useState(false)
  const [pending, setPending] = useState(pendingCount(id))
  const [online, setOnline] = useState(navigator.onLine)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const abort = useRef<AbortController>()
  const geo = useRef<{ lat: number; lng: number }>()
  const recent = useRef(new Map<string, number>())
  const classId = roster.data?.session.class_id

  const live = useLive(classId ?? null, (e) => {
    if (e.data.session_id !== id) return
    qc.setQueryData<Roster>(['roster', id], (old) =>
      old && {
        ...old,
        students: old.students.map((s) =>
          s.student_id !== e.data.student_id
            ? s
            : e.type === 'attendance.departed'
              ? { ...s, left_at: e.data.at }
              : e.data.status === 'absent'
                ? { ...s, status: null, method: null, arrived_at: null }
                : { ...s, status: (e.data.status as RosterEntry['status']) ?? s.status, method: e.data.method ?? s.method, arrived_at: s.arrived_at ?? e.data.at },
        ),
      },
    )
  })

  useEffect(() => {
    const on = () => {
      setOnline(true)
      flush((r) => setLast(r)).then((n) => {
        if (n > 0) toast(`${n} pointage(s) en attente envoyé(s)`)
        setPending(pendingCount(id))
        qc.invalidateQueries({ queryKey: ['roster', id] })
      })
    }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [id, qc, toast])

  useEffect(() => {
    if (!useGeo || !navigator.geolocation) return
    const w = navigator.geolocation.watchPosition((p) => (geo.current = { lat: p.coords.latitude, lng: p.coords.longitude }), () => setUseGeo(false), { enableHighAccuracy: true })
    return () => navigator.geolocation.clearWatch(w)
  }, [useGeo])

  useEffect(() => () => abort.current?.abort(), [])

  const onTap = useCallback(
    async (t: Tap) => {
      // Tant qu'une carte reste posée, le téléphone la relit : on ignore les relectures rapprochées.
      const key = t.uid
      const seen = recent.current.get(key)
      if (seen && Date.now() - seen < 3000) return
      recent.current.set(key, Date.now())
      const body = { session_id: id, card_url: t.url, card_uid: t.url ? undefined : t.uid, ...(geo.current ?? {}) }
      if (!navigator.onLine) {
        enqueue(body)
        setPending(pendingCount(id))
        setLast({ outcome: 'present', message: 'Hors connexion : pointage mis en attente', at: new Date().toISOString(), pending: true })
        vibrate(80)
        return
      }
      try {
        const r = await api.post<ScanResult>('/scans', body)
        setLast(r)
        const ok = r.outcome !== 'refuse'
        beep(ok)
        vibrate(ok ? 80 : [80, 60, 80, 60, 200])
      } catch (e) {
        setLast({ outcome: 'refuse', message: errorMessage(e), at: new Date().toISOString() })
        beep(false)
      }
    },
    [id],
  )

  const toggleScan = async () => {
    if (scanning) {
      abort.current?.abort()
      setScanning(false)
      return
    }
    setNfcErr(undefined)
    abort.current = new AbortController()
    try {
      await startScan(onTap, (m) => setNfcErr(m), abort.current.signal)
      setScanning(true)
    } catch (e) {
      setNfcErr(errorMessage(e))
    }
  }

  const mark = useMutation({
    mutationFn: (v: { ids: string[]; status: string; method?: string }) => api.post(`/sessions/${id}/attendance`, { student_ids: v.ids, status: v.status, method: v.method }),
    onSuccess: () => {
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['roster', id] })
      toast('Présences enregistrées')
    },
    onError: (e) => toast(errorMessage(e), 'bad'),
  })

  if (roster.isLoading) return <Spinner />
  if (roster.error) return <ErrorBox error={roster.error} />
  const { session, students } = roster.data!
  const present = students.filter((s) => s.status === 'present' || s.status === 'retard').length
  const online_ = session.mode === 'en_ligne'

  return (
    <div className="mx-auto max-w-4xl">
      <Link to={`/classes/${session.class_id}`} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-navy">
        <ArrowLeft className="h-4 w-4" /> {session.class_name}
      </Link>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy">{session.module_name}</h1>
          <p className="text-sm text-slate-600">
            {fmtRange(session.starts_at, session.ends_at)} {session.room && `· ${session.room}`} · {statusLabel[session.mode]}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Badge tone={live ? 'good' : 'none'}>
            <Radio className="h-3 w-3" /> {live ? 'En direct' : 'Hors direct'}
          </Badge>
          <Badge tone={online ? 'good' : 'bad'}>{online ? <Wifi className="h-3 w-3" /> : <CloudOff className="h-3 w-3" />} {online ? 'En ligne' : 'Hors ligne'}</Badge>
          {pending > 0 && <Badge tone="warn">{pending} en attente</Badge>}
        </div>
      </div>

      {session.status === 'annule' && <ErrorBox error="Ce cours est annulé : le pointage est fermé." />}

      {!online_ && (
        <Card className="mb-5" padded={false}>
          <div className="grid gap-0 md:grid-cols-[1fr_auto]">
            <div className={cx('flex min-h-[220px] flex-col items-center justify-center p-6 text-center text-white transition-colors', last ? outcomeStyle[last.outcome] : 'bg-navy')}>
              {last?.student ? (
                <>
                  <Avatar name={last.student.full_name} src={last.student.has_photo ? `/api/v1/students/${last.student.id}/photo` : null} size={112} />
                  <div className="mt-3 font-display text-2xl font-bold">{last.student.full_name}</div>
                  <div className="text-sm opacity-90">{last.student.matricule}</div>
                  <div className="mt-2 text-lg font-bold uppercase tracking-wide">{outcomeTitle[last.outcome]}</div>
                  <div className="text-sm opacity-90">{last.message}</div>
                </>
              ) : last ? (
                <>
                  <div className="text-lg font-bold uppercase">{last.pending ? 'En attente' : outcomeTitle[last.outcome]}</div>
                  <div className="mt-1 text-sm opacity-90">{last.message}</div>
                </>
              ) : (
                <>
                  <Nfc className={cx('h-16 w-16 text-gold', scanning && 'animate-pulse')} />
                  <div className="mt-3 font-display text-xl font-bold">{scanning ? 'Approchez les cartes une par une' : 'Mode pointage NFC'}</div>
                  <div className="mt-1 max-w-xs text-sm text-navy-100/80">L'étudiant pose sa carte au dos du téléphone. Vérifiez que la photo correspond à la personne.</div>
                </>
              )}
            </div>
            <div className="flex flex-col items-center justify-center gap-3 border-t border-slate-100 p-6 md:border-l md:border-t-0">
              <div className="text-center">
                <div className="font-display text-5xl font-bold text-navy">{present}</div>
                <div className="text-sm text-slate-500">présents sur {students.length}</div>
              </div>
              {nfcSupported() ? (
                <Button onClick={toggleScan} variant={scanning ? 'secondary' : 'gold'} className="w-48 py-3" disabled={session.status === 'annule'}>
                  {scanning ? <Square className="h-4 w-4" /> : <Nfc className="h-5 w-5" />}
                  {scanning ? 'Arrêter' : 'Démarrer le pointage'}
                </Button>
              ) : (
                <p className="max-w-[14rem] text-center text-xs text-slate-500">Lecture NFC indisponible ici (Chrome Android requis). Sur iPhone : touchez la carte, puis « Pointer présent » sur la page qui s'ouvre.</p>
              )}
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={useGeo} onChange={(e) => setUseGeo(e.target.checked)} /> <MapPin className="h-3.5 w-3.5" /> Enregistrer le lieu
              </label>
            </div>
          </div>
          {nfcErr && (
            <div className="border-t border-slate-100 p-3">
              <ErrorBox error={nfcErr} />
            </div>
          )}
        </Card>
      )}

      <Card
        title={online_ ? 'Présence au cours en ligne' : 'Liste de la classe'}
        actions={
          selected.size > 0 && (
            <>
              <span className="text-sm text-slate-500">{selected.size} sélectionné(s)</span>
              <Button onClick={() => mark.mutate({ ids: [...selected], status: 'present', method: online_ ? 'en_ligne' : 'manuel' })} loading={mark.isPending}>
                <UserCheck className="h-4 w-4" /> Présents
              </Button>
              <Button variant="secondary" onClick={() => mark.mutate({ ids: [...selected], status: 'excuse' })}>
                Excusés
              </Button>
              <Button variant="ghost" onClick={() => mark.mutate({ ids: [...selected], status: 'absent' })}>
                <UserX className="h-4 w-4" /> Absents
              </Button>
            </>
          )
        }
        padded={false}
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-2 text-sm">
          <input
            type="checkbox"
            checked={selected.size === students.length && students.length > 0}
            onChange={(e) => setSelected(e.target.checked ? new Set(students.map((s) => s.student_id)) : new Set())}
          />
          <span className="text-slate-500">Tout sélectionner (saisie manuelle : oubli de carte, cours en ligne, excuse)</span>
          <CheckCheck className="ml-auto h-4 w-4 text-slate-400" />
        </div>
        <ul className="divide-y divide-slate-100">
          {students.map((s) => (
            <li key={s.student_id} className="flex items-center gap-3 px-5 py-2.5">
              <input
                type="checkbox"
                checked={selected.has(s.student_id)}
                onChange={(e) => {
                  const n = new Set(selected)
                  e.target.checked ? n.add(s.student_id) : n.delete(s.student_id)
                  setSelected(n)
                }}
              />
              <Avatar name={s.full_name} src={s.has_photo ? `/api/v1/students/${s.student_id}/photo` : null} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-800">{s.full_name}</div>
                <div className="text-xs text-slate-500">
                  {s.matricule}
                  {s.arrived_at && ` · arrivé ${fmtTime(s.arrived_at)}`}
                  {s.left_at && ` · parti ${fmtTime(s.left_at)}`}
                  {s.method && ` · ${statusLabel[s.method] ?? s.method}`}
                </div>
              </div>
              <Badge tone={attendanceTone(s.status)}>{s.status ? statusLabel[s.status] : 'Non pointé'}</Badge>
              <Select
                aria-label="Changer le statut"
                className="hidden w-32 py-1 text-xs sm:block"
                value=""
                onChange={(e) => e.target.value && mark.mutate({ ids: [s.student_id], status: e.target.value, method: online_ ? 'en_ligne' : 'manuel' })}
              >
                <option value="">Modifier…</option>
                <option value="present">Présent</option>
                <option value="retard">En retard</option>
                <option value="excuse">Excusé</option>
                <option value="absent">Absent</option>
              </Select>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
