// Types partagés avec l'API Go (internal/app).

export type Role = 'admin' | 'responsable' | 'etudiant'

export interface Principal {
  id: string
  role: Role
  full_name: string
  email: string
  class_ids: string[]
  must_change_password: boolean
}

export interface Settings {
  school_name: string
  late_minutes: number
  alert_threshold: number
  window_before_minutes: number
  window_after_minutes: number
  departure_min_minutes: number
}

export interface AcademicYear { id: string; label: string; starts_on: string; ends_on: string; active: boolean }
export interface Filiere { id: string; name: string; class_count: number }
export interface UserRef { id: string; full_name: string }

export interface Class {
  id: string
  name: string
  filiere_id: string
  filiere_name: string
  academic_year_id: string | null
  year_label: string | null
  invite_code: string
  invite_open: boolean
  student_count: number
  managers: UserRef[]
}

export interface User {
  id: string
  role: Role
  email: string
  full_name: string
  phone: string
  active: boolean
  last_login_at: string | null
  class_ids: string[]
}

export interface Student {
  id: string
  full_name: string
  email: string
  phone: string
  matricule: string
  class_id: string
  class_name: string
  filiere_name: string
  birth_date: string | null
  active: boolean
  enrolled_at: string
  has_photo: boolean
  profile_slug: string
  profile_public: boolean
  card_status: string | null
  card_kind: string | null
  last_login_at: string | null
}

export interface Module {
  id: string
  class_id: string
  name: string
  teacher: string
  planned_hours: number
  status: 'en_cours' | 'termine'
  sessions: number
  hours_done: number
}

export type SessionStatus = 'prevu' | 'confirme' | 'annule'

export interface Session {
  id: string
  class_id: string
  class_name: string
  module_id: string
  module_name: string
  teacher: string
  starts_at: string
  ends_at: string
  room: string
  mode: 'presentiel' | 'en_ligne'
  status: SessionStatus
  present: number
  expected: number
  my_status?: AttendanceStatus | null
}

export type AttendanceStatus = 'present' | 'retard' | 'excuse' | 'absent'

export interface RosterEntry {
  student_id: string
  full_name: string
  matricule: string
  has_photo: boolean
  status: AttendanceStatus | null
  method: string | null
  arrived_at: string | null
  left_at: string | null
  note: string
}

export interface ScanResult {
  outcome: 'present' | 'retard' | 'deja' | 'depart' | 'refuse'
  message: string
  student?: { id: string; full_name: string; matricule: string; has_photo: boolean }
  at: string
}

export interface Card {
  id: string
  uid: string
  kind: 'sun' | 'uid'
  student_id: string
  student_name: string
  matricule: string
  class_name: string
  status: 'active' | 'perdue' | 'revoquee' | 'remplacee'
  year_label: string | null
  issued_at: string
  revoked_at: string | null
}

export interface Programming {
  url_template: string
  picc_data_offset: number
  mac_offset: number
  app_master_key: string
  sdm_meta_read_key: string
  sdm_file_read_key: string
}

export interface IDResult {
  status: 'valide' | 'expiree' | 'perdue' | 'revoquee' | 'remplacee' | 'rejeu' | 'inconnue' | 'invalide'
  message: string
  proof?: string
  student?: {
    id: string
    full_name: string
    class_name: string
    filiere_name: string
    year_label: string
    school_name: string
    has_photo: boolean
    profile_slug?: string
    checked_at: string
  }
  staff?: {
    matricule: string
    birth_date: string | null
    email: string
    phone: string
    attendance_rate: number | null
    current_session: Session | null
  }
}

export interface Link { label: string; url: string }

export interface ProProfile {
  slug: string
  public: boolean
  full_name: string
  headline: string
  bio: string
  skills: string[]
  links: Link[]
  class_name: string
  filiere_name: string
  school_name: string
  email?: string
  phone?: string
  has_photo: boolean
}

export interface GroupRate { id: string; name: string; sessions: number; rate: number }
export interface DailyRate { day: string; expected: number; present: number; rate: number }
export interface RiskStudent { id: string; full_name: string; matricule: string; class_name: string; sessions: number; rate: number; streak: number }

export interface Overview {
  students: number
  classes: number
  sessions_today: number
  present_today: number
  rate_30: number | null
  rate_prev_30: number | null
  at_risk: RiskStudent[]
  daily: DailyRate[]
  by_class: GroupRate[]
  cards_active: number
  pending_photos: number
}

export interface StudentRate {
  id: string
  full_name: string
  matricule: string
  sessions: number
  present: number
  late: number
  excused: number
  rate: number
  streak: number
}

export interface ClassStats { rate: number | null; sessions: number; by_module: GroupRate[]; students: StudentRate[] }

export interface HistoryEntry {
  session_id: string
  module_name: string
  starts_at: string
  ends_at: string
  status: AttendanceStatus
  method: string | null
  arrived_at: string | null
  left_at: string | null
}

export interface StudentAttendance { rate: number | null; streak: number; by_module: GroupRate[]; history: HistoryEntry[] }

export interface Announcement {
  id: string
  author_name: string | null
  author_id: string | null
  class_id: string | null
  class_name: string | null
  title: string
  body: string
  created_at: string
  read: boolean
  read_count: number
}

export interface Notification { id: string; kind: string; title: string; body: string; created_at: string; read_at: string | null }

export interface Device { id: string; name: string; location: string; open_ms: number; active: boolean; created_at: string; last_seen_at: string | null; last_sync_at: string | null }

export interface DoorEvent { id: number; device_name: string; card_uid: string; student_name: string | null; allowed: boolean; reason: string; at: string; offline: boolean }

export interface AuditEntry { event_id: string; type: string; actor_name: string | null; subject: string; occurred_at: string; data: Record<string, unknown> | null }

export interface PhotoRequest { id: string; student_id: string; full_name: string; matricule: string; class_name: string; created_at: string; has_current: boolean }

export interface Feedback { id: string; user_name: string | null; role: string | null; rating: number; comment: string; created_at: string }

export interface Credential { matricule: string; full_name: string; email: string; password?: string; error?: string }
