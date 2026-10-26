// Présences en temps réel (WebSocket), avec reconnexion automatique.

import { useEffect, useRef, useState } from 'react'

export interface LiveEvent {
  type: string
  at: string
  data: {
    session_id: string
    class_id: string
    student_id: string
    student_name: string
    status?: string
    method?: string
    at: string
  }
}

export function useLive(classId: string | null | undefined, onEvent: (e: LiveEvent) => void): boolean {
  const [connected, setConnected] = useState(false)
  const cb = useRef(onEvent)
  cb.current = onEvent
  useEffect(() => {
    if (classId === undefined || classId === null) return
    let ws: WebSocket | null = null
    let stopped = false
    let retry = 1000
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const q = classId ? `?class_id=${encodeURIComponent(classId)}` : ''
      ws = new WebSocket(`${proto}://${location.host}/api/v1/ws${q}`)
      ws.onopen = () => {
        setConnected(true)
        retry = 1000
      }
      ws.onmessage = (m) => {
        try {
          cb.current(JSON.parse(m.data as string) as LiveEvent)
        } catch {
          // message illisible ignoré
        }
      }
      ws.onclose = () => {
        setConnected(false)
        if (!stopped) {
          setTimeout(connect, retry)
          retry = Math.min(retry * 2, 15000)
        }
      }
    }
    connect()
    return () => {
      stopped = true
      ws?.close()
    }
  }, [classId])
  return connected
}
