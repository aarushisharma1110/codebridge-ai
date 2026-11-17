import { useRef, useState } from 'react'
import { improveQuestion } from '../services/api'
import { cleanQuestion, questionErrors } from '../components/QuestionFields'

export function useImprovement(draft) {
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})
  const inFlight = useRef(false)

  async function improve() {
    if (inFlight.current) return
    const checked = questionErrors(draft)
    setErrors(checked)
    if (Object.keys(checked).length) {
      document.getElementById(checked.title ? 'question-title' : 'question-body')?.focus()
      return
    }

    const original = cleanQuestion(draft)
    inFlight.current = true
    setBusy(true)
    setResult(null)
    try {
      const data = await improveQuestion(original)
      setResult(data ? { original, suggestion: data.suggestion } : { unavailable: true })
    } catch (failure) {
      setResult({ error: failure.message })
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }

  return { result, busy, errors, setErrors, improve, reset: () => setResult(null) }
}
