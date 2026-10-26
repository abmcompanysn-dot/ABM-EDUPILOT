import { Suspense, lazy, type ComponentType, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { homeFor, useAuth } from './lib/auth'
import type { Role } from './lib/types'
import { Spinner } from './components/ui'
import { Layout } from './components/Layout'
import { IdPage, LegalPage, LoginPage, NotFound, ProfilePage, RegisterPage } from './pages/public/Public'
import { AnnouncementsPage, NotificationsPage } from './pages/Messages'

// Chaque espace est chargé à la demande : un étudiant ne télécharge pas les écrans d'administration.
const named = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })))
const admin = () => import('./pages/admin/Admin')
const structure = () => import('./pages/admin/Structure')
const AdminDashboard = named(() => import('./pages/admin/Dashboard'), 'AdminDashboard')
const StructurePage = named(structure, 'StructurePage')
const StaffPage = named(structure, 'StaffPage')
const AdminStudents = named(admin, 'AdminStudents')
const CardsPage = named(admin, 'CardsPage')
const DoorsPage = named(admin, 'DoorsPage')
const FeedbackPage = named(admin, 'FeedbackPage')
const JournalPage = named(admin, 'JournalPage')
const PrintCard = named(admin, 'PrintCard')
const SettingsPage = named(admin, 'SettingsPage')
const ResponsableHome = named(() => import('./pages/resp/Home'), 'ResponsableHome')
const ClassPage = named(() => import('./pages/resp/ClassPage'), 'ClassPage')
const PointagePage = named(() => import('./pages/resp/Pointage'), 'PointagePage')
const StudentDetail = named(() => import('./pages/StudentDetail'), 'StudentDetail')
const student = () => import('./pages/student/Student')
const StudentHome = named(student, 'StudentHome')
const StudentSchedule = named(student, 'StudentSchedule')
const StudentAttendancePage = named(student, 'StudentAttendancePage')
const StudentCardPage = named(student, 'StudentCardPage')
const ProProfileEditor = named(student, 'ProProfileEditor')

/** Protège une route : connexion obligatoire et, si précisé, rôle autorisé. */
function Guard({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { me, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <Spinner />
  if (!me) return <Navigate to={`/?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (roles && !roles.includes(me.role)) return <Navigate to={homeFor(me.role)} replace />
  return <>{children}</>
}

const staff: Role[] = ['admin', 'responsable']

export function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/inscription/:code" element={<RegisterPage />} />
      <Route path="/id" element={<IdPage />} />
      <Route path="/p/:slug" element={<ProfilePage />} />
      <Route path="/mentions-legales" element={<LegalPage />} />
      <Route
        path="/admin/cartes/imprimer/:id"
        element={
          <Guard roles={['admin']}>
            <PrintCard />
          </Guard>
        }
      />
      <Route
        element={
          <Guard>
            <Layout />
          </Guard>
        }
      >
        <Route path="/admin" element={<Guard roles={['admin']}><AdminDashboard /></Guard>} />
        <Route path="/admin/structure" element={<Guard roles={['admin']}><StructurePage /></Guard>} />
        <Route path="/admin/etudiants" element={<Guard roles={['admin']}><AdminStudents /></Guard>} />
        <Route path="/admin/personnel" element={<Guard roles={['admin']}><StaffPage /></Guard>} />
        <Route path="/admin/cartes" element={<Guard roles={['admin']}><CardsPage /></Guard>} />
        <Route path="/admin/portes" element={<Guard roles={['admin']}><DoorsPage /></Guard>} />
        <Route path="/admin/journal" element={<Guard roles={['admin']}><JournalPage /></Guard>} />
        <Route path="/admin/avis" element={<Guard roles={['admin']}><FeedbackPage /></Guard>} />
        <Route path="/admin/parametres" element={<Guard roles={['admin']}><SettingsPage /></Guard>} />
        <Route path="/responsable" element={<Guard roles={['responsable']}><ResponsableHome /></Guard>} />
        <Route path="/classes/:id" element={<Guard roles={staff}><ClassPage /></Guard>} />
        <Route path="/pointage/:id" element={<Guard roles={staff}><PointagePage /></Guard>} />
        <Route path="/etudiants/:id" element={<Guard roles={staff}><StudentDetail /></Guard>} />
        <Route path="/etudiant" element={<Guard roles={['etudiant']}><StudentHome /></Guard>} />
        <Route path="/etudiant/planning" element={<Guard roles={['etudiant']}><StudentSchedule /></Guard>} />
        <Route path="/etudiant/presences" element={<Guard roles={['etudiant']}><StudentAttendancePage /></Guard>} />
        <Route path="/etudiant/carte" element={<Guard roles={['etudiant']}><StudentCardPage /></Guard>} />
        <Route path="/etudiant/profil" element={<Guard roles={['etudiant']}><ProProfileEditor /></Guard>} />
        <Route path="/annonces" element={<AnnouncementsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
