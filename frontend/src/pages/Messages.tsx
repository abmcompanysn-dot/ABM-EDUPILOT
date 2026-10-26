import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Megaphone, Trash2 } from 'lucide-react'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { fmtDateTime } from '../lib/format'
import type { Announcement, Class, Notification } from '../lib/types'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Textarea, cx, useToast } from '../components/ui'

export function AnnouncementsPage() {
  const { me } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const list = useQuery({ queryKey: ['announcements'], queryFn: () => api.get<Announcement[]>('/announcements') })
  const read = useMutation({
    mutationFn: (id: string) => api.post(`/announcements/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] })
      qc.invalidateQueries({ queryKey: ['unread'] })
    },
  })
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/announcements/${id}`),
    onSuccess: () => {
      toast('Annonce supprimée')
      qc.invalidateQueries({ queryKey: ['announcements'] })
    },
  })
  const canPost = me?.role === 'admin' || me?.role === 'responsable'
  return (
    <>
      <PageHeader title="Annonces" subtitle="Les messages de l'administration et des responsables de classe." actions={canPost && <Button onClick={() => setOpen(true)}>Nouvelle annonce</Button>} />
      {list.isLoading ? (
        <Spinner />
      ) : !list.data?.length ? (
        <Card>
          <Empty icon={<Megaphone className="h-10 w-10" />} title="Aucune annonce pour le moment" />
        </Card>
      ) : (
        <div className="space-y-3">
          {list.data.map((a) => (
            <article
              key={a.id}
              onMouseEnter={() => !a.read && a.author_id !== me?.id && read.mutate(a.id)}
              onClick={() => !a.read && a.author_id !== me?.id && read.mutate(a.id)}
              className={cx('rounded-xl border bg-white p-5 shadow-sm', !a.read && a.author_id !== me?.id ? 'border-brand/40 ring-1 ring-brand/20' : 'border-slate-200')}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-display font-semibold text-navy">{a.title}</h3>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {a.author_name ?? 'Administration'} · {fmtDateTime(a.created_at)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={a.class_id ? 'info' : 'neutral'}>{a.class_name ?? "Toute l'école"}</Badge>
                  {(me?.role === 'admin' || a.author_id === me?.id) && (
                    <>
                      <span className="text-xs text-slate-500">{a.read_count} lecture{a.read_count > 1 ? 's' : ''}</span>
                      <button onClick={() => confirm('Supprimer cette annonce ?') && del.mutate(a.id)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Supprimer">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{a.body}</p>
            </article>
          ))}
        </div>
      )}
      {canPost && <NewAnnouncement open={open} onClose={() => setOpen(false)} />}
    </>
  )
}

function NewAnnouncement({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => api.get<Class[]>('/classes') })
  const [classId, setClassId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const post = useMutation({
    mutationFn: () => api.post('/announcements', { class_id: classId || null, title, body }),
    onSuccess: () => {
      toast('Annonce publiée')
      qc.invalidateQueries({ queryKey: ['announcements'] })
      setTitle('')
      setBody('')
      onClose()
    },
  })
  return (
    <Modal open={open} onClose={onClose} title="Nouvelle annonce">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          post.mutate()
        }}
      >
        <Field label="Destinataires">
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} required={me?.role !== 'admin'}>
            {me?.role === 'admin' ? <option value="">Toute l'école</option> : <option value="">Choisir une classe…</option>}
            {classes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.filiere_name} — {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Titre">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} required />
        </Field>
        <Field label="Message">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} required />
        </Field>
        <ErrorBox error={post.error && errorMessage(post.error)} />
        <Button type="submit" loading={post.isPending} className="w-full">
          Publier
        </Button>
      </form>
    </Modal>
  )
}

export function NotificationsPage() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<Notification[]>('/me/notifications') })
  const readAll = useMutation({
    mutationFn: () => api.post('/me/notifications/read'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['unread'] })
    },
  })
  const unread = list.data?.filter((n) => !n.read_at).length ?? 0
  return (
    <>
      <PageHeader title="Notifications" subtitle="Alertes d'assiduité, validations de photo et autres messages automatiques." actions={unread > 0 && <Button variant="secondary" onClick={() => readAll.mutate()}>Tout marquer comme lu</Button>} />
      <Card padded={false}>
        {list.isLoading ? (
          <Spinner />
        ) : !list.data?.length ? (
          <Empty icon={<Bell className="h-10 w-10" />} title="Aucune notification" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.data.map((n) => (
              <li key={n.id} className={cx('flex gap-3 px-5 py-4', !n.read_at && 'bg-brand-50/40')}>
                <div className={cx('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : n.kind === 'absence' ? 'bg-red-500' : 'bg-brand')} />
                <div>
                  <div className="font-semibold text-slate-800">{n.title}</div>
                  <div className="text-sm text-slate-600">{n.body}</div>
                  <div className="mt-1 text-xs text-slate-400">{fmtDateTime(n.created_at)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ErrorBox error={list.error} />
    </>
  )
}
