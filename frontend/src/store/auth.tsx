import { createContext, useContext, useState, type ReactNode } from 'react'
import { api, tokenStore } from '@/lib/api'

export type Role = 'customer' | 'admin'
export type User = { id: number; name: string; email: string; role: Role; phone?: string | null; address?: string | null; city?: string | null }

type AuthContextValue = {
  user: User | null
  signIn: (email: string, password: string) => Promise<User>
  register: (name: string, email: string, password: string) => Promise<User>
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const USER_KEY = 'tropic-line-user'

function readStored(): User | null {
  if (!tokenStore.get()) return null
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(readStored)

  function keep({ token, user: next }: { token: string; user: User }) {
    tokenStore.set(token)
    localStorage.setItem(USER_KEY, JSON.stringify(next))
    setUser(next)
    return next
  }

  const value: AuthContextValue = {
    user,
    async signIn(email, password) {
      return keep(await api('/auth/login', { method: 'POST', body: { email, password } }))
    },
    async register(name, email, password) {
      return keep(await api('/auth/register', { method: 'POST', body: { name, email, password } }))
    },
    signOut() {
      tokenStore.clear()
      localStorage.removeItem(USER_KEY)
      setUser(null)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
