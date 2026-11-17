import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { SESSION_EXPIRED } from '../services/api'

export function useQuestionDraft(initial) {
  const { user, interruptedDraft } = useAuth()
  const { pathname } = useLocation()
  const owner = user.id
  const saved = interruptedDraft.current
  const matches = saved?.owner === owner && saved.pathname === pathname
  const [draft, setDraft] = useState(() => matches ? saved.draft : initial)

  useEffect(() => {
    if (matches) interruptedDraft.current = null
  }, [interruptedDraft, matches])

  useEffect(() => {
    function preserve() {
      interruptedDraft.current = { owner, pathname, draft }
    }
    window.addEventListener(SESSION_EXPIRED, preserve)
    return () => window.removeEventListener(SESSION_EXPIRED, preserve)
  }, [draft, interruptedDraft, owner, pathname])

  return [draft, setDraft]
}
