import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)

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
    async function initAuth() {
      try {
        // Step 1: Check if a session exists in localStorage
        const { data: { session: storedSession } } = await supabase.auth.getSession()

        if (!storedSession) {
          // No session at all - not logged in
          setLoading(false)
          return
        }

        // Step 2: Validate the token with Supabase server.
        // getSession() returns the token from localStorage WITHOUT refreshing it.
        // If the access_token is expired, getUser() will use the refresh_token
        // to get a fresh access_token before returning.
        const { data: { user: validatedUser }, error: userError } = await supabase.auth.getUser()

        if (userError || !validatedUser) {
          // Refresh token is also expired or invalid - session is dead
          console.error('Session expired:', userError?.message)
          await supabase.auth.signOut().catch(() => {})
          setUser(null)
          setSession(null)
          setRole(null)
          setLoading(false)
          return
        }

        // Step 3: Token is valid/refreshed, now fetch the profile
        const { data: { session: freshSession } } = await supabase.auth.getSession()
        setSession(freshSession)
        setUser(validatedUser)
        await fetchProfile(validatedUser.id)
      } catch (err) {
        console.error('Auth init failed:', err)
        setAuthError('Failed to connect. Please try again.')
        setUser(null)
        setSession(null)
        setRole(null)
      } finally {
        setLoading(false)
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
