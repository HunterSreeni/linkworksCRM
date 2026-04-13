import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const PROFILE_TIMEOUT_MS = 5000

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)
  const loadingResolved = useRef(false)

  function finishLoading(error = null) {
    if (loadingResolved.current) return
    loadingResolved.current = true
    if (error) setAuthError(error)
    setLoading(false)
  }

  async function fetchProfileWithTimeout(userId) {
    try {
      const result = await Promise.race([
        supabase.from('profiles').select('role').eq('id', userId).single(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), PROFILE_TIMEOUT_MS)
        ),
      ])
      if (result.error) throw result.error
      setRole(result.data?.role || 'member')
    } catch {
      // Profile fetch failed or timed out - default to member and move on
      setRole('member')
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user) {
        fetchProfileWithTimeout(s.user.id).finally(() => finishLoading())
      } else {
        finishLoading()
      }
    }).catch((err) => {
      console.error('Failed to load session:', err)
      setUser(null)
      setSession(null)
      setRole(null)
      finishLoading('Failed to connect. Please try again.')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        setSession(s)
        setUser(s?.user ?? null)
        setAuthError(null)
        if (s?.user) {
          await fetchProfileWithTimeout(s.user.id)
        } else {
          setRole(null)
        }
        finishLoading()
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    return data
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setUser(null)
    setSession(null)
    setRole(null)
  }

  return (
    <AuthContext.Provider value={{ user, session, role, loading, authError, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
