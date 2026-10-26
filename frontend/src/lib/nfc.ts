// Web NFC (Chrome Android) : lecture des cartes étudiantes et écriture du lien.
// Sur iPhone, Web NFC n'existe pas : toucher la carte ouvre la page /id dans Safari.

interface NDEFRecordLike {
  recordType: string
  data?: DataView
}

interface NDEFReadingEventLike extends Event {
  serialNumber: string
  message: { records: NDEFRecordLike[] }
}

interface NDEFReaderLike {
  scan(opts?: { signal?: AbortSignal }): Promise<void>
  write(message: { records: { recordType: string; data: string }[] }, opts?: { signal?: AbortSignal }): Promise<void>
  addEventListener(type: 'reading', cb: (e: NDEFReadingEventLike) => void, opts?: { signal?: AbortSignal }): void
  addEventListener(type: 'readingerror', cb: () => void, opts?: { signal?: AbortSignal }): void
}

declare global {
  interface Window {
    NDEFReader?: new () => NDEFReaderLike
  }
}

export const nfcSupported = (): boolean => typeof window !== 'undefined' && 'NDEFReader' in window

export interface Tap {
  uid: string // numéro de série de la puce, « 04:a1:… »
  url: string | null // lien NDEF (cartes NTAG 424 DNA : contient e et c)
}

function decodeUrl(r: NDEFRecordLike): string | null {
  if (!r.data) return null
  const text = new TextDecoder().decode(r.data)
  if (r.recordType === 'url' || r.recordType === 'absolute-url') return text
  return null
}

/**
 * Écoute les cartes en continu jusqu'à l'annulation du signal.
 * Le navigateur demande l'autorisation NFC au premier appel (geste de l'utilisateur requis).
 */
export async function startScan(onTap: (t: Tap) => void, onError: (msg: string) => void, signal: AbortSignal): Promise<void> {
  if (!window.NDEFReader) throw new Error('Ce téléphone ou ce navigateur ne lit pas le NFC (utilisez Chrome sur Android).')
  const reader = new window.NDEFReader()
  reader.addEventListener(
    'reading',
    (e) => {
      const url = e.message.records.map(decodeUrl).find((u) => u) ?? null
      onTap({ uid: e.serialNumber, url })
    },
    { signal },
  )
  reader.addEventListener('readingerror', () => onError('Carte mal lue, réessayez en la tenant immobile.'), { signal })
  await reader.scan({ signal })
}

/** Lit une seule carte (attribution d'une carte vierge). */
export function readOnce(signal: AbortSignal): Promise<Tap> {
  return new Promise((resolve, reject) => {
    const inner = new AbortController()
    signal.addEventListener('abort', () => inner.abort())
    startScan(
      (t) => {
        inner.abort()
        resolve(t)
      },
      () => {},
      inner.signal,
    ).catch(reject)
  })
}

/** Écrit le lien de la carte (puces simples : lien vers la page d'identité). */
export async function writeUrl(url: string, signal: AbortSignal): Promise<void> {
  if (!window.NDEFReader) throw new Error('Écriture NFC non disponible sur cet appareil.')
  await new window.NDEFReader().write({ records: [{ recordType: 'url', data: url }] }, { signal })
}

export function vibrate(pattern: number | number[]): void {
  if ('vibrate' in navigator) navigator.vibrate(pattern)
}

let audioCtx: AudioContext | null = null

/** Bip court : aigu = accepté, grave = refusé. */
export function beep(ok: boolean): void {
  try {
    audioCtx ??= new AudioContext()
    const o = audioCtx.createOscillator()
    const g = audioCtx.createGain()
    o.frequency.value = ok ? 1320 : 330
    g.gain.value = 0.08
    o.connect(g).connect(audioCtx.destination)
    o.start()
    o.stop(audioCtx.currentTime + (ok ? 0.09 : 0.3))
  } catch {
    // le son est un confort, pas une nécessité
  }
}
