// Client HTTP de l'API EduPilote : session par cookie HttpOnly, en-tête anti-CSRF.

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(method: string, path: string, body?: unknown, raw?: BodyInit, contentType?: string): Promise<T> {
  const headers: Record<string, string> = { 'X-EduPilot': '1' }
  let payload: BodyInit | undefined = raw
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  } else if (contentType) {
    headers['Content-Type'] = contentType
  }
  let res: Response
  try {
    res = await fetch('/api/v1' + path, { method, headers, body: payload, credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, 'Pas de connexion au serveur. Vérifiez votre réseau.')
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  const data = text ? safeJSON(text) : undefined
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : '') || `Erreur ${res.status}`
    throw new ApiError(res.status, msg.charAt(0).toUpperCase() + msg.slice(1))
  }
  return data as T
}

function safeJSON(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(method: 'POST' | 'PUT', path: string, file: Blob) => request<T>(method, path, undefined, file, file.type || 'application/octet-stream'),
  text: <T>(path: string, body: string, contentType: string) => request<T>('POST', path, undefined, body, contentType),
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? '?' + s : ''
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Une erreur est survenue'
}
