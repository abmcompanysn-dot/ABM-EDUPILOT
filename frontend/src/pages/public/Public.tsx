import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  BadgeCheck,
  BellRing,
  Building2,
  CalendarDays,
  CheckCircle2,
  Contact,
  ExternalLink,
  GraduationCap,
  IdCard,
  Nfc,
  QrCode,
  Radio,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Users,
  WifiOff,
} from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import { homeFor, useAuth } from '../../lib/auth'
import { fmtDate, fmtRate, fmtTime } from '../../lib/format'
import type { IDResult, Principal, ProProfile, ScanResult } from '../../lib/types'
import { Avatar, Badge, Button, ErrorBox, Field, Input, Spinner, cx, useToast } from '../../components/ui'
import { QR } from '../../components/QR'

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-navy-900 via-navy to-navy-700">
      <header className="mx-auto flex w-full max-w-5xl items-center gap-3 px-5 py-5 text-white">
        <img src="/logo.svg" alt="" className="h-9 w-9" />
        <span className="font-display text-lg font-bold">ABM EduPilote</span>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-10">{children}</main>
      <footer className="py-5 text-center text-xs text-navy-100/60">
        <Link to="/mentions-legales" className="hover:text-white">
          Mentions légales et données personnelles
        </Link>
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------- connexion

export function LoginPage() {
  const { me, loading } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string>()
  const [busy, setBusy] = useState(false)
  if (loading) return <Spinner />
  if (me) return <Navigate to={params.get('next') || homeFor(me.role)} replace />
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(undefined)
    try {
      const p = await api.post<Principal>('/auth/login', { email, password })
      qc.setQueryData(['me'], p)
      navigate(params.get('next') || homeFor(p.role), { replace: true })
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const loginForm = (
    <form id="connexion" onSubmit={submit} className="scroll-mt-24 rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-black/5 sm:p-8">
      <h2 className="font-display text-2xl font-bold text-navy">Connexion</h2>
      <p className="mb-6 mt-1 text-sm text-slate-500">Un seul accès pour l'administration, les responsables et les étudiants.</p>
      <div className="space-y-4">
        <Field label="Adresse email">
          <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="prenom.nom@ecole.sn" />
        </Field>
        <Field label="Mot de passe">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <ErrorBox error={err} />
        <Button type="submit" loading={busy} className="w-full py-3 text-base">
          Se connecter <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-6 space-y-1.5 border-t border-slate-100 pt-4 text-xs text-slate-500">
        <p>Mot de passe oublié ? L'administration vous donne un mot de passe provisoire.</p>
        <p>Étudiant sans compte ? Utilisez le lien d'inscription de votre classe.</p>
      </div>
    </form>
  )

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* ------------------------------------------------ en-tête */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-navy-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3 text-white">
          <img src="/logo.svg" alt="" className="h-9 w-9" />
          <span className="font-display text-lg font-bold">ABM EduPilote</span>
          <nav className="ml-auto hidden items-center gap-6 text-sm text-navy-100 md:flex">
            <a href="#fonctionnement" className="hover:text-white">Comment ça marche</a>
            <a href="#fonctionnalites" className="hover:text-white">Fonctionnalités</a>
            <a href="#espaces" className="hover:text-white">Pour qui</a>
          </nav>
          <a href="#connexion" className="ml-auto rounded-full bg-gold px-4 py-2 text-sm font-bold text-navy-900 hover:brightness-105 md:ml-4">
            Se connecter
          </a>
        </div>
      </header>

      {/* ------------------------------------------------ accroche + connexion */}
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-900 via-navy to-navy-700 text-white">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-gold/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 lg:grid-cols-[1.1fr_1fr] lg:py-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-gold ring-1 ring-white/15">
              <QrCode className="h-3.5 w-3.5" /> Nouveau : pointage par QR code
            </span>
            <h1 className="mt-5 font-display text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
              Chaque présence <span className="text-gold">compte.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-navy-100/85">
              L'appel en classe en quelques secondes&nbsp;: le responsable affiche un QR code, chaque étudiant le scanne avec son téléphone, la feuille de présence se remplit en direct.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#connexion" className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-3 font-bold text-navy-900 shadow-lg shadow-gold/20 hover:brightness-105 lg:hidden">
                Se connecter <ArrowRight className="h-4 w-4" />
              </a>
              <a href="#fonctionnement" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 font-semibold text-white ring-1 ring-white/20 hover:bg-white/15">
                Voir comment ça marche
              </a>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4">
              {[
                ['En direct', 'présences visibles à la seconde'],
                ['10 000', 'pointages simultanés testés'],
                ['0 papier', "plus de feuille d'appel"],
              ].map(([v, l]) => (
                <div key={v} className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                  <dt className="font-display text-lg font-bold text-gold sm:text-xl">{v}</dt>
                  <dd className="mt-0.5 text-xs leading-snug text-navy-100/80">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="lg:pl-6">{loginForm}</div>
        </div>
      </section>

      {/* ------------------------------------------------ comment ça marche */}
      <section id="fonctionnement" className="scroll-mt-16 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-center font-display text-3xl font-bold text-navy sm:text-4xl">L'appel en trois gestes</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">Aucune application à installer : l'appareil photo du téléphone suffit, sur iPhone comme sur Android.</p>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              [QrCode, 'Le responsable affiche le QR', "Depuis la page du cours, un bouton projette un QR code en plein écran. Il change toutes les 15 secondes : une photo envoyée à un absent ne sert à rien."],
              [Smartphone, "L'étudiant le scanne", "Il vise le code avec l'appareil photo de son téléphone. Sa présence est confirmée en une seconde, avec l'heure et, s'il l'autorise, le lieu."],
              [Radio, 'La liste se remplit en direct', 'Le responsable voit les présents arriver un par un, les retards sont repérés automatiquement et les absences signalées après le cours.'],
            ].map(([I, title, text], i) => {
              const Icon = I as typeof QrCode
              return (
                <li key={i} className="relative rounded-3xl bg-slate-50 p-6 ring-1 ring-slate-100">
                  <span className="absolute right-5 top-5 font-display text-4xl font-bold text-slate-200">{i + 1}</span>
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy text-gold">
                    <Icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-5 font-display text-lg font-bold text-navy">{title as string}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{text as string}</p>
                </li>
              )
            })}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------ fonctionnalités */}
      <section id="fonctionnalites" className="scroll-mt-16 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-center font-display text-3xl font-bold text-navy sm:text-4xl">Tout le suivi de l'école, au même endroit</h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              [QrCode, 'QR code anti-fraude', 'Code renouvelé en continu, valable seulement pendant le cours et pour les étudiants de la classe.'],
              [Nfc, 'Cartes NFC', "Le téléphone du responsable lit la carte de l'étudiant. Cartes NTAG 424 DNA impossibles à copier."],
              [BellRing, "Alertes d'absence", "Étudiant et responsable prévenus dès 3 absences d'affilée (seuil réglable)."],
              [CalendarDays, 'Planning des cours', "Emploi du temps par classe, cours confirmés ou annulés, consultable par chaque étudiant."],
              [IdCard, "Carte d'identité numérique", 'Chaque carte ouvre une page signée à usage unique : une capture ou un lien copié est refusé.'],
              [WifiOff, 'Fonctionne hors connexion', 'Sans réseau, les pointages sont gardés sur le téléphone et envoyés dès le retour de la connexion.'],
            ].map(([I, title, text]) => {
              const Icon = I as typeof QrCode
              return (
                <div key={title as string} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-md">
                  <Icon className="h-7 w-7 text-brand" />
                  <h3 className="mt-4 font-display text-base font-bold text-navy">{title as string}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{text as string}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ espaces */}
      <section id="espaces" className="scroll-mt-16 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-center font-display text-3xl font-bold text-navy sm:text-4xl">Un espace pour chacun</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              [Building2, 'Administration', ['Filières, classes et années', 'Comptes du personnel et des étudiants', 'Statistiques et journal complet']],
              [Users, 'Responsables', ['QR de présence et lecture NFC', 'Feuille de présence en direct', 'Annonces à la classe']],
              [GraduationCap, 'Étudiants', ['Pointage en un scan', 'Planning et historique de présence', 'Carte et profil professionnel']],
            ].map(([I, title, items]) => {
              const Icon = I as typeof QrCode
              return (
                <div key={title as string} className="rounded-3xl bg-gradient-to-b from-navy-50 to-white p-6 ring-1 ring-navy-100">
                  <Icon className="h-8 w-8 text-navy" />
                  <h3 className="mt-4 font-display text-xl font-bold text-navy">{title as string}</h3>
                  <ul className="mt-3 space-y-2">
                    {(items as string[]).map((t) => (
                      <li key={t} className="flex items-start gap-2 text-sm text-slate-700">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ appel final + pied */}
      <section className="bg-navy-900 py-14 text-center text-white">
        <div className="mx-auto max-w-2xl px-5">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">Prêt pour le prochain cours ?</h2>
          <p className="mt-2 text-navy-100/80">Connectez-vous avec l'adresse email donnée par votre établissement.</p>
          <a href="#connexion" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gold px-6 py-3 font-bold text-navy-900 hover:brightness-105">
            Se connecter <ArrowRight className="h-4 w-4" />
          </a>
        </div>
        <footer className="mx-auto mt-12 flex max-w-6xl flex-col items-center justify-between gap-3 border-t border-white/10 px-5 pt-6 text-xs text-navy-100/60 sm:flex-row">
          <span>© {new Date().getFullYear()} ABMCY — African Business Manager Company</span>
          <Link to="/mentions-legales" className="hover:text-white">
            Mentions légales et données personnelles
          </Link>
        </footer>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------- inscription

export function RegisterPage() {
  const { code = '' } = useParams()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const invite = useQuery({ queryKey: ['invite', code], queryFn: () => api.get<{ class_name: string; filiere_name: string; school_name: string }>(`/public/invite/${code}`), retry: false })
  const [f, setF] = useState({ full_name: '', matricule: '', email: '', phone: '', birth_date: '', password: '', confirm: '' })
  const [consent, setConsent] = useState(false)
  const [err, setErr] = useState<string>()
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (f.password !== f.confirm) return setErr('Les deux mots de passe sont différents.')
    setBusy(true)
    setErr(undefined)
    try {
      const p = await api.post<Principal>('/auth/register', { invite_code: code, ...f, birth_date: f.birth_date || null })
      qc.setQueryData(['me'], p)
      navigate('/etudiant', { replace: true })
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <PublicShell>
      <div className="mx-auto max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:p-8">
        {invite.isLoading ? (
          <Spinner />
        ) : invite.error ? (
          <ErrorBox error={invite.error} />
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <h1 className="font-display text-xl font-bold text-navy">Inscription</h1>
              <p className="text-sm text-slate-600">
                {invite.data!.school_name} · {invite.data!.filiere_name} — {invite.data!.class_name}
              </p>
            </div>
            <Field label="Nom complet">
              <Input value={f.full_name} onChange={set('full_name')} required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
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
            <Field label="Téléphone (facultatif)">
              <Input type="tel" value={f.phone} onChange={set('phone')} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Mot de passe" hint="8 caractères minimum">
                <Input type="password" autoComplete="new-password" minLength={8} value={f.password} onChange={set('password')} required />
              </Field>
              <Field label="Confirmation">
                <Input type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} required />
              </Field>
            </div>
            <label className="flex items-start gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" required />
              <span>
                J'accepte que mes données servent au suivi de ma scolarité, selon les{' '}
                <Link to="/mentions-legales" className="text-brand underline">
                  mentions légales
                </Link>
                .
              </span>
            </label>
            <ErrorBox error={err} />
            <Button type="submit" loading={busy} disabled={!consent} className="w-full py-2.5">
              Créer mon compte
            </Button>
          </form>
        )}
      </div>
    </PublicShell>
  )
}

// ---------------------------------------------------------------- page d'identité (carte touchée)

const statusText: Record<IDResult['status'], { title: string; tone: 'good' | 'bad' | 'warn' }> = {
  valide: { title: 'Carte valide', tone: 'good' },
  expiree: { title: 'Carte expirée', tone: 'bad' },
  perdue: { title: 'Carte déclarée perdue', tone: 'bad' },
  revoquee: { title: 'Carte révoquée', tone: 'bad' },
  remplacee: { title: 'Carte remplacée', tone: 'bad' },
  rejeu: { title: 'Lien déjà utilisé', tone: 'warn' },
  inconnue: { title: 'Carte inconnue', tone: 'bad' },
  invalide: { title: 'Carte non authentique', tone: 'bad' },
}

export function IdPage() {
  const loc = useLocation()
  const toast = useToast()
  const q = new URLSearchParams(loc.search)
  const e = q.get('e') ?? ''
  const c = q.get('c') ?? ''
  const [now, setNow] = useState(new Date())
  const [scan, setScan] = useState<ScanResult>()
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const res = useQuery({ queryKey: ['id', e, c], queryFn: () => api.get<IDResult>(`/id/verify?e=${encodeURIComponent(e)}&c=${encodeURIComponent(c)}`), staleTime: Infinity, retry: false, enabled: !!e })
  if (!e) return <Navigate to="/" replace />
  const r = res.data
  const st = r ? statusText[r.status] : null
  const markPresent = async () => {
    if (!r?.proof || !r.staff?.current_session) return
    setBusy(true)
    try {
      const out = await api.post<ScanResult>('/scans', { session_id: r.staff.current_session.id, proof: r.proof })
      setScan(out)
    } catch (err) {
      toast(errorMessage(err), 'bad')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6">
      <div className="mx-auto max-w-md">
        {res.isLoading ? (
          <Spinner label="Vérification de la carte…" />
        ) : res.error ? (
          <ErrorBox error={res.error} />
        ) : r && st ? (
          <>
            <div className={cx('mb-4 flex items-center gap-3 rounded-2xl px-5 py-4 text-white shadow', st.tone === 'good' ? 'bg-emerald-600' : st.tone === 'warn' ? 'bg-amber-500' : 'bg-red-600')}>
              {st.tone === 'good' ? <ShieldCheck className="h-8 w-8" /> : <ShieldAlert className="h-8 w-8" />}
              <div>
                <div className="font-display text-lg font-bold">{st.title}</div>
                <div className="text-sm opacity-90">{r.status === 'rejeu' ? 'Pour vérifier, touchez de nouveau la carte physique avec le téléphone.' : r.message}</div>
              </div>
            </div>
            {r.student && (
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-900 via-navy to-brand p-6 text-white shadow-xl">
                <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 animate-spin rounded-full border-[18px] border-dashed border-white/10 [animation-duration:18s]" />
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-widest text-gold">Carte d'étudiant</div>
                  <div className="flex items-center gap-1 rounded-full bg-emerald-400/20 px-2.5 py-1 text-xs font-bold text-emerald-200">
                    <BadgeCheck className="h-4 w-4" /> Vérifiée {fmtTime(now)}:{String(now.getSeconds()).padStart(2, '0')}
                  </div>
                </div>
                <div className="mt-5 flex gap-5">
                  <div className="h-36 w-28 shrink-0 overflow-hidden rounded-2xl bg-white/10 ring-2 ring-white/30">
                    {r.student.has_photo ? (
                      <img src={`/api/v1/id/photo/${r.student.id}?proof=${encodeURIComponent(r.proof ?? '')}`} alt="Photo officielle" className="h-full w-full object-cover" />
                    ) : (
                      <Avatar name={r.student.full_name} size={112} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-display text-2xl font-bold leading-tight">{r.student.full_name}</div>
                    <div className="mt-3 text-xs text-navy-100/70">Filière · classe</div>
                    <div className="font-semibold">
                      {r.student.filiere_name} · {r.student.class_name}
                    </div>
                    <div className="mt-2 text-xs text-navy-100/70">Année académique</div>
                    <div className="font-semibold">{r.student.year_label || '—'}</div>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-white/15 pt-3 text-xs text-navy-100/80">
                  <span>{r.student.school_name}</span>
                  <span className="flex items-center gap-1">
                    <Nfc className="h-4 w-4 text-gold" /> NTAG 424 DNA
                  </span>
                </div>
              </div>
            )}
            {r.staff && (
              <div className="mt-4 rounded-2xl bg-white p-5 shadow">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Réservé au personnel</div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-slate-500">Matricule</dt>
                    <dd className="font-semibold">{r.staff.matricule}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Naissance</dt>
                    <dd className="font-semibold">{r.staff.birth_date ? fmtDate(r.staff.birth_date) : '—'}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-500">Contact</dt>
                    <dd className="font-semibold">
                      {r.staff.email} {r.staff.phone && `· ${r.staff.phone}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Présence (année)</dt>
                    <dd className="font-semibold">{fmtRate(r.staff.attendance_rate)}</dd>
                  </div>
                </dl>
                {r.staff.current_session ? (
                  scan ? (
                    <div className={cx('mt-4 rounded-xl p-4 text-center font-semibold', scan.outcome === 'refuse' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>{scan.message}</div>
                  ) : (
                    <Button onClick={markPresent} loading={busy} className="mt-4 w-full py-3">
                      Pointer présent · {r.staff.current_session.module_name}
                    </Button>
                  )
                ) : (
                  <p className="mt-4 text-sm text-slate-500">Aucun cours ouvert au pointage pour cette classe en ce moment.</p>
                )}
              </div>
            )}
            {r.student?.profile_slug && (
              <Link to={`/p/${r.student.profile_slug}`} className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-white p-4 text-sm font-semibold text-navy shadow">
                <Contact className="h-5 w-5" /> Voir le profil professionnel
              </Link>
            )}
          </>
        ) : null}
        <p className="mt-6 text-center text-xs text-slate-500">
          <IdCard className="mr-1 inline h-4 w-4" />
          Vérification officielle ABM EduPilote. Une capture d'écran de cette page n'a aucune valeur : l'heure de vérification défile en direct.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- profil pro public

export function ProfilePage() {
  const { slug = '' } = useParams()
  const toast = useToast()
  const p = useQuery({ queryKey: ['profile', slug], queryFn: () => api.get<ProProfile>(`/public/profiles/${slug}`), retry: false })
  const url = `${location.origin}/p/${slug}`
  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title: p.data?.full_name, url }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(url)
      toast('Lien copié')
    }
  }
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-lg">
        {p.isLoading ? (
          <Spinner />
        ) : p.error ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow">
            <div className="font-display text-lg font-bold text-navy">Profil indisponible</div>
            <p className="mt-2 text-sm text-slate-600">Ce profil n'existe pas ou n'est pas public.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="h-28 bg-gradient-to-r from-navy-900 via-navy to-brand" />
            <div className="-mt-16 flex flex-col items-center px-6 pb-6 text-center">
              <div className="rounded-full ring-4 ring-white">
                <Avatar name={p.data!.full_name} src={p.data!.has_photo ? `/api/v1/public/profiles/${slug}/photo` : null} size={120} />
              </div>
              <h1 className="mt-3 font-display text-2xl font-bold text-navy">{p.data!.full_name}</h1>
              {p.data!.headline && <p className="mt-1 font-medium text-slate-700">{p.data!.headline}</p>}
              <p className="mt-1 text-sm text-slate-500">
                {p.data!.filiere_name} · {p.data!.class_name} · {p.data!.school_name}
              </p>
              {p.data!.bio && <p className="mt-4 whitespace-pre-line text-left text-sm text-slate-700">{p.data!.bio}</p>}
              {p.data!.skills.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {p.data!.skills.map((s) => (
                    <Badge key={s} tone="info">
                      {s}
                    </Badge>
                  ))}
                </div>
              )}
              {p.data!.links.length > 0 && (
                <div className="mt-5 w-full space-y-2">
                  {p.data!.links.map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-navy hover:bg-slate-50">
                      {l.label || new URL(l.url).hostname}
                      <ExternalLink className="h-4 w-4 text-slate-400" />
                    </a>
                  ))}
                </div>
              )}
              <div className="mt-6 grid w-full grid-cols-2 gap-2">
                <a href={`/api/v1/public/profiles/${slug}/vcard`} className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2.5 text-sm font-semibold text-white">
                  <Smartphone className="h-4 w-4" /> Enregistrer
                </a>
                <Button variant="secondary" onClick={share}>
                  <Share2 className="h-4 w-4" /> Partager
                </Button>
              </div>
              <div className="mt-6">
                <QR value={url} size={140} />
              </div>
            </div>
          </div>
        )}
        <p className="mt-6 text-center text-xs text-slate-500">Profil professionnel publié par l'étudiant sur ABM EduPilote.</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- mentions légales

export function LegalPage() {
  return (
    <PublicShell>
      <article className="prose-sm mx-auto max-w-3xl rounded-2xl bg-white p-6 text-slate-700 shadow-xl sm:p-10">
        <h1 className="font-display text-2xl font-bold text-navy">Mentions légales et données personnelles</h1>
        <h2 className="mt-6 font-display text-lg font-semibold text-navy">Éditeur</h2>
        <p className="mt-2 text-sm">ABM EduPilote est édité par ABM — Africa Business Manager, pour le compte de l'établissement qui l'utilise.</p>
        <h2 className="mt-6 font-display text-lg font-semibold text-navy">Données traitées</h2>
        <p className="mt-2 text-sm">
          Identité (nom, matricule, date de naissance, photo), coordonnées, classe, présences (heure d'arrivée, de départ, lieu du pointage), utilisation de la carte d'identité NFC et journal des actions. Ces données servent
          uniquement au suivi de la scolarité et à la sécurité des accès.
        </p>
        <h2 className="mt-6 font-display text-lg font-semibold text-navy">Base légale et conservation</h2>
        <p className="mt-2 text-sm">
          Traitement déclaré auprès de la Commission de protection des données personnelles (loi n° 2008-12). Les journaux de porte et de pointage sont conservés 12 mois ; les comptes sont supprimés un an après le départ de
          l'établissement.
        </p>
        <h2 className="mt-6 font-display text-lg font-semibold text-navy">Ce qui est public</h2>
        <p className="mt-2 text-sm">
          La page d'identité affiche seulement le nom, la photo, la classe et l'année. Le matricule, la date de naissance et les coordonnées sont réservés au personnel de la classe. Le profil professionnel n'est visible que si
          l'étudiant le rend public.
        </p>
        <h2 className="mt-6 font-display text-lg font-semibold text-navy">Vos droits</h2>
        <p className="mt-2 text-sm">Accès, rectification et suppression : adressez votre demande à l'administration de l'établissement.</p>
      </article>
    </PublicShell>
  )
}

export function NotFound() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
        <div className="font-display text-xl font-bold text-navy">Page introuvable</div>
        <Link to="/" className="mt-4 inline-block text-sm font-semibold text-brand">
          Retour à l'accueil
        </Link>
      </div>
    </PublicShell>
  )
}
