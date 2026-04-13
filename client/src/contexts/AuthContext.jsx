import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const AUTH_TIMEOUT_MS = 10000

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)
  const resolved = useRef(false)

  function finishLoading(error = null) {
    if (resolved.current) return
    resolved.current = true
    if (error) setAuthError(error)
    setLoading(false)
  }

  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Failed to fetch profile:', error.message)
      setRole('member')
      return
    }

    setRole(data?.role || 'member')
  }

  useEffect(() => {
    // Failsafe: show retry + sign out modal if auth hangs beyond 10s
    const timeout = setTimeout(() => {
      if (!resolved.current) {
        console.warn('Auth loading timed out after', AUTH_TIMEOUT_MS, 'ms')
        finishLoading('Connection timed out. Please sign out and try again.')
      }
    }, AUTH_TIMEOUT_MS)

    // onAuthStateChange with INITIAL_SESSION is the correct way to init auth.
    // The Supabase client automatically refreshes the access_token using the
    // refresh_token before firing INITIAL_SESSION. So by the time the callback
    // runs, the session has a valid (non-expired) access_token.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        setSession(s)
        setUser(s?.user ?? null)

        if (s?.user) {
          await fetchProfile(s.user.id)
        } else {
          setRole(null)
        }

        // INITIAL_SESSION fires once on startup (after token refresh if needed).
        // Also finish loading on SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED so
        // the UI always unblocks.
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
          setAuthError(null)
          finishLoading()
        }
      }
    )

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
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
