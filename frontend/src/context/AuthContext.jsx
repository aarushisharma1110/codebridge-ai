import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { advanceSession, auth, SESSION_EXPIRED } from '../services/api'
import messages from '../../../lang/message/en/messages.json'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [pending, setPending] = useState(true)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  const [signedOut, setSignedOut] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const interruptedDraft = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)])
    auth.me(signal).then(setUser).catch((failure) => {
      if (!controller.signal.aborted && failure.status !== 401) {
        setError(signal.aborted ? messages.auth.sessionTimedOut : failure.message)
      }
    }).finally(() => {
      if (!controller.signal.aborted) setPending(false)
    })
    return () => controller.abort()
  }, [attempt])

  useEffect(() => {
    function expire() {
      advanceSession()
      setUser(null)
      setExpired(true)
    }
    window.addEventListener(SESSION_EXPIRED, expire)
    return () => window.removeEventListener(SESSION_EXPIRED, expire)
  }, [])

  function retry() {
    setPending(true)
    setError('')
    setAttempt((value) => value + 1)
  }

  async function login(credentials) {
    const profile = await auth.login(credentials)
    const account = await auth.me().catch((failure) => {
      if (failure.status === 401) throw new Error(messages.auth.sessionNotEstablished)
      throw failure
    })
    if (account.id !== profile.id) throw new Error(messages.auth.sessionNotEstablished)
    advanceSession()
    if (interruptedDraft.current?.owner !== account.id) interruptedDraft.current = null
    setExpired(false)
    setSignedOut(false)
    setUser(account)
  }

  async function logout() {
    await auth.logout()
    advanceSession()
    interruptedDraft.current = null
    setExpired(false)
    setSignedOut(true)
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, pending, error, expired, signedOut, retry, login, logout, interruptedDraft,
    updateUser: (changes) => setUser((current) => current && { ...current, ...changes }) }}>
    {children}
  </AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
