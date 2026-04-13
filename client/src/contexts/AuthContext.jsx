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

  // Fetch profile separately - NEVER call this inside onAuthStateChange.
  // Calling Supabase queries inside the auth callback creates a deadlock
  // with the internal token refresh lock (supabase-js#2126).
  async function fetchProfile(userId) {
    try {
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
    } catch {
      setRole('member')
    }
  }

  // Effect 1: Initialize session and listen for auth changes.
  // The onAuthStateChange callback ONLY updates session/user state.
  // No Supabase DB queries inside the callback - this is critical.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!resolved.current) {
        console.warn('Auth loading timed out after', AUTH_TIMEOUT_MS, 'ms')
        finishLoading('Connection timed out. Please sign out and try again.')
      }
    }, AUTH_TIMEOUT_MS)

    // Step 1: Get initial session (handles token refresh internally)
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (!s?.user) {
        finishLoading()
      }
      // If user exists, Effect 2 will handle fetchProfile + finishLoading
    }).catch((err) => {
      console.error('getSession failed:', err)
      finishLoading('Failed to connect. Please try again.')
    })

    // Step 2: Listen for auth state changes (sign in, sign out, token refresh)
    // Keep this callback LIGHTWEIGHT - only update React state, nothing else.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        setSession(s)
        setUser(s?.user ?? null)
        setAuthError(null)

        if (event === 'SIGNED_OUT') {
          setRole(null)
          finishLoading()
        }
      }
    )

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  // Effect 2: Fetch profile whenever user changes.
  // This runs OUTSIDE the auth callback, avoiding the deadlock.
  // Uses setTimeout(0) to defer the Supabase DB call out of any
  // auth lock that might still be held during initialization.
  useEffect(() => {
    if (!user) return

    const deferred = setTimeout(() => {
      fetchProfile(user.id).then(() => finishLoading())
    }, 0)

    return () => clearTimeout(deferred)
  }, [user?.id])

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
