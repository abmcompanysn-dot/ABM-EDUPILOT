import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Plus } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import { fmtDate, fmtDateTime } from '../../lib/format'
import type { AcademicYear, Class, Filiere, User } from '../../lib/types'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Table, Td, useToast } from '../../components/ui'

export function StructurePage() {
  return (
    <>
      <PageHeader title="Structure de l'école" subtitle="Années académiques, filières et classes." />
      <div className="space-y-5">
        <Years />
        <Filieres />
        <Classes />
      </div>
    </>
  )
}

function Years() {
  const qc = useQueryClient()
  const toast = useToast()
  const list = useQuery({ queryKey: ['years'], queryFn: () => api.get<AcademicYear[]>('/years') })
  const [edit, setEdit] = useState<Partial<AcademicYear> | null>(null)
  const save = useMutation({
    mutationFn: (y: Partial<AcademicYear>) => (y.id ? api.put(`/years/${y.id}`, y) : api.post('/years', y)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['years'] })
      toast('Année enregistrée')
      setEdit(null)
    },
  })
  return (
    <Card title="Années académiques" actions={<Button onClick={() => setEdit({ label: '', starts_on: '', ends_on: '', active: true })}><Plus className="h-4 w-4" /> Ajouter</Button>} padded={false}>
      <Table head={['Année', 'Début', 'Fin', 'Statut', '']} empty={!list.isLoading && !list.data?.length && <Empty title="Aucune année">Créez l'année en cours : les cartes d'identité expirent à sa date de fin.</Empty>}>
        {list.data?.map((y) => (
          <tr key={y.id}>
            <Td className="font-semibold">{y.label}</Td>
            <Td>{fmtDate(y.starts_on)}</Td>
            <Td>{fmtDate(y.ends_on)}</Td>
            <Td>{y.active ? <Badge tone="good">Active</Badge> : <Badge>Inactive</Badge>}</Td>
            <Td className="text-right">
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEdit(y)}>
                Modifier
              </Button>
            </Td>
          </tr>
        ))}
      </Table>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? "Modifier l'année" : 'Nouvelle année'}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              save.mutate(edit)
            }}
          >
            <Field label="Libellé" hint="Ex. : 2026-2027">
              <Input value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Début">
                <Input type="date" value={edit.starts_on} onChange={(e) => setEdit({ ...edit, starts_on: e.target.value })} required />
              </Field>
              <Field label="Fin">
                <Input type="date" value={edit.ends_on} onChange={(e) => setEdit({ ...edit, ends_on: e.target.value })} required />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Année en cours (les nouvelles cartes y sont rattachées)
            </label>
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

function Filieres() {
  const qc = useQueryClient()
  const toast = useToast()
  const list = useQuery({ queryKey: ['filieres'], queryFn: () => api.get<Filiere[]>('/filieres') })
  const [name, setName] = useState('')
  const add = useMutation({
    mutationFn: () => api.post('/filieres', { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['filieres'] })
      setName('')
      toast('Filière ajoutée')
    },
    onError: (e) => toast(errorMessage(e), 'bad'),
  })
  const rename = useMutation({ mutationFn: (f: Filiere) => api.put(`/filieres/${f.id}`, f), onSuccess: () => qc.invalidateQueries({ queryKey: ['filieres'] }), onError: (e) => toast(errorMessage(e), 'bad') })
  const del = useMutation({ mutationFn: (id: string) => api.del(`/filieres/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['filieres'] }), onError: (e) => toast(errorMessage(e), 'bad') })
  return (
    <Card
      title="Filières"
      actions={
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            add.mutate()
          }}
        >
          <Input placeholder="Nouvelle filière" value={name} onChange={(e) => setName(e.target.value)} required className="w-56" />
          <Button type="submit" loading={add.isPending}>
            <Plus className="h-4 w-4" />
          </Button>
        </form>
      }
      padded={false}
    >
      <Table head={['Filière', 'Classes', '']} empty={!list.isLoading && !list.data?.length && <Empty title="Aucune filière" />}>
        {list.data?.map((f) => (
          <tr key={f.id}>
            <Td className="font-semibold">{f.name}</Td>
            <Td>{f.class_count}</Td>
            <Td className="text-right">
              <Button
                variant="ghost"
                className="px-2 py-1 text-xs"
                onClick={() => {
                  const n = prompt('Nouveau nom de la filière', f.name)
                  if (n && n !== f.name) rename.mutate({ ...f, name: n })
                }}
              >
                Renommer
              </Button>
              <Button variant="dangerGhost" className="px-2 py-1 text-xs" disabled={f.class_count > 0} onClick={() => confirm(`Supprimer ${f.name} ?`) && del.mutate(f.id)}>
                Supprimer
              </Button>
            </Td>
          </tr>
        ))}
      </Table>
    </Card>
  )
}

function Classes() {
  const qc = useQueryClient()
  const toast = useToast()
  const list = useQuery({ queryKey: ['classes'], queryFn: () => api.get<Class[]>('/classes') })
  const filieres = useQuery({ queryKey: ['filieres'], queryFn: () => api.get<Filiere[]>('/filieres') })
  const years = useQuery({ queryKey: ['years'], queryFn: () => api.get<AcademicYear[]>('/years') })
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api.get<User[]>('/staff') })
  const [edit, setEdit] = useState<{ id?: string; name: string; filiere_id: string; academic_year_id: string; invite_open: boolean; managers: string[] } | null>(null)
  const save = useMutation({
    mutationFn: async (c: NonNullable<typeof edit>) => {
      const body = { name: c.name, filiere_id: c.filiere_id, academic_year_id: c.academic_year_id || null, invite_open: c.invite_open }
      const saved = c.id ? await api.put<Class>(`/classes/${c.id}`, body) : await api.post<Class>('/classes', body)
      await api.put(`/classes/${saved.id}/managers`, { user_ids: c.managers })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['classes'] })
      qc.invalidateQueries({ queryKey: ['filieres'] })
      toast('Classe enregistrée')
      setEdit(null)
    },
  })
  const del = useMutation({ mutationFn: (id: string) => api.del(`/classes/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['classes'] }), onError: (e) => toast(errorMessage(e), 'bad') })
  const responsables = staff.data?.filter((u) => u.role === 'responsable' && u.active) ?? []
  const active = years.data?.find((y) => y.active)
  return (
    <Card
      title="Classes"
      actions={
        <Button onClick={() => setEdit({ name: '', filiere_id: filieres.data?.[0]?.id ?? '', academic_year_id: active?.id ?? '', invite_open: true, managers: [] })} disabled={!filieres.data?.length}>
          <Plus className="h-4 w-4" /> Ajouter
        </Button>
      }
      padded={false}
    >
      {list.isLoading ? (
        <Spinner />
      ) : (
        <Table head={['Classe', 'Filière', 'Année', 'Étudiants', 'Responsables', 'Inscriptions', '']} empty={!list.data?.length && <Empty title="Aucune classe" />}>
          {list.data?.map((c) => (
            <tr key={c.id}>
              <Td>
                <Link to={`/classes/${c.id}`} className="font-semibold text-slate-800 hover:text-brand">
                  {c.name}
                </Link>
              </Td>
              <Td>{c.filiere_name}</Td>
              <Td>{c.year_label ?? '—'}</Td>
              <Td>{c.student_count}</Td>
              <Td>{c.managers.map((m) => m.full_name).join(', ') || <span className="text-amber-700">Aucun</span>}</Td>
              <Td>{c.invite_open ? <Badge tone="good">Ouvertes</Badge> : <Badge>Fermées</Badge>}</Td>
              <Td className="text-right">
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-xs"
                  onClick={() => setEdit({ id: c.id, name: c.name, filiere_id: c.filiere_id, academic_year_id: c.academic_year_id ?? '', invite_open: c.invite_open, managers: c.managers.map((m) => m.id) })}
                >
                  Modifier
                </Button>
                <Button variant="dangerGhost" className="px-2 py-1 text-xs" disabled={c.student_count > 0} onClick={() => confirm(`Supprimer la classe ${c.name} ?`) && del.mutate(c.id)}>
                  Supprimer
                </Button>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? 'Modifier la classe' : 'Nouvelle classe'}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              save.mutate(edit)
            }}
          >
            <Field label="Nom" hint="Ex. : L2, Licence 1 groupe A">
              <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Filière">
                <Select value={edit.filiere_id} onChange={(e) => setEdit({ ...edit, filiere_id: e.target.value })} required>
                  {filieres.data?.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Année">
                <Select value={edit.academic_year_id} onChange={(e) => setEdit({ ...edit, academic_year_id: e.target.value })}>
                  <option value="">—</option>
                  {years.data?.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div>
              <div className="mb-1 text-sm font-medium text-slate-700">Responsables</div>
              {responsables.length === 0 ? (
                <p className="text-xs text-slate-500">Créez d'abord des comptes responsables dans « Personnel ».</p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {responsables.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={edit.managers.includes(u.id)}
                        onChange={(e) => setEdit({ ...edit, managers: e.target.checked ? [...edit.managers, u.id] : edit.managers.filter((m) => m !== u.id) })}
                      />
                      {u.full_name} <span className="text-xs text-slate-400">{u.email}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={edit.invite_open} onChange={(e) => setEdit({ ...edit, invite_open: e.target.checked })} /> Autoriser l'auto-inscription par lien
            </label>
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

// ---------------------------------------------------------------- personnel

export function StaffPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const list = useQuery({ queryKey: ['staff'], queryFn: () => api.get<User[]>('/staff') })
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => api.get<Class[]>('/classes') })
  const [edit, setEdit] = useState<{ id?: string; role: 'responsable' | 'admin'; email: string; full_name: string; phone: string; active: boolean; class_ids: string[] } | null>(null)
  const [temp, setTemp] = useState<{ email: string; pw: string }>()
  const save = useMutation({
    mutationFn: async (u: NonNullable<typeof edit>) => {
      if (u.id) return api.put(`/staff/${u.id}`, u).then(() => undefined)
      const r = await api.post<{ user: User; temp_password: string }>('/staff', u)
      return { email: r.user.email, pw: r.temp_password }
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['staff'] })
      qc.invalidateQueries({ queryKey: ['classes'] })
      setEdit(null)
      if (r) setTemp(r)
      else toast('Compte mis à jour')
    },
  })
  const reset = useMutation({ mutationFn: (u: User) => api.post<{ temp_password: string }>(`/users/${u.id}/reset-password`).then((r) => ({ email: u.email, pw: r.temp_password })), onSuccess: setTemp })
  const className = (id: string) => classes.data?.find((c) => c.id === id)?.name ?? '?'
  return (
    <>
      <PageHeader title="Personnel" subtitle="Comptes des responsables de classe et des administrateurs." actions={<Button onClick={() => setEdit({ role: 'responsable', email: '', full_name: '', phone: '', active: true, class_ids: [] })}><Plus className="h-4 w-4" /> Nouveau compte</Button>} />
      <Card padded={false}>
        {list.isLoading ? (
          <Spinner />
        ) : (
          <Table head={['Nom', 'Rôle', 'Classes', 'Dernière connexion', 'Statut', '']}>
            {list.data?.map((u) => (
              <tr key={u.id}>
                <Td>
                  <div className="font-semibold text-slate-800">{u.full_name}</div>
                  <div className="text-xs text-slate-500">
                    {u.email} {u.phone && `· ${u.phone}`}
                  </div>
                </Td>
                <Td>
                  <Badge tone={u.role === 'admin' ? 'info' : 'neutral'}>{u.role === 'admin' ? 'Admin' : 'Responsable'}</Badge>
                </Td>
                <Td>{u.class_ids.map(className).join(', ') || '—'}</Td>
                <Td>{u.last_login_at ? fmtDateTime(u.last_login_at) : 'Jamais'}</Td>
                <Td>{u.active ? <Badge tone="good">Actif</Badge> : <Badge tone="bad">Désactivé</Badge>}</Td>
                <Td className="text-right">
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEdit({ id: u.id, role: u.role as 'admin', email: u.email, full_name: u.full_name, phone: u.phone, active: u.active, class_ids: u.class_ids })}>
                    Modifier
                  </Button>
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => confirm(`Réinitialiser le mot de passe de ${u.full_name} ?`) && reset.mutate(u)}>
                    <KeyRound className="h-3.5 w-3.5" />
                  </Button>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? 'Modifier le compte' : 'Nouveau compte'}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              save.mutate(edit)
            }}
          >
            {!edit.id && (
              <Field label="Rôle">
                <Select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as 'admin' })}>
                  <option value="responsable">Responsable de classe</option>
                  <option value="admin">Administrateur</option>
                </Select>
              </Field>
            )}
            <Field label="Nom complet">
              <Input value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} required />
            </Field>
            {!edit.id && (
              <Field label="Email">
                <Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} required />
              </Field>
            )}
            <Field label="Téléphone">
              <Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            </Field>
            {edit.role === 'responsable' && (
              <div>
                <div className="mb-1 text-sm font-medium text-slate-700">Classes gérées</div>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {classes.data?.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={edit.class_ids.includes(c.id)} onChange={(e) => setEdit({ ...edit, class_ids: e.target.checked ? [...edit.class_ids, c.id] : edit.class_ids.filter((x) => x !== c.id) })} />
                      {c.filiere_name} — {c.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {edit.id && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Compte actif
              </label>
            )}
            <ErrorBox error={save.error && errorMessage(save.error)} />
            <Button type="submit" loading={save.isPending} className="w-full">
              Enregistrer
            </Button>
          </form>
        </Modal>
      )}
      <Modal open={!!temp} onClose={() => setTemp(undefined)} title="Mot de passe provisoire">
        <p className="text-sm text-slate-600">
          Transmettez ce mot de passe à <strong>{temp?.email}</strong>. Il devra le changer à sa première connexion. Il ne sera plus affiché.
        </p>
        <div className="mt-3 rounded-lg bg-slate-100 p-3 text-center font-mono text-xl font-bold tracking-wider">{temp?.pw}</div>
      </Modal>
    </>
  )
}
