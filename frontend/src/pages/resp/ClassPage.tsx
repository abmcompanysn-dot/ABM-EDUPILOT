import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CalendarPlus, ChevronLeft, ChevronRight, Download, FileUp, Link2, Nfc, Plus, RefreshCw, UserPlus } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { addDays, fmtDate, fmtRate, fmtShortDate, fmtTime, isoDay, rateTone, startOfWeek, statusLabel, toLocalInput } from '../../lib/format'
import type { Class, ClassStats, Credential, Module, Session, Student } from '../../lib/types'
import { Avatar, Badge, Button, Card, CopyButton, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Stat, Table, Tabs, Td, Textarea, useToast } from '../../components/ui'
import { QR } from '../../components/QR'

type Tab = 'planning' | 'modules' | 'etudiants' | 'stats'

export function ClassPage() {
  const { id = '' } = useParams()
  const [tab, setTab] = useState<Tab>('planning')
  const cls = useQuery({ queryKey: ['class', id], queryFn: () => api.get<Class>(`/classes/${id}`) })
  if (cls.isLoading) return <Spinner />
  if (cls.error) return <ErrorBox error={cls.error} />
  const c = cls.data!
  return (
    <>
      <PageHeader title={`${c.filiere_name} — ${c.name}`} subtitle={`${c.student_count} étudiant(s) · ${c.year_label ?? 'année non définie'} · responsables : ${c.managers.map((m) => m.full_name).join(', ') || 'aucun'}`} />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'planning', label: 'Planning' },
          { id: 'modules', label: 'Modules' },
          { id: 'etudiants', label: 'Étudiants' },
          { id: 'stats', label: 'Statistiques' },
        ]}
      />
      {tab === 'planning' && <Planning classId={id} />}
      {tab === 'modules' && <Modules classId={id} />}
      {tab === 'etudiants' && <Students cls={c} />}
      {tab === 'stats' && <Stats classId={id} />}
    </>
  )
}

// ---------------------------------------------------------------- planning

function Planning({ classId }: { classId: string }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [week, setWeek] = useState(startOfWeek(new Date()))
  const [edit, setEdit] = useState<Session | 'new' | null>(null)
  const from = isoDay(week)
  const to = isoDay(addDays(week, 7))
  const list = useQuery({ queryKey: ['sessions', classId, from], queryFn: () => api.get<Session[]>(`/classes/${classId}/sessions?from=${from}&to=${to}`) })
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) => api.post(`/sessions/${v.id}/status`, { status: v.status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions', classId] })
      toast('Cours mis à jour')
    },
    onError: (e) => toast(errorMessage(e), 'bad'),
  })
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i))
  return (
    <Card
      title={`Semaine du ${fmtDate(week)}`}
      actions={
        <>
          <Button variant="secondary" onClick={() => setWeek(addDays(week, -7))} aria-label="Semaine précédente">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="secondary" onClick={() => setWeek(startOfWeek(new Date()))}>
            Cette semaine
          </Button>
          <Button variant="secondary" onClick={() => setWeek(addDays(week, 7))} aria-label="Semaine suivante">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button onClick={() => setEdit('new')}>
            <CalendarPlus className="h-4 w-4" /> Ajouter un cours
          </Button>
        </>
      }
    >
      {list.isLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {days.map((d) => {
            const items = list.data?.filter((s) => isoDay(new Date(s.starts_at)) === isoDay(d)) ?? []
            if (!items.length && d.getDay() === 0) return null
            return (
              <div key={isoDay(d)}>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{fmtShortDate(d)}</div>
                {!items.length ? (
                  <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-400">Pas de cours</div>
                ) : (
                  <ul className="space-y-1.5">
                    {items.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                        <div className="w-24 font-semibold text-navy">
                          {fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-800">{s.module_name}</div>
                          <div className="text-xs text-slate-500">
                            {s.teacher || 'Enseignant non précisé'} {s.room && `· ${s.room}`} · {statusLabel[s.mode]}
                            {s.present > 0 && ` · ${s.present}/${s.expected} présents`}
                          </div>
                        </div>
                        <Badge tone={s.status === 'annule' ? 'bad' : s.status === 'confirme' ? 'good' : 'neutral'}>{statusLabel[s.status]}</Badge>
                        <div className="flex gap-1">
                          {s.status === 'prevu' && (
                            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setStatus.mutate({ id: s.id, status: 'confirme' })}>
                              Confirmer
                            </Button>
                          )}
                          {s.status !== 'annule' && (
                            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => confirm('Annuler ce cours ?') && setStatus.mutate({ id: s.id, status: 'annule' })}>
                              Annuler
                            </Button>
                          )}
                          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEdit(s)}>
                            Modifier
                          </Button>
                          <Link to={`/pointage/${s.id}`}>
                            <Button variant="secondary" className="px-2 py-1 text-xs">
                              <Nfc className="h-3.5 w-3.5" /> Présences
                            </Button>
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
      {edit && <SessionModal classId={classId} session={edit === 'new' ? null : edit} defaultDay={week} onClose={() => setEdit(null)} />}
    </Card>
  )
}

function SessionModal({ classId, session, defaultDay, onClose }: { classId: string; session: Session | null; defaultDay: Date; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const modules = useQuery({ queryKey: ['modules', classId], queryFn: () => api.get<Module[]>(`/classes/${classId}/modules`) })
  const startDefault = new Date(Math.max(defaultDay.getTime(), Date.now()))
  startDefault.setHours(8, 0, 0, 0)
  const [moduleId, setModuleId] = useState(session?.module_id ?? '')
  const [start, setStart] = useState(toLocalInput(session ? new Date(session.starts_at) : startDefault))
  const [end, setEnd] = useState(toLocalInput(session ? new Date(session.ends_at) : new Date(startDefault.getTime() + 4 * 3600_000)))
  const [room, setRoom] = useState(session?.room ?? '')
  const [mode, setMode] = useState(session?.mode ?? 'presentiel')
  const [status, setStatus] = useState(session?.status ?? 'confirme')
  const save = useMutation({
    mutationFn: () => {
      const body = { module_id: moduleId, starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(), room, mode, status }
      return session ? api.put(`/sessions/${session.id}`, body) : api.post('/sessions', body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions', classId] })
      toast(session ? 'Cours modifié' : 'Cours ajouté')
      onClose()
    },
  })
  const del = useMutation({
    mutationFn: () => api.del(`/sessions/${session!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions', classId] })
      toast('Cours supprimé')
      onClose()
    },
  })
  return (
    <Modal open onClose={onClose} title={session ? 'Modifier le cours' : 'Nouveau cours'}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Field label="Module">
          <Select value={moduleId} onChange={(e) => setModuleId(e.target.value)} required>
            <option value="">Choisir…</option>
            {modules.data
              ?.filter((m) => m.status === 'en_cours' || m.id === moduleId)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.teacher && `— ${m.teacher}`}
                </option>
              ))}
          </Select>
        </Field>
        {modules.data?.length === 0 && <p className="text-xs text-amber-700">Créez d'abord un module dans l'onglet « Modules ».</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Début">
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
          </Field>
          <Field label="Fin">
            <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Salle">
            <Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="B12" />
          </Field>
          <Field label="Mode">
            <Select value={mode} onChange={(e) => setMode(e.target.value as Session['mode'])}>
              <option value="presentiel">Présentiel</option>
              <option value="en_ligne">En ligne</option>
            </Select>
          </Field>
          <Field label="Statut">
            <Select value={status} onChange={(e) => setStatus(e.target.value as Session['status'])}>
              <option value="prevu">Prévu</option>
              <option value="confirme">Confirmé</option>
              <option value="annule">Annulé</option>
            </Select>
          </Field>
        </div>
        <ErrorBox error={(save.error || del.error) && errorMessage(save.error || del.error)} />
        <div className="flex gap-2">
          <Button type="submit" loading={save.isPending} className="flex-1">
            Enregistrer
          </Button>
          {session && session.present === 0 && (
            <Button type="button" variant="danger" loading={del.isPending} onClick={() => confirm('Supprimer définitivement ce cours ?') && del.mutate()}>
              Supprimer
            </Button>
          )}
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------- modules

function Modules({ classId }: { classId: string }) {
  const qc = useQueryClient()
  const toast = useToast()
  const list = useQuery({ queryKey: ['modules', classId], queryFn: () => api.get<Module[]>(`/classes/${classId}/modules`) })
  const [edit, setEdit] = useState<Partial<Module> | null>(null)
  const save = useMutation({
    mutationFn: (m: Partial<Module>) => (m.id ? api.put(`/modules/${m.id}`, m) : api.post(`/classes/${classId}/modules`, m)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['modules', classId] })
      toast('Module enregistré')
      setEdit(null)
    },
  })
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/modules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modules', classId] }),
    onError: (e) => toast(errorMessage(e), 'bad'),
  })
  return (
    <Card title="Modules de la classe" actions={<Button onClick={() => setEdit({ name: '', teacher: '', planned_hours: 0, status: 'en_cours' })}><Plus className="h-4 w-4" /> Ajouter</Button>} padded={false}>
      {list.isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Module', 'Enseignant', 'Avancement', 'Statut', '']} empty={!list.data?.length && <Empty title="Aucun module">Ajoutez les matières enseignées à cette classe.</Empty>}>
          {list.data?.map((m) => (
            <tr key={m.id}>
              <Td className="font-semibold text-slate-800">{m.name}</Td>
              <Td>{m.teacher || '—'}</Td>
              <Td>
                {Math.round(m.hours_done)} h {m.planned_hours > 0 && `/ ${m.planned_hours} h`} · {m.sessions} cours
                {m.planned_hours > 0 && (
                  <div className="mt-1 h-1.5 w-32 rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.min(100, (m.hours_done / m.planned_hours) * 100)}%` }} />
                  </div>
                )}
              </Td>
              <Td>
                <Badge tone={m.status === 'en_cours' ? 'info' : 'neutral'}>{statusLabel[m.status]}</Badge>
              </Td>
              <Td className="text-right">
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEdit(m)}>
                  Modifier
                </Button>
                <Button variant="dangerGhost" className="px-2 py-1 text-xs" onClick={() => confirm(`Supprimer le module ${m.name} ?`) && del.mutate(m.id)}>
                  Supprimer
                </Button>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? 'Modifier le module' : 'Nouveau module'}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              save.mutate(edit)
            }}
          >
            <Field label="Nom">
              <Input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
            </Field>
            <Field label="Enseignant">
              <Input value={edit.teacher ?? ''} onChange={(e) => setEdit({ ...edit, teacher: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Volume horaire prévu (h)">
                <Input type="number" min={0} value={edit.planned_hours ?? 0} onChange={(e) => setEdit({ ...edit, planned_hours: Number(e.target.value) })} />
              </Field>
              <Field label="Statut">
                <Select value={edit.status ?? 'en_cours'} onChange={(e) => setEdit({ ...edit, status: e.target.value as Module['status'] })}>
                  <option value="en_cours">En cours</option>
                  <option value="termine">Terminé</option>
                </Select>
              </Field>
            </div>
            <ErrorBox error={save.error && errorMessage(save.error)} />
            <Button type="submit" loading={save.isPending} className="w-full">
              Enregistrer
            </Button>
          </form>
        </Modal>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- étudiants

function Students({ cls }: { cls: Class }) {
  const { me } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [add, setAdd] = useState(false)
  const [imp, setImp] = useState(false)
  const [invite, setInvite] = useState(false)
  const list = useQuery({ queryKey: ['students', cls.id], queryFn: () => api.get<Student[]>(`/students?class_id=${cls.id}`) })
  const stats = useQuery({ queryKey: ['classStats', cls.id], queryFn: () => api.get<ClassStats>(`/classes/${cls.id}/stats`) })
  const rates = useMemo(() => new Map(stats.data?.students.map((s) => [s.id, s]) ?? []), [stats.data])
  const regen = useMutation({
    mutationFn: () => api.post<Class>(`/classes/${cls.id}/invite`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['class', cls.id] })
      toast('Nouveau lien généré : l’ancien ne fonctionne plus')
    },
  })
  const filtered = list.data?.filter((s) => !q || (s.full_name + s.matricule + s.email).toLowerCase().includes(q.toLowerCase()))
  const inviteUrl = `${location.origin}/inscription/${cls.invite_code}`
  return (
    <Card
      title="Étudiants"
      actions={
        <>
          <Input placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} className="w-48" />
          <Button variant="secondary" onClick={() => setInvite(true)}>
            <Link2 className="h-4 w-4" /> Lien d'inscription
          </Button>
          <Button variant="secondary" onClick={() => setImp(true)}>
            <FileUp className="h-4 w-4" /> Importer
          </Button>
          <Button onClick={() => setAdd(true)}>
            <UserPlus className="h-4 w-4" /> Ajouter
          </Button>
        </>
      }
      padded={false}
    >
      {list.isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Étudiant', 'Matricule', 'Présence', 'Série d’absences', 'Carte', 'Compte']} empty={!filtered?.length && <Empty title="Aucun étudiant">Partagez le lien d'inscription ou importez une liste.</Empty>}>
          {filtered?.map((s) => {
            const r = rates.get(s.id)
            return (
              <tr key={s.id}>
                <Td>
                  <Link to={`/etudiants/${s.id}`} className="flex items-center gap-2 font-semibold text-slate-800 hover:text-brand">
                    <Avatar name={s.full_name} src={s.has_photo ? `/api/v1/students/${s.id}/photo` : null} size={32} />
                    {s.full_name}
                  </Link>
                </Td>
                <Td>{s.matricule}</Td>
                <Td>{r ? <Badge tone={rateTone(r.rate)}>{fmtRate(r.rate)}</Badge> : <span className="text-slate-400">—</span>}</Td>
                <Td>{r && r.streak > 0 ? <Badge tone={r.streak >= 3 ? 'bad' : 'warn'}>{r.streak} cours</Badge> : '—'}</Td>
                <Td>{s.card_status ? <Badge tone="good">{s.card_kind === 'sun' ? 'Sécurisée' : 'Simple'}</Badge> : <Badge tone="none">Aucune</Badge>}</Td>
                <Td>{s.active ? (s.last_login_at ? 'Actif' : 'Jamais connecté') : <Badge tone="bad">Désactivé</Badge>}</Td>
              </tr>
            )
          })}
        </Table>
      )}
      <AddStudent classId={cls.id} open={add} onClose={() => setAdd(false)} />
      <ImportStudents classId={cls.id} open={imp} onClose={() => setImp(false)} />
      <Modal open={invite} onClose={() => setInvite(false)} title="Inscription des étudiants">
        <div className="space-y-4 text-center">
          <p className="text-sm text-slate-600">Les étudiants scannent ce QR code ou ouvrent le lien pour créer leur compte dans cette classe.</p>
          <div className="flex justify-center">
            <QR value={inviteUrl} size={200} />
          </div>
          <div className="break-all rounded-lg bg-slate-50 p-2 font-mono text-sm">{inviteUrl}</div>
          <div className="flex justify-center gap-2">
            <CopyButton text={inviteUrl} label="Copier le lien" />
            {(me?.role === 'admin' || me?.role === 'responsable') && (
              <Button variant="ghost" onClick={() => confirm('Générer un nouveau lien ? L’actuel cessera de fonctionner.') && regen.mutate()} loading={regen.isPending}>
                <RefreshCw className="h-4 w-4" /> Nouveau lien
              </Button>
            )}
          </div>
          {!cls.invite_open && <ErrorBox error="Les inscriptions sont fermées pour cette classe (réglable par l'administration)." />}
        </div>
      </Modal>
    </Card>
  )
}

export function CredentialsTable({ rows }: { rows: Credential[] }) {
  const csv = 'matricule;nom;email;mot_de_passe_provisoire;erreur\n' + rows.map((r) => [r.matricule, r.full_name, r.email, r.password ?? '', r.error ?? ''].join(';')).join('\n')
  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
    a.download = 'identifiants_provisoires.csv'
    a.click()
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-amber-800">Ces mots de passe provisoires ne seront plus affichés. Téléchargez la liste et remettez-les aux étudiants.</p>
      <Button onClick={download}>
        <Download className="h-4 w-4" /> Télécharger la liste
      </Button>
      <div className="max-h-72 overflow-y-auto">
        <Table head={['Matricule', 'Nom', 'Mot de passe', 'Résultat']}>
          {rows.map((r, i) => (
            <tr key={i}>
              <Td>{r.matricule}</Td>
              <Td>{r.full_name}</Td>
              <Td className="font-mono">{r.password ?? ''}</Td>
              <Td>{r.error ? <span className="text-red-600">{r.error}</span> : <Badge tone="good">Créé</Badge>}</Td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  )
}

function AddStudent({ classId, open, onClose }: { classId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState({ full_name: '', matricule: '', email: '', phone: '', birth_date: '' })
  const [created, setCreated] = useState<Credential>()
  const save = useMutation({
    mutationFn: () => api.post<{ student: Student; temp_password: string }>('/students', { ...f, birth_date: f.birth_date || null, class_id: classId }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['students', classId] })
      setCreated({ matricule: r.student.matricule, full_name: r.student.full_name, email: r.student.email, password: r.temp_password })
      setF({ full_name: '', matricule: '', email: '', phone: '', birth_date: '' })
    },
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const close = () => {
    setCreated(undefined)
    onClose()
  }
  return (
    <Modal open={open} onClose={close} title="Ajouter un étudiant">
      {created ? (
        <div className="space-y-3">
          <CredentialsTable rows={[created]} />
          <Button variant="secondary" onClick={() => setCreated(undefined)} className="w-full">
            Ajouter un autre étudiant
          </Button>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <Field label="Nom complet">
            <Input value={f.full_name} onChange={set('full_name')} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Matricule">
              <Input value={f.matricule} onChange={set('matricule')} required />
            </Field>
            <Field label="Date de naissance">
              <Input type="date" value={f.birth_date} onChange={set('birth_date')} />
            </Field>
          </div>
          <Field label="Email">
            <Input type="email" value={f.email} onChange={set('email')} required />
          </Field>
          <Field label="Téléphone">
            <Input type="tel" value={f.phone} onChange={set('phone')} />
          </Field>
          <ErrorBox error={save.error && errorMessage(save.error)} />
          <Button type="submit" loading={save.isPending} className="w-full">
            Créer le compte
          </Button>
        </form>
      )}
    </Modal>
  )
}

function ImportStudents({ classId, open, onClose }: { classId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [rows, setRows] = useState<Credential[]>()
  const run = useMutation({
    mutationFn: () => api.text<Credential[]>(`/classes/${classId}/students/import`, text, 'text/csv'),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['students', classId] })
      setRows(r)
    },
  })
  const close = () => {
    setRows(undefined)
    setText('')
    onClose()
  }
  return (
    <Modal open={open} onClose={close} title="Importer des étudiants" wide>
      {rows ? (
        <CredentialsTable rows={rows} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Une ligne par étudiant, champs séparés par des points-virgules : <code className="rounded bg-slate-100 px-1">matricule;nom complet;email;téléphone;date de naissance (AAAA-MM-JJ)</code>. Vous pouvez coller un export du
            tableur (Google Sheets, Excel).
          </p>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Ou choisir un fichier CSV</span>
            <input type="file" accept=".csv,text/csv" className="mt-1 block text-sm" onChange={async (e) => e.target.files?.[0] && setText(await e.target.files[0].text())} />
          </label>
          <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'20240DX1;Awa Ndiaye;awa@exemple.sn;771234567;2004-05-12'} className="font-mono text-xs" />
          <ErrorBox error={run.error && errorMessage(run.error)} />
          <Button onClick={() => run.mutate()} loading={run.isPending} disabled={!text.trim()} className="w-full">
            Importer {text.trim() ? `${text.trim().split('\n').length} ligne(s)` : ''}
          </Button>
        </div>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- statistiques

function Stats({ classId }: { classId: string }) {
  const stats = useQuery({ queryKey: ['classStats', classId], queryFn: () => api.get<ClassStats>(`/classes/${classId}/stats`) })
  const today = new Date()
  const [from, setFrom] = useState(isoDay(addDays(today, -30)))
  const [to, setTo] = useState(isoDay(addDays(today, 1)))
  if (stats.isLoading) return <Spinner />
  if (stats.error) return <ErrorBox error={stats.error} />
  const s = stats.data!
  const risk = s.students.filter((x) => x.rate < 0.5)
  const chart = s.by_module.map((m) => ({ name: m.name, rate: Math.round(m.rate * 100) }))
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Présence (année)" value={fmtRate(s.rate)} tone={rateTone(s.rate) === 'none' ? undefined : rateTone(s.rate)} />
        <Stat label="Cours tenus" value={s.sessions} />
        <Stat label="Sous 50 %" value={risk.length} tone={risk.length ? 'bad' : 'good'} hint="étudiants à contacter" />
        <Stat label="Séries ≥ 3 absences" value={s.students.filter((x) => x.streak >= 3).length} tone="warn" />
      </div>
      <Card title="Présence par module">
        {chart.length === 0 ? (
          <Empty title="Pas encore de cours tenu" />
        ) : (
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={chart} layout="vertical" margin={{ left: 20, right: 30 }}>
                <CartesianGrid horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" domain={[0, 100]} unit=" %" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => [`${v} %`, 'Présence']} />
                <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                  {chart.map((c) => (
                    <Cell key={c.name} fill={c.rate < 50 ? '#E5484D' : '#1C2B5A'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
      <Card
        title="Détail par étudiant"
        actions={
          <>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            <a href={`/api/v1/classes/${classId}/attendance.csv?from=${from}&to=${to}`}>
              <Button variant="secondary">
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </a>
          </>
        }
        padded={false}
      >
        <Table head={['Étudiant', 'Cours', 'Présent', 'Retard', 'Excusé', 'Taux', 'Série']}>
          {s.students.map((x) => (
            <tr key={x.id}>
              <Td>
                <Link to={`/etudiants/${x.id}`} className="font-semibold text-slate-800 hover:text-brand">
                  {x.full_name}
                </Link>
                <div className="text-xs text-slate-500">{x.matricule}</div>
              </Td>
              <Td>{x.sessions}</Td>
              <Td>{x.present}</Td>
              <Td>{x.late}</Td>
              <Td>{x.excused}</Td>
              <Td>
                <Badge tone={rateTone(x.rate)}>{fmtRate(x.rate)}</Badge>
              </Td>
              <Td>{x.streak > 0 ? `${x.streak} abs.` : '—'}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  )
}
