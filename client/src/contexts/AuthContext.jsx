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
    // Failsafe: if auth init hangs for any reason, show error modal after 10s
    const timeout = setTimeout(() => {
      if (!resolved.current) {
        console.warn('Auth loading timed out after', AUTH_TIMEOUT_MS, 'ms')
        finishLoading('Connection timed out. Please sign out and try again.')
      }
    }, AUTH_TIMEOUT_MS)

    async function initAuth() {
      try {
        // Step 1: Check if a session exists in localStorage
        const { data: { session: storedSession } } = await supabase.auth.getSession()

        if (!storedSession) {
          finishLoading()
          return
        }

        // Step 2: Validate the token with Supabase server.
        // getSession() returns the token from localStorage WITHOUT refreshing it.
        // getUser() will use the refresh_token to get a fresh access_token if expired.
        const { data: { user: validatedUser }, error: userError } = await supabase.auth.getUser()

        if (userError || !validatedUser) {
          console.error('Session expired:', userError?.message)
          await supabase.auth.signOut().catch(() => {})
          setUser(null)
          setSession(null)
          setRole(null)
          finishLoading()
          return
        }

        // Step 3: Token is valid/refreshed, now fetch the profile
        const { data: { session: freshSession } } = await supabase.auth.getSession()
        setSession(freshSession)
        setUser(validatedUser)
        await fetchProfile(validatedUser.id)
        finishLoading()
      } catch (err) {
        console.error('Auth init failed:', err)
        setUser(null)
        setSession(null)
        setRole(null)
        finishLoading('Failed to connect. Please try again.')
      }
    }

    initAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        setSession(s)
        setUser(s?.user ?? null)
        setAuthError(null)
        if (s?.user) {
          await fetchProfile(s.user.id)
        } else {
          setRole(null)
        }
        finishLoading()
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
