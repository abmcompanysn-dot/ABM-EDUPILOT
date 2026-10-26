import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Camera, ChevronLeft, ChevronRight, Eye, Megaphone, Nfc, Plus, Share2, Trash2 } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { addDays, fmtDate, fmtRate, fmtShortDate, fmtTime, isoDay, rateTone, startOfWeek, statusLabel } from '../../lib/format'
import { resizePhoto } from '../../lib/image'
import type { Link as ProLink, ProProfile, Session, Student as StudentT, StudentAttendance } from '../../lib/types'
import { Avatar, Badge, Button, Card, CopyButton, Empty, ErrorBox, Field, Input, PageHeader, Spinner, Stat, Textarea, attendanceTone, useToast } from '../../components/ui'
import { QR } from '../../components/QR'
import { AttendanceView } from '../StudentDetail'

const useMe = () => useQuery({ queryKey: ['meStudent'], queryFn: () => api.get<StudentT>('/me/student') })

export function StudentHome() {
  const { me, settings } = useAuth()
  const st = useMe()
  const att = useQuery({ queryKey: ['myAttendance'], queryFn: () => api.get<StudentAttendance>('/me/attendance') })
  const today = new Date()
  const sched = useQuery({ queryKey: ['mySchedule', isoDay(today)], queryFn: () => api.get<Session[]>(`/me/schedule?from=${isoDay(today)}&to=${isoDay(addDays(today, 7))}`) })
  const unread = useQuery({ queryKey: ['unread'], queryFn: () => api.get<{ notifications: number; announcements: number }>('/me/unread') })
  const next = sched.data?.filter((s) => s.status !== 'annule' && new Date(s.ends_at) > today).slice(0, 4) ?? []
  return (
    <>
      <PageHeader title={`Bonjour ${me?.full_name.split(' ')[0] ?? ''}`} subtitle={st.data ? `${st.data.filiere_name} · ${st.data.class_name} · ${settings?.school_name ?? ''}` : undefined} />
      {att.data && att.data.streak >= 3 && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          Vous avez manqué {att.data.streak} cours d'affilée. Rapprochez-vous de votre responsable de classe.
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Ma présence" value={fmtRate(att.data?.rate)} tone={rateTone(att.data?.rate) === 'none' ? undefined : rateTone(att.data?.rate)} />
        <Stat label="Cours cette semaine" value={sched.data?.filter((s) => s.status !== 'annule').length ?? '—'} />
        <Stat label="Carte" value={st.data?.card_status ? 'Active' : 'Aucune'} tone={st.data?.card_status ? 'good' : 'warn'} />
        <Link to="/annonces">
          <Stat label="Annonces non lues" value={unread.data?.announcements ?? 0} tone={unread.data?.announcements ? 'warn' : undefined} />
        </Link>
      </div>
      <Card title="Prochains cours" className="mt-5" actions={<Link to="/etudiant/planning" className="text-sm font-semibold text-brand">Emploi du temps</Link>}>
        {sched.isLoading ? (
          <Spinner />
        ) : next.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun cours dans les 7 prochains jours.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {next.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <div className="font-semibold text-slate-800">{s.module_name}</div>
                  <div className="text-slate-500">
                    {fmtShortDate(s.starts_at)} · {fmtTime(s.starts_at)}–{fmtTime(s.ends_at)} {s.room && `· ${s.room}`}
                  </div>
                </div>
                {s.my_status ? <Badge tone={attendanceTone(s.my_status)}>{statusLabel[s.my_status]}</Badge> : <Badge tone={s.status === 'confirme' ? 'good' : 'neutral'}>{statusLabel[s.status]}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

export function StudentSchedule() {
  const [week, setWeek] = useState(startOfWeek(new Date()))
  const list = useQuery({ queryKey: ['mySchedule', isoDay(week), 'w'], queryFn: () => api.get<Session[]>(`/me/schedule?from=${isoDay(week)}&to=${isoDay(addDays(week, 7))}`) })
  return (
    <>
      <PageHeader
        title="Emploi du temps"
        subtitle={`Semaine du ${fmtDate(week)}`}
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
          </>
        }
      />
      {list.isLoading ? (
        <Spinner />
      ) : !list.data?.length ? (
        <Card>
          <Empty title="Aucun cours cette semaine" />
        </Card>
      ) : (
        <div className="space-y-4">
          {Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((d) => {
            const items = list.data!.filter((s) => isoDay(new Date(s.starts_at)) === isoDay(d))
            if (!items.length) return null
            return (
              <Card key={isoDay(d)} title={fmtShortDate(d)}>
                <ul className="space-y-2">
                  {items.map((s) => (
                    <li key={s.id} className="flex items-center gap-3">
                      <div className="w-24 font-semibold text-navy">
                        {fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}
                      </div>
                      <div className="flex-1">
                        <div className={s.status === 'annule' ? 'font-semibold text-slate-400 line-through' : 'font-semibold text-slate-800'}>{s.module_name}</div>
                        <div className="text-xs text-slate-500">
                          {s.teacher} {s.room && `· ${s.room}`} · {statusLabel[s.mode]}
                        </div>
                      </div>
                      {s.status === 'annule' ? <Badge tone="bad">Annulé</Badge> : s.my_status ? <Badge tone={attendanceTone(s.my_status)}>{statusLabel[s.my_status]}</Badge> : null}
                    </li>
                  ))}
                </ul>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

export function StudentAttendancePage() {
  const att = useQuery({ queryKey: ['myAttendance'], queryFn: () => api.get<StudentAttendance>('/me/attendance') })
  return (
    <>
      <PageHeader title="Mes présences" subtitle="Calculé sur les cours tenus depuis le début de l'année. Une absence excusée ne compte pas." />
      {att.isLoading ? <Spinner /> : att.error ? <ErrorBox error={att.error} /> : <AttendanceView data={att.data!} />}
    </>
  )
}

export function StudentCardPage() {
  const { settings } = useAuth()
  const st = useMe()
  const toast = useToast()
  const [photoV, setPhotoV] = useState(0)
  const req = useMutation({
    mutationFn: async (f: File) => api.upload('POST', '/me/photo', await resizePhoto(f)),
    onSuccess: () => toast("Photo envoyée : elle sera visible après validation par l'administration"),
    onError: (e) => toast(errorMessage(e), 'bad'),
  })
  if (st.isLoading) return <Spinner />
  if (st.error) return <ErrorBox error={st.error} />
  const s = st.data!
  return (
    <>
      <PageHeader title="Ma carte d'étudiant" subtitle="Votre identité officielle. Elle ne peut être modifiée que par l'administration." />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-900 via-navy to-brand p-6 text-white shadow-xl">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-widest text-gold">Carte d'étudiant</div>
            <Badge tone={s.card_status ? 'good' : 'warn'}>{s.card_status ? 'Carte active' : 'Carte non émise'}</Badge>
          </div>
          <div className="mt-5 flex gap-5">
            <div className="h-36 w-28 shrink-0 overflow-hidden rounded-2xl bg-white/10 ring-2 ring-white/30">
              {s.has_photo ? <img key={photoV} src={`/api/v1/me/photo?v=${photoV}`} alt="Photo officielle" className="h-full w-full object-cover" /> : <Avatar name={s.full_name} size={112} />}
            </div>
            <div>
              <div className="font-display text-2xl font-bold leading-tight">{s.full_name}</div>
              <div className="mt-3 text-xs text-navy-100/70">Filière · classe</div>
              <div className="font-semibold">
                {s.filiere_name} · {s.class_name}
              </div>
              <div className="mt-2 text-xs text-navy-100/70">Matricule</div>
              <div className="font-semibold">{s.matricule}</div>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-white/15 pt-3 text-xs text-navy-100/80">
            <span>{settings?.school_name}</span>
            <Nfc className="h-5 w-5 text-gold" />
          </div>
        </div>
        <Card title="Ma photo officielle">
          <p className="text-sm text-slate-600">Photo de face, nette et récente, sans lunettes de soleil ni couvre-chef (sauf motif religieux). Elle remplace l'ancienne après validation.</p>
          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white">
            <Camera className="h-4 w-4" /> {req.isPending ? 'Envoi…' : 'Proposer une nouvelle photo'}
            <input
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) req.mutate(f, { onSuccess: () => setPhotoV((v) => v + 1) })
              }}
            />
          </label>
          <div className="mt-6 space-y-2 text-sm text-slate-600">
            <div className="font-semibold text-slate-800">Comment utiliser ma carte</div>
            <p>• En classe : posez-la au dos du téléphone du responsable. Votre photo s'affiche pour vérification.</p>
            <p>• À l'entrée : approchez-la du lecteur de la porte pendant vos heures de cours.</p>
            <p>• Contrôle d'identité : n'importe quel téléphone qui la touche ouvre votre carte officielle.</p>
            <p className="font-semibold text-red-700">Carte perdue ? Prévenez immédiatement l'administration : elle sera désactivée partout.</p>
          </div>
        </Card>
      </div>
    </>
  )
}

export function ProProfileEditor() {
  const qc = useQueryClient()
  const toast = useToast()
  const prof = useQuery({ queryKey: ['myProfile'], queryFn: () => api.get<ProProfile>('/me/profile') })
  const [draft, setDraft] = useState<{ headline: string; bio: string; skills: string; links: ProLink[]; public: boolean; phone: string } | null>(null)
  const p = prof.data
  const d = draft ?? (p ? { headline: p.headline, bio: p.bio, skills: p.skills.join(', '), links: p.links, public: p.public, phone: p.phone ?? '' } : null)
  const save = useMutation({
    mutationFn: () =>
      api.put<ProProfile>('/me/profile', {
        headline: d!.headline,
        bio: d!.bio,
        skills: d!.skills.split(',').map((s) => s.trim()).filter(Boolean),
        links: d!.links.filter((l) => l.url.trim()),
        public: d!.public,
        phone: d!.phone,
      }),
    onSuccess: (r) => {
      qc.setQueryData(['myProfile'], r)
      setDraft(null)
      toast('Profil enregistré')
    },
  })
  if (prof.isLoading || !d || !p) return <Spinner />
  const url = `${location.origin}/p/${p.slug}`
  const up = (patch: Partial<typeof d>) => setDraft({ ...d, ...patch })
  return (
    <>
      <PageHeader title="Mon profil professionnel" subtitle="Une vitrine à partager avec les recruteurs et les entreprises. Distinct de votre carte d'identité officielle." />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card title="Contenu">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              save.mutate()
            }}
          >
            <Field label="Titre" hint="Ex. : Étudiante en mécatronique, passionnée de robotique">
              <Input value={d.headline} onChange={(e) => up({ headline: e.target.value })} maxLength={120} />
            </Field>
            <Field label="Présentation">
              <Textarea value={d.bio} onChange={(e) => up({ bio: e.target.value })} maxLength={1200} rows={5} />
            </Field>
            <Field label="Compétences" hint="Séparées par des virgules (15 au maximum)">
              <Input value={d.skills} onChange={(e) => up({ skills: e.target.value })} />
            </Field>
            <Field label="Téléphone (visible seulement par votre école)">
              <Input value={d.phone} onChange={(e) => up({ phone: e.target.value })} />
            </Field>
            <div>
              <div className="mb-1 text-sm font-medium text-slate-700">Liens (LinkedIn, GitHub, portfolio…)</div>
              <div className="space-y-2">
                {d.links.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <Input placeholder="Libellé" value={l.label} onChange={(e) => up({ links: d.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className="w-36" />
                    <Input placeholder="https://…" value={l.url} onChange={(e) => up({ links: d.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                    <Button type="button" variant="ghost" onClick={() => up({ links: d.links.filter((_, j) => j !== i) })} aria-label="Retirer">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {d.links.length < 8 && (
                  <Button type="button" variant="secondary" onClick={() => up({ links: [...d.links, { label: '', url: '' }] })}>
                    <Plus className="h-4 w-4" /> Ajouter un lien
                  </Button>
                )}
              </div>
            </div>
            <label className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm">
              <input type="checkbox" checked={d.public} onChange={(e) => up({ public: e.target.checked })} />
              <span>
                <span className="font-semibold">Rendre mon profil public</span> — visible par toute personne qui a le lien. Votre email, téléphone, matricule et date de naissance ne sont jamais affichés.
              </span>
            </label>
            <ErrorBox error={save.error && errorMessage(save.error)} />
            <Button type="submit" loading={save.isPending} disabled={!draft}>
              Enregistrer
            </Button>
          </form>
        </Card>
        <Card title="Partager">
          {p.public ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <QR value={url} size={180} />
              <div className="break-all text-xs text-slate-500">{url}</div>
              <div className="flex flex-wrap justify-center gap-2">
                <CopyButton text={url} label="Copier le lien" />
                {'share' in navigator && (
                  <Button variant="secondary" onClick={() => navigator.share({ title: p.full_name, url }).catch(() => {})}>
                    <Share2 className="h-4 w-4" /> Partager
                  </Button>
                )}
                <a href={url} target="_blank" rel="noreferrer">
                  <Button variant="ghost">
                    <Eye className="h-4 w-4" /> Voir
                  </Button>
                </a>
              </div>
            </div>
          ) : (
            <Empty icon={<Megaphone className="h-10 w-10" />} title="Profil privé">
              Cochez « Rendre mon profil public » puis enregistrez pour obtenir votre lien et votre QR code.
            </Empty>
          )}
        </Card>
      </div>
    </>
  )
}
