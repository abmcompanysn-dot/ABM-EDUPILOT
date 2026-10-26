import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, BookOpen, CalendarDays, CreditCard, DoorOpen, GraduationCap, History, IdCard, KeyRound, LayoutDashboard, LogOut, Megaphone, MessageSquareHeart, School, Settings, Star, UserCircle, Users } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'
import type { Class } from '../lib/types'
import { cx } from './ui'
import { ChangePasswordModal } from './ChangePassword'
import { FeedbackModal } from './Feedback'

type NavItem = { to: string; label: string; icon: ReactNode; end?: boolean }

const icon = (C: typeof Bell) => <C className="h-5 w-5" />

const navs: Record<string, NavItem[]> = {
  admin: [
    { to: '/admin', label: 'Tableau de bord', icon: icon(LayoutDashboard), end: true },
    { to: '/admin/structure', label: 'Structure', icon: icon(School) },
    { to: '/admin/etudiants', label: 'Étudiants', icon: icon(GraduationCap) },
    { to: '/admin/personnel', label: 'Personnel', icon: icon(Users) },
    { to: '/admin/cartes', label: 'Cartes', icon: icon(CreditCard) },
    { to: '/admin/portes', label: 'Portes', icon: icon(DoorOpen) },
    { to: '/admin/journal', label: 'Journal', icon: icon(History) },
    { to: '/annonces', label: 'Annonces', icon: icon(Megaphone) },
    { to: '/admin/avis', label: 'Avis', icon: icon(Star) },
    { to: '/admin/parametres', label: 'Paramètres', icon: icon(Settings) },
  ],
  responsable: [
    { to: '/responsable', label: "Aujourd'hui", icon: icon(LayoutDashboard), end: true },
    { to: '/annonces', label: 'Annonces', icon: icon(Megaphone) },
  ],
  etudiant: [
    { to: '/etudiant', label: 'Accueil', icon: icon(LayoutDashboard), end: true },
    { to: '/etudiant/planning', label: 'Emploi du temps', icon: icon(CalendarDays) },
    { to: '/etudiant/presences', label: 'Mes présences', icon: icon(BookOpen) },
    { to: '/etudiant/carte', label: 'Ma carte', icon: icon(IdCard) },
    { to: '/etudiant/profil', label: 'Profil pro', icon: icon(UserCircle) },
    { to: '/annonces', label: 'Annonces', icon: icon(Megaphone) },
  ],
}

export function Layout() {
  const { me, settings, logout } = useAuth()
  const navigate = useNavigate()
  const [pwOpen, setPwOpen] = useState(false)
  const [fbOpen, setFbOpen] = useState(false)
  const unread = useQuery({ queryKey: ['unread'], queryFn: () => api.get<{ notifications: number; announcements: number }>('/me/unread'), refetchInterval: 60_000, enabled: !!me })
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => api.get<Class[]>('/classes'), enabled: me?.role === 'responsable' })
  if (!me) return null
  const items = [...navs[me.role]!]
  if (me.role === 'responsable') {
    const own = (classes.data ?? []).map<NavItem>((c) => ({ to: `/classes/${c.id}`, label: `${c.filiere_name} ${c.name}`, icon: icon(School) }))
    items.splice(1, 0, ...own)
  }
  const badge = (unread.data?.notifications ?? 0) + (unread.data?.announcements ?? 0)
  return (
    <div className="min-h-screen pb-16 lg:pb-0 lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy text-white lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <img src="/logo.svg" alt="" className="h-9 w-9" />
          <div>
            <div className="font-display text-base font-bold leading-tight">EduPilote</div>
            <div className="max-w-[10rem] truncate text-xs text-navy-100/70">{settings?.school_name}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition', isActive ? 'bg-white/15 text-white' : 'text-navy-100/80 hover:bg-white/10 hover:text-white')}
            >
              {it.icon}
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-0.5 border-t border-white/10 p-3 text-sm">
          <button onClick={() => setFbOpen(true)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-navy-100/80 hover:bg-white/10 hover:text-white">
            <MessageSquareHeart className="h-5 w-5" /> Donner un avis
          </button>
          <button onClick={() => setPwOpen(true)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-navy-100/80 hover:bg-white/10 hover:text-white">
            <KeyRound className="h-5 w-5" /> Mot de passe
          </button>
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-navy-100/80 hover:bg-white/10 hover:text-white">
            <LogOut className="h-5 w-5" /> Déconnexion
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-8">
        <div className="flex items-center gap-2 lg:hidden">
          <img src="/logo.svg" alt="" className="h-8 w-8" />
          <span className="font-display font-bold text-navy">EduPilote</span>
        </div>
        <div className="hidden text-sm text-slate-500 lg:block">{settings?.school_name}</div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/notifications')} className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100" aria-label="Notifications">
            <Bell className="h-5 w-5" />
            {badge > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{badge}</span>}
          </button>
          <div className="hidden text-right sm:block">
            <div className="text-sm font-semibold text-slate-800">{me.full_name}</div>
            <div className="text-xs capitalize text-slate-500">{me.role}</div>
          </div>
          <button onClick={logout} className="rounded-full p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Déconnexion">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {items.slice(0, 5).map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => cx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-navy' : 'text-slate-500')}>
            {it.icon}
            <span className="max-w-[4.5rem] truncate">{it.label}</span>
          </NavLink>
        ))}
      </nav>

      <ChangePasswordModal open={pwOpen || me.must_change_password} forced={me.must_change_password} onClose={() => setPwOpen(false)} />
      <FeedbackModal open={fbOpen} onClose={() => setFbOpen(false)} />
    </div>
  )
}
