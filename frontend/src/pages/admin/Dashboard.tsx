import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../../lib/api'
import { fmtRate, fmtShortDate, rateTone } from '../../lib/format'
import type { Overview } from '../../lib/types'
import { Badge, Card, Empty, ErrorBox, PageHeader, Spinner, Stat, Table, Td } from '../../components/ui'

export function AdminDashboard() {
  const ov = useQuery({ queryKey: ['overview'], queryFn: () => api.get<Overview>('/stats/overview'), refetchInterval: 30_000 })
  if (ov.isLoading) return <Spinner />
  if (ov.error) return <ErrorBox error={ov.error} />
  const o = ov.data!
  const delta = o.rate_30 !== null && o.rate_prev_30 !== null ? Math.round((o.rate_30 - o.rate_prev_30) * 100) : null
  const daily = o.daily.map((d) => ({ day: fmtShortDate(d.day), rate: Math.round(d.rate * 100), present: d.present, expected: d.expected }))
  const byClass = o.by_class.map((c) => ({ name: c.name, rate: Math.round(c.rate * 100) }))
  return (
    <>
      <PageHeader title="Tableau de bord" subtitle="Assiduité de l'établissement, actualisée en continu." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Présence 30 jours" value={fmtRate(o.rate_30)} tone={rateTone(o.rate_30) === 'none' ? undefined : rateTone(o.rate_30)} hint={delta !== null ? `${delta >= 0 ? '+' : ''}${delta} pts vs 30 jours précédents` : 'pas encore de comparaison'} />
        <Stat label="Présents aujourd'hui" value={o.present_today} hint={`${o.sessions_today} cours planifiés`} />
        <Stat label="Étudiants à risque" value={o.at_risk.length} tone={o.at_risk.length ? 'bad' : 'good'} hint="moins de 50 % de présence" />
        <Stat label="Étudiants" value={o.students} hint={`${o.classes} classes · ${o.cards_active} cartes actives`} />
      </div>
      {o.pending_photos > 0 && (
        <Link to="/admin/etudiants?onglet=photos" className="mt-4 block rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          {o.pending_photos} photo(s) d'étudiant en attente de validation →
        </Link>
      )}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Présence par jour (30 jours)">
          {daily.length === 0 ? (
            <Empty title="Pas encore de cours tenu" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={daily} margin={{ top: 10, right: 20, left: -10 }}>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} unit=" %" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v, n, p) => (n === 'rate' ? [`${v} % (${p.payload.present}/${p.payload.expected})`, 'Présence'] : [v, n])} />
                  <ReferenceLine y={75} stroke="#18A957" strokeDasharray="4 4" label={{ value: 'Objectif 75 %', fontSize: 11, fill: '#18A957', position: 'insideTopRight' }} />
                  <Line type="monotone" dataKey="rate" stroke="#1C2B5A" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card title="Présence par classe (30 jours)">
          {byClass.length === 0 ? (
            <Empty title="Pas encore de données" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={byClass} margin={{ top: 10, right: 10, left: -10 }}>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} unit=" %" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [`${v} %`, 'Présence']} />
                  <Bar dataKey="rate" fill="#2F6FED" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
      <Card title="Étudiants à contacter" className="mt-5" padded={false}>
        <Table head={['Étudiant', 'Classe', 'Cours tenus', 'Présence', "Absences d'affilée"]} empty={!o.at_risk.length && <Empty title="Aucun étudiant sous 50 %" />}>
          {o.at_risk.map((s) => (
            <tr key={s.id}>
              <Td>
                <Link to={`/etudiants/${s.id}`} className="font-semibold text-slate-800 hover:text-brand">
                  {s.full_name}
                </Link>
                <div className="text-xs text-slate-500">{s.matricule}</div>
              </Td>
              <Td>{s.class_name}</Td>
              <Td>{s.sessions}</Td>
              <Td>
                <Badge tone="bad">{fmtRate(s.rate)}</Badge>
              </Td>
              <Td>{s.streak > 0 ? <Badge tone={s.streak >= 3 ? 'bad' : 'warn'}>{s.streak}</Badge> : '—'}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  )
}
