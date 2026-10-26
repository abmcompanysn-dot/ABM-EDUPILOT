// Mise en forme en français (dates, heures, taux).

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const shortDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const dateTime = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const fmtDate = (s: string | Date) => dateFmt.format(new Date(s))
export const fmtShortDate = (s: string | Date) => shortDate.format(new Date(s))
export const fmtTime = (s: string | Date) => timeFmt.format(new Date(s))
export const fmtDateTime = (s: string | Date) => dateTime.format(new Date(s))
export const fmtRange = (a: string, b: string) => `${fmtShortDate(a)} · ${fmtTime(a)}–${fmtTime(b)}`

export function fmtRate(r: number | null | undefined): string {
  if (r === null || r === undefined) return '—'
  return Math.round(r * 100) + ' %'
}

export function rateTone(r: number | null | undefined): 'good' | 'warn' | 'bad' | 'none' {
  if (r === null || r === undefined) return 'none'
  if (r >= 0.75) return 'good'
  if (r >= 0.5) return 'warn'
  return 'bad'
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

// toLocalInput / fromLocalInput : champs <input type="datetime-local">.
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function startOfWeek(d: Date): Date {
  const r = new Date(d)
  const day = (r.getDay() + 6) % 7
  r.setDate(r.getDate() - day)
  r.setHours(0, 0, 0, 0)
  return r
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export const statusLabel: Record<string, string> = {
  present: 'Présent',
  retard: 'En retard',
  excuse: 'Excusé',
  absent: 'Absent',
  prevu: 'Prévu',
  confirme: 'Confirmé',
  annule: 'Annulé',
  active: 'Active',
  perdue: 'Perdue',
  revoquee: 'Révoquée',
  remplacee: 'Remplacée',
  en_cours: 'En cours',
  termine: 'Terminé',
  nfc: 'Carte NFC',
  qr: 'QR',
  porte: 'Porte',
  manuel: 'Manuel',
  en_ligne: 'En ligne',
  presentiel: 'Présentiel',
}
