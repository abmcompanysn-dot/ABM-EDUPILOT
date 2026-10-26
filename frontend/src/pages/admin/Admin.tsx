import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CreditCard, DoorOpen, Nfc, Plus, Printer, RefreshCw, Star, X } from 'lucide-react'
import { api, errorMessage, qs } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fmtDateTime, statusLabel } from '../../lib/format'
import { nfcSupported, readOnce } from '../../lib/nfc'
import type { AuditEntry, Card as IdCard, Class, Device, DoorEvent, Feedback, PhotoRequest, Programming, Settings, Student } from '../../lib/types'
import { Avatar, Badge, Button, Card, CopyButton, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Table, Tabs, Td, cx, useToast } from '../../components/ui'

// ---------------------------------------------------------------- étudiants

export function AdminStudents() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('onglet') as 'liste' | 'photos') ?? 'liste'
  const [q, setQ] = useState('')
  const [classId, setClassId] = useState('')
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => api.get<Class[]>('/classes') })
  const list = useQuery({ queryKey: ['students', 'all', classId, q], queryFn: () => api.get<Student[]>('/students' + qs({ class_id: classId, q })), enabled: tab === 'liste' })
  return (
    <>
      <PageHeader title="Étudiants" subtitle="Pour ajouter ou importer des étudiants, ouvrez leur classe." />
      <Tabs
        value={tab}
        onChange={(v) => setParams({ onglet: v })}
        tabs={[
          { id: 'liste', label: 'Liste' },
          { id: 'photos', label: 'Photos à valider' },
        ]}
      />
      {tab === 'photos' ? (
        <PhotoRequests />
      ) : (
        <Card
          padded={false}
          actions={
            <>
              <Input placeholder="Nom, matricule, email…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
              <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-56">
                <option value="">Toutes les classes</option>
                {classes.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.filiere_name} — {c.name}
                  </option>
                ))}
              </Select>
            </>
          }
          title={list.data ? `${list.data.length} étudiant(s)` : 'Étudiants'}
        >
          {list.isLoading ? (
            <Spinner />
          ) : (
            <Table head={['Étudiant', 'Matricule', 'Classe', 'Carte', 'Compte']} empty={!list.data?.length && <Empty title="Aucun étudiant trouvé" />}>
              {list.data?.map((s) => (
                <tr key={s.id}>
                  <Td>
                    <Link to={`/etudiants/${s.id}`} className="flex items-center gap-2 font-semibold text-slate-800 hover:text-brand">
                      <Avatar name={s.full_name} src={s.has_photo ? `/api/v1/students/${s.id}/photo` : null} size={32} />
                      {s.full_name}
                    </Link>
                  </Td>
                  <Td>{s.matricule}</Td>
                  <Td>
                    {s.filiere_name} {s.class_name}
                  </Td>
                  <Td>{s.card_status ? <Badge tone="good">{s.card_kind === 'sun' ? 'Sécurisée' : 'Simple'}</Badge> : <Badge tone="none">Aucune</Badge>}</Td>
                  <Td>{s.active ? 'Actif' : <Badge tone="bad">Désactivé</Badge>}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}
    </>
  )
}

function PhotoRequests() {
  const qc = useQueryClient()
  const toast = useToast()
  const list = useQuery({ queryKey: ['photoRequests'], queryFn: () => api.get<PhotoRequest[]>('/photo-requests') })
  const decide = useMutation({
    mutationFn: (v: { id: string; ok: boolean }) => api.post(`/photo-requests/${v.id}/${v.ok ? 'approve' : 'reject'}`),
    onSuccess: (_, v) => {
      toast(v.ok ? 'Photo validée' : 'Photo refusée')
      qc.invalidateQueries({ queryKey: ['photoRequests'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
    },
  })
  if (list.isLoading) return <Spinner />
  if (!list.data?.length)
    return (
      <Card>
        <Empty title="Aucune photo en attente" />
      </Card>
    )
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.data.map((r) => (
        <Card key={r.id}>
          <div className="flex gap-4">
            <div className="text-center">
              <div className="text-xs text-slate-500">Actuelle</div>
              <Avatar name={r.full_name} src={r.has_current ? `/api/v1/students/${r.student_id}/photo` : null} size={72} />
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-500">Proposée</div>
              <img src={`/api/v1/photo-requests/${r.id}/image`} alt="" className="h-24 w-[72px] rounded-lg object-cover ring-2 ring-gold" />
            </div>
          </div>
          <div className="mt-3 font-semibold text-slate-800">{r.full_name}</div>
          <div className="text-xs text-slate-500">
            {r.matricule} · {r.class_name} · {fmtDateTime(r.created_at)}
          </div>
          <div className="mt-3 flex gap-2">
            <Button className="flex-1" onClick={() => decide.mutate({ id: r.id, ok: true })}>
              <Check className="h-4 w-4" /> Valider
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => decide.mutate({ id: r.id, ok: false })}>
              <X className="h-4 w-4" /> Refuser
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- cartes

export function CardsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const [params] = useSearchParams()
  const [status, setStatus] = useState('active')
  const [issueFor, setIssueFor] = useState<string | null>(params.get('etudiant'))
  const list = useQuery({ queryKey: ['cards', status], queryFn: () => api.get<IdCard[]>('/cards' + qs({ status })) })
  const revoke = useMutation({
    mutationFn: (v: { id: string; reason: string }) => api.post(`/cards/${v.id}/revoke`, { reason: v.reason }),
    onSuccess: () => {
      toast('Carte désactivée partout')
      qc.invalidateQueries({ queryKey: ['cards'] })
    },
  })
  return (
    <>
      <PageHeader
        title="Cartes d'identité"
        subtitle="Émettre, imprimer et désactiver les cartes NFC des étudiants."
        actions={
          <Button onClick={() => setIssueFor('')}>
            <Plus className="h-4 w-4" /> Émettre une carte
          </Button>
        }
      />
      <Card
        padded={false}
        actions={
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
            <option value="active">Actives</option>
            <option value="perdue">Perdues</option>
            <option value="revoquee">Révoquées</option>
            <option value="remplacee">Remplacées</option>
            <option value="">Toutes</option>
          </Select>
        }
        title={list.data ? `${list.data.length} carte(s)` : 'Cartes'}
      >
        {list.isLoading ? (
          <Spinner />
        ) : (
          <Table head={['Étudiant', 'Type', 'UID', 'Année', 'Émise', 'Statut', '']} empty={!list.data?.length && <Empty icon={<CreditCard className="h-10 w-10" />} title="Aucune carte" />}>
            {list.data?.map((c) => (
              <tr key={c.id}>
                <Td>
                  <Link to={`/etudiants/${c.student_id}`} className="font-semibold text-slate-800 hover:text-brand">
                    {c.student_name}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {c.matricule} · {c.class_name}
                  </div>
                </Td>
                <Td>
                  <Badge tone={c.kind === 'sun' ? 'info' : 'neutral'}>{c.kind === 'sun' ? 'NTAG 424 DNA' : 'Puce simple'}</Badge>
                </Td>
                <Td className="font-mono text-xs">{c.uid}</Td>
                <Td>{c.year_label ?? '—'}</Td>
                <Td>{fmtDateTime(c.issued_at)}</Td>
                <Td>
                  <Badge tone={c.status === 'active' ? 'good' : 'bad'}>{statusLabel[c.status]}</Badge>
                </Td>
                <Td className="text-right">
                  <Link to={`/admin/cartes/imprimer/${c.student_id}`} target="_blank">
                    <Button variant="ghost" className="px-2 py-1 text-xs">
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                  {c.status === 'active' && (
                    <>
                      <Button variant="dangerGhost" className="px-2 py-1 text-xs" onClick={() => confirm(`Déclarer perdue la carte de ${c.student_name} ?`) && revoke.mutate({ id: c.id, reason: 'perdue' })}>
                        Perdue
                      </Button>
                      <Button variant="dangerGhost" className="px-2 py-1 text-xs" onClick={() => confirm(`Révoquer la carte de ${c.student_name} ?`) && revoke.mutate({ id: c.id, reason: 'revoquee' })}>
                        Révoquer
                      </Button>
                    </>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {issueFor !== null && <IssueCard studentId={issueFor} onClose={() => setIssueFor(null)} />}
    </>
  )
}

function IssueCard({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [student, setStudent] = useState<Student | null>(null)
  const [kind, setKind] = useState<'sun' | 'uid'>('sun')
  const [uid, setUid] = useState('')
  const [reading, setReading] = useState(false)
  const [nfcErr, setNfcErr] = useState<string>()
  const [prog, setProg] = useState<Programming | null>()
  const found = useQuery({ queryKey: ['students', 'search', q], queryFn: () => api.get<Student[]>('/students' + qs({ q })), enabled: q.length >= 2 && !student })
  const preset = useQuery({ queryKey: ['student', studentId], queryFn: () => api.get<Student>(`/students/${studentId}`), enabled: !!studentId })
  useEffect(() => {
    if (preset.data) setStudent(preset.data)
  }, [preset.data])
  const issue = useMutation({
    mutationFn: () => api.post<{ card: IdCard; programming: Programming | null }>(`/students/${student!.id}/cards`, { uid, kind }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['cards'] })
      setProg(r.programming)
    },
  })
  const read = async () => {
    setNfcErr(undefined)
    setReading(true)
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 30_000)
    try {
      const t = await readOnce(ac.signal)
      setUid(t.uid.replace(/:/g, '').toUpperCase())
      if (t.url?.includes('e=') && t.url.includes('c=')) setKind('sun')
    } catch (e) {
      setNfcErr(errorMessage(e))
    } finally {
      clearTimeout(timer)
      setReading(false)
    }
  }
  return (
    <Modal open onClose={onClose} title="Émettre une carte" wide>
      {prog !== undefined ? (
        <div className="space-y-4">
          <div className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Carte enregistrée pour {student?.full_name}. L'ancienne carte éventuelle est désactivée.</div>
          {prog && (
            <div className="space-y-2 text-sm">
              <p className="text-slate-700">
                Programmez maintenant la puce NTAG 424 DNA avec ces paramètres (voir <code>docs/CARTES.md</code>). <strong>Ces clés sont secrètes :</strong> ne les copiez nulle part ailleurs que dans l'outil de programmation.
              </p>
              {[
                ['Modèle de lien (fichier NDEF)', prog.url_template],
                ['Position PICCData (e)', String(prog.picc_data_offset)],
                ['Position SDMMAC (c)', String(prog.mac_offset)],
                ['Clé 0 — application', prog.app_master_key],
                ['Clé SDM — métadonnées (lecture)', prog.sdm_meta_read_key],
                ['Clé SDM — fichier (MAC)', prog.sdm_file_read_key],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
                  <div className="w-56 shrink-0 text-xs font-semibold text-slate-500">{k}</div>
                  <div className="min-w-0 flex-1 break-all font-mono text-xs">{v}</div>
                  <CopyButton text={v!} label="Copier" />
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Link to={`/admin/cartes/imprimer/${student?.id}`} target="_blank" className="flex-1">
              <Button variant="secondary" className="w-full">
                <Printer className="h-4 w-4" /> Imprimer la carte
              </Button>
            </Link>
            <Button onClick={onClose} className="flex-1">
              Terminé
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            issue.mutate()
          }}
        >
          {student ? (
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
              <Avatar name={student.full_name} src={student.has_photo ? `/api/v1/students/${student.id}/photo` : null} />
              <div className="flex-1">
                <div className="font-semibold">{student.full_name}</div>
                <div className="text-xs text-slate-500">
                  {student.matricule} · {student.filiere_name} {student.class_name}
                </div>
              </div>
              {!studentId && (
                <Button variant="ghost" type="button" onClick={() => setStudent(null)}>
                  Changer
                </Button>
              )}
            </div>
          ) : (
            <Field label="Étudiant">
              <Input placeholder="Rechercher par nom ou matricule…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
              <div className="mt-1 max-h-48 overflow-y-auto">
                {found.data?.map((s) => (
                  <button type="button" key={s.id} onClick={() => setStudent(s)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50">
                    <span className="font-semibold">{s.full_name}</span> <span className="text-slate-500">{s.matricule}</span>
                    {s.card_status && <Badge tone="warn">a déjà une carte</Badge>}
                  </button>
                ))}
              </div>
            </Field>
          )}
          {student && !student.has_photo && <ErrorBox error="Cet étudiant n'a pas encore de photo officielle : ajoutez-la depuis sa fiche avant d'imprimer la carte." />}
          <Field label="Type de puce">
            <Select value={kind} onChange={(e) => setKind(e.target.value as 'sun')}>
              <option value="sun">NTAG 424 DNA — sécurisée, impossible à copier (recommandé)</option>
              <option value="uid">Puce simple (Mifare, NTAG 213…) — identifiée par son numéro, copiable</option>
            </Select>
          </Field>
          <Field label="Identifiant de la puce (UID)" hint={kind === 'sun' ? '7 octets, 14 caractères hexadécimaux, ex. 04A1B2C3D4E5F6' : 'Numéro de série lu par le téléphone ou un lecteur USB'}>
            <div className="flex gap-2">
              <Input value={uid} onChange={(e) => setUid(e.target.value)} placeholder="04A1B2C3D4E5F6" className="font-mono" required />
              {nfcSupported() && (
                <Button type="button" variant="secondary" onClick={read} loading={reading}>
                  <Nfc className="h-4 w-4" /> Lire
                </Button>
              )}
            </div>
          </Field>
          {reading && <p className="text-sm text-brand">Posez la carte au dos du téléphone…</p>}
          <ErrorBox error={nfcErr ?? (issue.error && errorMessage(issue.error))} />
          <Button type="submit" loading={issue.isPending} disabled={!student} className="w-full">
            Associer la carte
          </Button>
        </form>
      )}
    </Modal>
  )
}

/** Carte imprimable au format CR80 (carte bancaire, 85,6 × 54 mm). */
export function PrintCard() {
  const { id = '' } = useParams()
  const { settings } = useAuth()
  const st = useQuery({ queryKey: ['student', id], queryFn: () => api.get<Student>(`/students/${id}`) })
  const cards = useQuery({ queryKey: ['cards', 'student', id], queryFn: () => api.get<IdCard[]>('/cards' + qs({ student_id: id, status: 'active' })) })
  if (st.isLoading) return <Spinner />
  const s = st.data!
  const year = cards.data?.[0]?.year_label
  return (
    <div className="min-h-screen bg-slate-200 p-8 print:bg-white print:p-0">
      <style>{'@page { size: 85.6mm 54mm; margin: 0 } @media print { .no-print { display: none } }'}</style>
      <div className="no-print mb-4 flex gap-2">
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Imprimer
        </Button>
        <span className="self-center text-sm text-slate-600">Format carte bancaire (85,6 × 54 mm). Imprimante PVC ou impression sur papier cartonné puis plastification.</span>
      </div>
      <div className="relative overflow-hidden bg-gradient-to-br from-navy-900 via-navy to-brand text-white shadow-xl print:shadow-none" style={{ width: '85.6mm', height: '54mm', borderRadius: '3mm', padding: '3.5mm' }}>
        <div className="flex items-center justify-between" style={{ fontSize: '2.4mm' }}>
          <span className="font-bold uppercase tracking-widest text-gold">Carte d'étudiant</span>
          <span className="font-semibold opacity-80">{settings?.school_name}</span>
        </div>
        <div className="flex" style={{ gap: '3mm', marginTop: '3mm' }}>
          <div className="overflow-hidden bg-white/10" style={{ width: '20mm', height: '26mm', borderRadius: '1.5mm' }}>
            {s.has_photo ? <img src={`/api/v1/students/${s.id}/photo`} alt="" className="h-full w-full object-cover" /> : null}
          </div>
          <div style={{ fontSize: '2.3mm', lineHeight: 1.35 }}>
            <div className="font-display font-bold" style={{ fontSize: '3.6mm', lineHeight: 1.1 }}>
              {s.full_name}
            </div>
            <div style={{ marginTop: '1.5mm', opacity: 0.7 }}>Filière · classe</div>
            <div className="font-semibold">
              {s.filiere_name} · {s.class_name}
            </div>
            <div style={{ marginTop: '1mm', opacity: 0.7 }}>Matricule</div>
            <div className="font-semibold">{s.matricule}</div>
            <div style={{ marginTop: '1mm', opacity: 0.7 }}>Année académique</div>
            <div className="font-semibold">{year ?? '—'}</div>
          </div>
        </div>
        <div className="absolute flex items-center gap-1 font-semibold" style={{ right: '3.5mm', bottom: '3mm', fontSize: '2mm' }}>
          <Nfc style={{ width: '4mm', height: '4mm' }} className="text-gold" /> Approchez un téléphone pour vérifier
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- portes

export function DoorsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const devices = useQuery({ queryKey: ['devices'], queryFn: () => api.get<Device[]>('/devices') })
  const events = useQuery({ queryKey: ['doorEvents'], queryFn: () => api.get<DoorEvent[]>('/door-events?limit=200'), refetchInterval: 15_000 })
  const [edit, setEdit] = useState<Partial<Device> | null>(null)
  const [secret, setSecret] = useState<{ id: string; secret: string }>()
  const save = useMutation({
    mutationFn: async (v: { d: Partial<Device>; rotate?: boolean }) => {
      const r = v.d.id ? await api.put<{ device: Device; secret: string }>(`/devices/${v.d.id}${v.rotate ? '?rotate=1' : ''}`, v.d) : await api.post<{ device: Device; secret: string }>('/devices', v.d)
      return r
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['devices'] })
      setEdit(null)
      if (r.secret) setSecret({ id: r.device.id, secret: r.secret })
      else toast('Porte enregistrée')
    },
    onError: (e) => toast(errorMessage(e), 'bad'),
  })
  const del = useMutation({ mutationFn: (id: string) => api.del(`/devices/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }) })
  return (
    <>
      <PageHeader title="Portes connectées" subtitle="Lecteurs ESP32 à l'entrée : la porte s'ouvre seulement si l'étudiant a cours." actions={<Button onClick={() => setEdit({ name: '', location: '', open_ms: 5000, active: true })}><Plus className="h-4 w-4" /> Ajouter une porte</Button>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Portes" padded={false}>
          {devices.isLoading ? (
            <Spinner />
          ) : !devices.data?.length ? (
            <Empty icon={<DoorOpen className="h-10 w-10" />} title="Aucune porte">
              Ajoutez une porte pour obtenir l'identifiant et le secret à configurer dans l'ESP32.
            </Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {devices.data.map((d) => (
                <li key={d.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-800">{d.name}</div>
                      <div className="text-xs text-slate-500">
                        {d.location || 'Emplacement non précisé'} · ouverture {d.open_ms / 1000} s · {d.last_seen_at ? `vue ${fmtDateTime(d.last_seen_at)}` : 'jamais connectée'} · {d.last_sync_at ? `liste hors ligne du ${fmtDateTime(d.last_sync_at)}` : 'pas de liste hors ligne'}
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-slate-400">{d.id}</div>
                    </div>
                    <Badge tone={d.active ? 'good' : 'bad'}>{d.active ? 'Active' : 'Désactivée'}</Badge>
                  </div>
                  <div className="mt-2 flex gap-1">
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEdit(d)}>
                      Modifier
                    </Button>
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => confirm('Générer un nouveau secret ? L’ESP32 devra être reconfiguré.') && save.mutate({ d, rotate: true })}>
                      <RefreshCw className="h-3.5 w-3.5" /> Nouveau secret
                    </Button>
                    <Button variant="dangerGhost" className="px-2 py-1 text-xs" onClick={() => confirm(`Supprimer la porte ${d.name} ?`) && del.mutate(d.id)}>
                      Supprimer
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Passages récents" padded={false}>
          <Table head={['Heure', 'Porte', 'Étudiant', 'Résultat']} empty={!events.isLoading && !events.data?.length && <Empty title="Aucun passage" />}>
            {events.data?.map((e) => (
              <tr key={e.id}>
                <Td>{fmtDateTime(e.at)}</Td>
                <Td>{e.device_name}</Td>
                <Td>{e.student_name ?? <span className="font-mono text-xs text-slate-400">{e.card_uid || '—'}</span>}</Td>
                <Td>
                  <Badge tone={e.allowed ? 'good' : 'bad'}>{e.allowed ? 'Ouverte' : 'Refusée'}</Badge> {e.offline && <Badge tone="warn">Hors ligne</Badge>} <span className="text-xs text-slate-500">{e.reason}</span>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? 'Modifier la porte' : 'Nouvelle porte'}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              save.mutate({ d: edit })
            }}
          >
            <Field label="Nom">
              <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
            </Field>
            <Field label="Emplacement">
              <Input value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} />
            </Field>
            <Field label="Durée d'ouverture (secondes)">
              <Input type="number" min={0.5} max={30} step={0.5} value={(edit.open_ms ?? 5000) / 1000} onChange={(e) => setEdit({ ...edit, open_ms: Math.round(Number(e.target.value) * 1000) })} />
            </Field>
            {edit.id && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Porte active
              </label>
            )}
            <Button type="submit" loading={save.isPending} className="w-full">
              Enregistrer
            </Button>
          </form>
        </Modal>
      )}
      <Modal open={!!secret} onClose={() => setSecret(undefined)} title="Configuration de l'ESP32">
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">
            Au premier démarrage, l'ESP32 ouvre le réseau Wi-Fi « EduPilote-Porte ». Connectez-vous-y et saisissez ces valeurs. <strong>Le secret ne sera plus affiché.</strong>
          </p>
          {[
            ['URL du serveur', location.origin],
            ['Identifiant de la porte', secret?.id ?? ''],
            ['Secret', secret?.secret ?? ''],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
              <div className="w-40 shrink-0 text-xs font-semibold text-slate-500">{k}</div>
              <div className="min-w-0 flex-1 break-all font-mono text-xs">{v}</div>
              <CopyButton text={v!} label="Copier" />
            </div>
          ))}
        </div>
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------- journal

const auditLabels: Record<string, string> = {
  'user.login': 'Connexion',
  'user.login_failed': 'Échec de connexion',
  'user.created': 'Compte créé',
  'user.updated': 'Compte modifié',
  'user.password_reset': 'Mot de passe réinitialisé',
  'user.password_changed': 'Mot de passe changé',
  'student.enrolled': 'Étudiant inscrit',
  'student.registered': 'Auto-inscription',
  'student.updated': 'Fiche étudiant modifiée',
  'student.profile_updated': 'Profil pro modifié',
  'card.issued': 'Carte émise',
  'card.revoked': 'Carte désactivée',
  'card.verified': 'Identité vérifiée',
  'card.replay_detected': 'Tentative de rejeu de carte',
  'card.blocked_presented': 'Carte bloquée présentée',
  'card.rejected_scan': 'Carte refusée au pointage',
  'photo.requested': 'Photo proposée',
  'photo.approved': 'Photo validée',
  'photo.rejected': 'Photo refusée',
  'photo.set': 'Photo officielle posée',
  'scan.received': 'Pointage reçu',
  'attendance.recorded': 'Présence enregistrée',
  'attendance.departed': 'Départ enregistré',
  'attendance.updated': 'Présence modifiée',
  'absence.threshold_reached': "Alerte d'absences",
  'session.saved': 'Cours enregistré',
  'session.deleted': 'Cours supprimé',
  'module.saved': 'Module enregistré',
  'module.deleted': 'Module supprimé',
  'class.saved': 'Classe enregistrée',
  'class.deleted': 'Classe supprimée',
  'class.managers_set': 'Responsables affectés',
  'class.invite_regenerated': "Lien d'inscription renouvelé",
  'filiere.saved': 'Filière enregistrée',
  'filiere.deleted': 'Filière supprimée',
  'year.saved': 'Année enregistrée',
  'door.opened': 'Porte ouverte',
  'door.denied': 'Porte refusée',
  'device.saved': 'Porte configurée',
  'device.deleted': 'Porte supprimée',
  'announcement.published': 'Annonce publiée',
  'announcement.deleted': 'Annonce supprimée',
  'feedback.submitted': 'Avis envoyé',
  'settings.updated': 'Paramètres modifiés',
}

const alertTypes = new Set(['card.replay_detected', 'card.blocked_presented', 'card.rejected_scan', 'user.login_failed', 'absence.threshold_reached', 'door.denied'])

export function JournalPage() {
  const [type, setType] = useState('')
  const list = useInfiniteQuery({
    queryKey: ['audit', type],
    initialPageParam: '',
    queryFn: ({ pageParam }) => api.get<AuditEntry[]>('/audit' + qs({ type, before: pageParam, limit: 100 })),
    getNextPageParam: (last) => (last.length === 100 ? last[last.length - 1]!.occurred_at : undefined),
    refetchInterval: 20_000,
  })
  const rows = list.data?.pages.flat() ?? []
  return (
    <>
      <PageHeader title="Journal" subtitle="Toutes les actions et tous les événements du système, alimentés par Kafka. Rien n'est modifiable." />
      <Card
        padded={false}
        actions={
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-56">
            <option value="">Tous les événements</option>
            <option value="attendance.">Présences</option>
            <option value="card.">Cartes</option>
            <option value="door.">Portes</option>
            <option value="user.">Comptes et connexions</option>
            <option value="student.">Étudiants</option>
            <option value="session.">Planning</option>
            <option value="absence.">Alertes d'absence</option>
          </Select>
        }
        title="Événements"
      >
        {list.isLoading ? (
          <Spinner />
        ) : (
          <>
            <Table head={['Date', 'Événement', 'Par', 'Détails']} empty={!rows.length && <Empty title="Aucun événement" />}>
              {rows.map((e) => (
                <tr key={e.event_id} className={cx(alertTypes.has(e.type) && 'bg-red-50/50')}>
                  <Td>{fmtDateTime(e.occurred_at)}</Td>
                  <Td>
                    <span className={cx('font-semibold', alertTypes.has(e.type) ? 'text-red-700' : 'text-slate-800')}>{auditLabels[e.type] ?? e.type}</span>
                    <div className="font-mono text-[11px] text-slate-400">{e.type}</div>
                  </Td>
                  <Td>{e.actor_name ?? <span className="text-slate-400">système</span>}</Td>
                  <Td className="max-w-md truncate font-mono text-xs text-slate-500">{e.data ? JSON.stringify(e.data) : ''}</Td>
                </tr>
              ))}
            </Table>
            {list.hasNextPage && (
              <div className="p-4 text-center">
                <Button variant="secondary" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
                  Charger plus
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  )
}

// ---------------------------------------------------------------- avis et paramètres

export function FeedbackPage() {
  const list = useQuery({ queryKey: ['feedback'], queryFn: () => api.get<Feedback[]>('/feedback') })
  const avg = list.data?.length ? list.data.reduce((s, f) => s + f.rating, 0) / list.data.length : null
  return (
    <>
      <PageHeader title="Avis des utilisateurs" subtitle={avg !== null ? `Note moyenne ${avg.toFixed(1)} / 5 sur ${list.data!.length} avis` : undefined} />
      <Card padded={false}>
        {list.isLoading ? (
          <Spinner />
        ) : (
          <Table head={['Date', 'Auteur', 'Note', 'Commentaire']} empty={!list.data?.length && <Empty icon={<Star className="h-10 w-10" />} title="Aucun avis pour le moment" />}>
            {list.data?.map((f) => (
              <tr key={f.id}>
                <Td>{fmtDateTime(f.created_at)}</Td>
                <Td>
                  {f.user_name ?? 'Compte supprimé'} <span className="text-xs text-slate-400">{f.role}</span>
                </Td>
                <Td>
                  <span className="text-gold">{'★'.repeat(f.rating)}</span>
                  <span className="text-slate-300">{'★'.repeat(5 - f.rating)}</span>
                </Td>
                <Td className="whitespace-normal">{f.comment || '—'}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  )
}

export function SettingsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const cur = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/settings') })
  const [s, setS] = useState<Settings | null>(null)
  useEffect(() => {
    if (cur.data && !s) setS(cur.data)
  }, [cur.data, s])
  const save = useMutation({
    mutationFn: () => api.put<Settings>('/settings', s),
    onSuccess: (r) => {
      qc.setQueryData(['settings'], r)
      toast('Paramètres enregistrés')
    },
  })
  if (!s) return <Spinner />
  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) })
  return (
    <>
      <PageHeader title="Paramètres" />
      <Card>
        <form
          className="grid max-w-2xl gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <div className="sm:col-span-2">
            <Field label="Nom de l'établissement" hint="Affiché sur les cartes, les pages d'identité et les profils.">
              <Input value={s.school_name} onChange={(e) => setS({ ...s, school_name: e.target.value })} required />
            </Field>
          </div>
          <Field label="Retard au-delà de (minutes)" hint="Après le début du cours">
            <Input type="number" min={0} max={120} value={s.late_minutes} onChange={num('late_minutes')} />
          </Field>
          <Field label="Alerte après (absences d'affilée)">
            <Input type="number" min={1} max={20} value={s.alert_threshold} onChange={num('alert_threshold')} />
          </Field>
          <Field label="Pointage ouvert avant le cours (min)">
            <Input type="number" min={0} max={180} value={s.window_before_minutes} onChange={num('window_before_minutes')} />
          </Field>
          <Field label="Pointage ouvert après la fin (min)">
            <Input type="number" min={0} max={180} value={s.window_after_minutes} onChange={num('window_after_minutes')} />
          </Field>
          <Field label="Délai minimal avant un départ (min)" hint="Un second passage plus tôt est ignoré">
            <Input type="number" min={1} max={240} value={s.departure_min_minutes} onChange={num('departure_min_minutes')} />
          </Field>
          <div className="sm:col-span-2">
            <ErrorBox error={save.error && errorMessage(save.error)} />
            <Button type="submit" loading={save.isPending} className="mt-2">
              Enregistrer
            </Button>
          </div>
        </form>
      </Card>
    </>
  )
}
