import { Link } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import { CalendarClock, Nfc, School } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fmtRange, fmtTime, isoDay, addDays, statusLabel } from '../../lib/format'
import type { Class, Session } from '../../lib/types'
import { Badge, Button, Card, Empty, PageHeader, Spinner } from '../../components/ui'

export function ResponsableHome() {
  const { me } = useAuth()
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => api.get<Class[]>('/classes') })
  const today = new Date()
  const current = useQueries({
    queries: (classes.data ?? []).map((c) => ({
      queryKey: ['current', c.id],
      queryFn: () => api.get<{ session: Session | null }>(`/classes/${c.id}/current-session`),
      refetchInterval: 30_000,
    })),
  })
  const todays = useQueries({
    queries: (classes.data ?? []).map((c) => ({
      queryKey: ['sessions', c.id, isoDay(today)],
      queryFn: () => api.get<Session[]>(`/classes/${c.id}/sessions?from=${isoDay(today)}&to=${isoDay(addDays(today, 1))}`),
    })),
  })
  if (classes.isLoading) return <Spinner />
  return (
    <>
      <PageHeader title={`Bonjour ${me?.full_name.split(' ')[0] ?? ''}`} subtitle="Vos cours du jour et le pointage en un geste." />
      {!classes.data?.length && (
        <Card>
          <Empty icon={<School className="h-10 w-10" />} title="Aucune classe ne vous est encore attribuée">
            Demandez à l'administration de vous affecter à votre classe.
          </Empty>
        </Card>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        {classes.data?.map((c, i) => {
          const cur = current[i]?.data?.session
          const list = todays[i]?.data ?? []
          return (
            <Card key={c.id} title={`${c.filiere_name} — ${c.name}`} actions={<Link to={`/classes/${c.id}`} className="text-sm font-semibold text-brand">Ouvrir la classe</Link>}>
              {cur ? (
                <div className="mb-4 rounded-xl bg-navy p-5 text-white">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gold">Cours ouvert au pointage</div>
                  <div className="mt-1 font-display text-xl font-bold">{cur.module_name}</div>
                  <div className="text-sm text-navy-100/80">
                    {fmtRange(cur.starts_at, cur.ends_at)} {cur.room && `· ${cur.room}`}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-display text-2xl font-bold">{cur.present}</span> / {cur.expected} présents
                    </div>
                    <Link to={`/pointage/${cur.id}`}>
                      <Button variant="gold">
                        <Nfc className="h-4 w-4" /> Pointer
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="mb-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Aucun cours ouvert au pointage en ce moment.</div>
              )}
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Aujourd'hui</div>
              {list.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Pas de cours planifié aujourd'hui.</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100">
                  {list.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-slate-400" />
                        <span className="font-medium">
                          {fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}
                        </span>{' '}
                        {s.module_name}
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge tone={s.status === 'annule' ? 'bad' : s.status === 'confirme' ? 'good' : 'neutral'}>{statusLabel[s.status]}</Badge>
                        <Link to={`/pointage/${s.id}`} className="text-xs font-semibold text-brand">
                          Liste
                        </Link>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )
        })}
      </div>
    </>
  )
}
