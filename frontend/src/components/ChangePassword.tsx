import { useState } from 'react'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Button, ErrorBox, Field, Input, Modal, useToast } from './ui'

export function ChangePasswordModal({ open, forced, onClose }: { open: boolean; forced: boolean; onClose: () => void }) {
  const { refresh } = useAuth()
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState<string>()
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(undefined)
    if (next !== confirm) return setErr('Les deux nouveaux mots de passe sont différents.')
    setBusy(true)
    try {
      await api.post('/auth/password', { current, next })
      toast('Mot de passe modifié')
      setCurrent('')
      setNext('')
      setConfirm('')
      await refresh()
      onClose()
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={forced ? () => {} : onClose} title={forced ? 'Choisissez votre mot de passe' : 'Changer de mot de passe'}>
      {forced && <p className="mb-4 text-sm text-slate-600">Vous utilisez un mot de passe provisoire. Choisissez-en un personnel pour continuer.</p>}
      <form onSubmit={submit} className="space-y-3">
        <Field label={forced ? 'Mot de passe provisoire' : 'Mot de passe actuel'}>
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
        <Field label="Nouveau mot de passe" hint="8 caractères minimum">
          <Input type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
        </Field>
        <Field label="Confirmer le nouveau mot de passe">
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        <ErrorBox error={err} />
        <Button type="submit" loading={busy} className="w-full">
          Enregistrer
        </Button>
      </form>
    </Modal>
  )
}
