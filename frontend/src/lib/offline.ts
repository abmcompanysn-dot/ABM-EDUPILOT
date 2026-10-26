// File d'attente des pointages faits sans réseau : rejouée au retour de la connexion.
// Les liens de cartes sécurisées restent vérifiables plus tard (le compteur n'a pas bougé).

import { api, ApiError } from './api'
import type { ScanResult } from './types'

const KEY = 'edupilot.pendingScans'

export interface PendingScan {
  id: string
  session_id: string
  card_url?: string | null
  card_uid?: string
  lat?: number
  lng?: number
  queued_at: string
}

function read(): PendingScan[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as PendingScan[]
  } catch {
    return []
  }
}

function write(list: PendingScan[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // stockage indisponible (navigation privée) : on garde en mémoire seulement
  }
}

export function pendingCount(sessionId?: string): number {
  return read().filter((p) => !sessionId || p.session_id === sessionId).length
}

export function enqueue(p: Omit<PendingScan, 'id' | 'queued_at'>): void {
  write([...read(), { ...p, id: crypto.randomUUID(), queued_at: new Date().toISOString() }])
}

/** Envoie les pointages en attente ; garde ceux qui échouent faute de réseau. */
export async function flush(onResult?: (r: ScanResult) => void): Promise<number> {
  const list = read()
  const keep: PendingScan[] = []
  let sent = 0
  for (const p of list) {
    try {
      const r = await api.post<ScanResult>('/scans', { session_id: p.session_id, card_url: p.card_url, card_uid: p.card_uid, lat: p.lat, lng: p.lng })
      onResult?.(r)
      sent++
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) keep.push(p)
    }
  }
  write(keep)
  return sent
}
