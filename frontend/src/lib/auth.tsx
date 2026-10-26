import { createContext, useContext, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from './api'
import type { Principal, Settings } from './types'

interface AuthState {
  me: Principal | null
  loading: boolean
  settings: Settings | undefined
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<Principal>('/auth/me')
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }
    },
    staleTime: 60_000,
  })
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Settings>('/settings'),
    enabled: !!me.data,
    staleTime: 5 * 60_000,
  })
  const value: AuthState = {
    me: me.data ?? null,
    loading: me.isLoading,
    settings: settings.data,
    refresh: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] })
    },
    logout: async () => {
      await api.post('/auth/logout')
      qc.clear()
      window.location.href = '/'
    },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth hors AuthProvider')
  return ctx
}

export function homeFor(role: string): string {
  if (role === 'admin') return '/admin'
  if (role === 'responsable') return '/responsable'
  return '/etudiant'
}
