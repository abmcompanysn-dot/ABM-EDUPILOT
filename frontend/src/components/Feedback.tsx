import { useState } from 'react'
import { Star } from 'lucide-react'
import { api, errorMessage } from '../lib/api'
import { Button, ErrorBox, Field, Modal, Textarea, cx, useToast } from './ui'

export function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [err, setErr] = useState<string>()
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    setErr(undefined)
    try {
      await api.post('/feedback', { rating, comment })
      toast('Merci pour votre avis !')
      setRating(0)
      setComment('')
      onClose()
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Votre avis sur EduPilote">
      <div className="space-y-4">
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setRating(n)} aria-label={`${n} étoile${n > 1 ? 's' : ''}`}>
              <Star className={cx('h-9 w-9', n <= rating ? 'fill-gold text-gold' : 'text-slate-300')} />
            </button>
          ))}
        </div>
        <Field label="Ce qui marche bien, ce qui manque (facultatif)">
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
        </Field>
        <ErrorBox error={err} />
        <Button onClick={submit} disabled={rating === 0} loading={busy} className="w-full">
          Envoyer
        </Button>
      </div>
    </Modal>
  )
}
