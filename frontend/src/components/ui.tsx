import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Loader2, X } from 'lucide-react'
import { initials } from '../lib/format'

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost' | 'gold'

export function Button({ variant = 'primary', loading, className, children, disabled, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-navy text-white hover:bg-navy-700 shadow-sm',
    secondary: 'bg-white text-navy border border-slate-300 hover:bg-slate-50',
    ghost: 'text-slate-700 hover:bg-slate-100',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    dangerGhost: 'text-red-600 hover:bg-red-50',
    gold: 'bg-gold text-navy-900 hover:brightness-95 shadow-sm',
  }
  return (
    <button
      {...p}
      disabled={disabled || loading}
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50', styles[variant], className)}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  )
}

const inputCls = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-slate-100'

const width = (c?: string) => (c && /(^|\s)w-/.test(c) ? '' : 'w-full')

export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(inputCls, width(p.className), p.className)} />
}

export function Select({ children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...p} className={cx(inputCls, width(p.className), p.className)}>
      {children}
    </select>
  )
}

export function Textarea(p: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx(inputCls, 'w-full min-h-[96px]', p.className)} />
}

export function Card({ title, actions, children, className, padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          {title && <h2 className="font-display text-base font-semibold text-navy">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx(padded && 'p-5')}>{children}</div>
    </section>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral' | 'none'

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const t: Record<Tone, string> = {
    good: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    warn: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    bad: 'bg-red-50 text-red-700 ring-red-600/20',
    info: 'bg-brand-50 text-brand-700 ring-brand/20',
    neutral: 'bg-slate-100 text-slate-700 ring-slate-500/20',
    none: 'bg-slate-50 text-slate-500 ring-slate-400/20',
  }
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', t[tone])}>{children}</span>
}

export const attendanceTone = (s: string | null | undefined): Tone =>
  s === 'present' ? 'good' : s === 'retard' ? 'warn' : s === 'excuse' ? 'info' : s === 'absent' ? 'bad' : 'none'

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  const color = tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : 'text-navy'
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cx('mt-1 font-display text-3xl font-bold', color)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label ?? 'Chargement…'}
    </div>
  )
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      {icon && <div className="text-slate-300">{icon}</div>}
      <div className="font-semibold text-slate-700">{title}</div>
      {children && <div className="max-w-md text-sm text-slate-500">{children}</div>}
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error instanceof Error ? error.message : String(error)}</div>
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cx('max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3">
          <h3 className="font-display font-semibold text-navy">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>
      </table>
      {empty}
    </div>
  )
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx('whitespace-nowrap px-4 py-2.5 text-slate-700', className)}>{children}</td>
}

export function Avatar({ name, src, size = 40 }: { name: string; src?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false)
  const style = { width: size, height: size }
  if (src && !failed) return <img src={src} alt={name} style={style} onError={() => setFailed(true)} className="shrink-0 rounded-full object-cover ring-2 ring-white" />
  return (
    <div style={{ ...style, fontSize: size * 0.38 }} className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold to-amber-500 font-bold text-navy-900">
      {initials(name)}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: ReactNode }[] }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cx('whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold transition', value === t.id ? 'border-navy text-navy' : 'border-transparent text-slate-500 hover:text-slate-800')}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- notifications éphémères

type Toast = { id: number; text: string; tone: 'good' | 'bad' }
const ToastCtx = createContext<(text: string, tone?: 'good' | 'bad') => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: string, tone: 'good' | 'bad' = 'good') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-20 left-0 right-0 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {toasts.map((t) => (
          <div key={t.id} className={cx('pointer-events-auto rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg', t.tone === 'good' ? 'bg-navy' : 'bg-red-600')}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

export function CopyButton({ text, label = 'Copier' }: { text: string; label?: string }) {
  const toast = useToast()
  return (
    <Button
      variant="secondary"
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => toast('Copié dans le presse-papiers'),
          () => toast('Copie impossible', 'bad'),
        )
      }}
    >
      {label}
    </Button>
  )
}
