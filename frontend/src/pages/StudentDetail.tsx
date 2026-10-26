import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, CreditCard, KeyRound } from 'lucide-react'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { fmtDate, fmtDateTime, fmtRate, fmtTime, rateTone, statusLabel } from '../lib/format'
import { resizePhoto } from '../lib/image'
import type { Class, Student, StudentAttendance } from '../lib/types'
import { Avatar, Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Stat, Table, Td, attendanceTone, useToast } from '../components/ui'

export function AttendanceView({ data }: { data: StudentAttendance }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Présence (année)" value={fmtRate(data.rate)} tone={rateTone(data.rate) === 'none' ? undefined : rateTone(data.rate)} />
        <Stat label="Cours suivis" value={data.history.filter((h) => h.status === 'present' || h.status === 'retard').length} hint={`sur ${data.history.length} cours tenus`} />
        <Stat label="Retards" value={data.history.filter((h) => h.status === 'retard').length} tone="warn" />
        <Stat label="Absences d'affilée" value={data.streak} tone={data.streak >= 3 ? 'bad' : undefined} />
      </div>
      <Card title="Par module">
        {data.by_module.length === 0 ? (
          <p className="text-sm text-slate-500">Pas encore de cours tenu.</p>
        ) : (
          <ul className="space-y-3">
            {data.by_module.map((m) => (
              <li key={m.id}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-800">{m.name}</span>
                  <span className="text-slate-500">
                    {fmtRate(m.rate)} · {m.sessions} cours
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div className={`h-2 rounded-full ${m.rate < 0.5 ? 'bg-red-500' : m.rate < 0.75 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${Math.round(m.rate * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Historique" padded={false}>
        <Table head={['Cours', 'Date', 'Statut', 'Arrivée', 'Départ', 'Méthode']}>
          {data.history.map((h) => (
            <tr key={h.session_id}>
              <Td className="font-medium">{h.module_name}</Td>
              <Td>{fmtDateTime(h.starts_at)}</Td>
              <Td>
                <Badge tone={attendanceTone(h.status)}>{statusLabel[h.status]}</Badge>
              </Td>
              <Td>{h.arrived_at ? fmtTime(h.arrived_at) : '—'}</Td>
              <Td>{h.left_at ? fmtTime(h.left_at) : '—'}</Td>
              <Td>{h.method ? statusLabel[h.method] : '—'}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  )
}

export function StudentDetail() {
  const { id = '' } = useParams()
  const { me } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const st = useQuery({ queryKey: ['student', id], queryFn: () => api.get<Student>(`/students/${id}`) })
  const att = useQuery({ queryKey: ['studentAttendance', id], queryFn: () => api.get<StudentAttendance>(`/students/${id}/attendance`) })
  const [edit, setEdit] = useState(false)
  const [tempPw, setTempPw] = useState<string>()
  const [photoKey, setPhotoKey] = useState(0)
  const reset = useMutation({ mutationFn: () => api.post<{ temp_password: string }>(`/users/${id}/reset-password`), onSuccess: (r) => setTempPw(r.temp_password) })
  const photo = useMutation({
    mutationFn: async (f: File) => api.upload('PUT', `/students/${id}/photo`, await resizePhoto(f)),
    onSuccess: () => {
      toast('Photo officielle enregistrée')
      setPhotoKey((k) => k + 1)
      qc.invalidateQueries({ queryKey: ['student', id] })
    },
    onError: (e) => toast(errorMessage(e), 'bad'),
  })
  if (st.isLoading) return <Spinner />
  if (st.error) return <ErrorBox error={st.error} />
  const s = st.data!
  const admin = me?.role === 'admin'
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Avatar key={photoKey} name={s.full_name} src={s.has_photo ? `/api/v1/students/${s.id}/photo?v=${photoKey}` : null} size={88} />
        <div className="flex-1">
          <PageHeader
            title={s.full_name}
            subtitle={
              <>
                {s.matricule} ·{' '}
                <Link to={`/classes/${s.class_id}`} className="text-brand">
                  {s.filiere_name} {s.class_name}
                </Link>{' '}
                · {s.email} {s.phone && `· ${s.phone}`} {s.birth_date && `· né(e) le ${fmtDate(s.birth_date)}`}
              </>
            }
            actions={
              <>
                {!s.active && <Badge tone="bad">Compte désactivé</Badge>}
                <Badge tone={s.card_status ? 'good' : 'none'}>{s.card_status ? `Carte ${s.card_kind === 'sun' ? 'sécurisée' : 'simple'} active` : 'Sans carte'}</Badge>
                <Button variant="secondary" onClick={() => setEdit(true)}>
                  Modifier
                </Button>
                {admin && (
                  <>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy hover:bg-slate-50">
                      <Camera className="h-4 w-4" /> Photo
                      <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => e.target.files?.[0] && photo.mutate(e.target.files[0])} />
                    </label>
                    <Link to={`/admin/cartes?etudiant=${s.id}`}>
                      <Button variant="secondary">
                        <CreditCard className="h-4 w-4" /> Carte
                      </Button>
                    </Link>
                    <Button variant="secondary" onClick={() => confirm('Générer un mot de passe provisoire pour cet étudiant ?') && reset.mutate()}>
                      <KeyRound className="h-4 w-4" /> Mot de passe
                    </Button>
                  </>
                )}
              </>
            }
          />
        </div>
      </div>
      {att.data ? <AttendanceView data={att.data} /> : <Spinner />}
      {edit && <EditStudent s={s} onClose={() => setEdit(false)} />}
      <Modal open={!!tempPw} onClose={() => setTempPw(undefined)} title="Mot de passe provisoire">
        <p className="text-sm text-slate-600">Remettez ce mot de passe à l'étudiant. Il devra en choisir un nouveau à sa prochaine connexion.</p>
        <div className="mt-3 rounded-lg bg-slate-100 p-3 text-center font-mono text-xl font-bold tracking-wider">{tempPw}</div>
      </Modal>
    </>
  )
}

function EditStudent({ s, onClose }: { s: Student; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => api.get<Class[]>('/classes') })
  const [f, setF] = useState({ full_name: s.full_name, email: s.email, phone: s.phone, matricule: s.matricule, class_id: s.class_id, birth_date: s.birth_date ?? '', active: s.active })
  const save = useMutation({
    mutationFn: () => api.put(`/students/${s.id}`, { ...f, birth_date: f.birth_date || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student', s.id] })
      toast('Fiche mise à jour')
      onClose()
    },
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal open onClose={onClose} title="Modifier la fiche">
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
          <Input value={f.phone} onChange={set('phone')} />
        </Field>
        <Field label="Classe">
          <Select value={f.class_id} onChange={set('class_id')}>
            {classes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.filiere_name} — {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Compte actif
        </label>
        <ErrorBox error={save.error && errorMessage(save.error)} />
        <Button type="submit" loading={save.isPending} className="w-full">
          Enregistrer
        </Button>
      </form>
    </Modal>
  )
}
