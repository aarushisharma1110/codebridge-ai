import { useRef, useState } from 'react'
import { improveQuestion } from '../services/api'
import { MAX_TITLE_LENGTH, MIN_TITLE_LENGTH } from '../components/QuestionFields'
import { textToHtml } from '../components/RichEditor'
import messages from '../../../lang/message/en/messages.json'

export function useImprovement(draft) {
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})
  const inFlight = useRef(false)

  async function improve() {
    if (inFlight.current) return
    const original = draft.title.trim()
    if (!original || original.length > 2000) {
      setErrors({ title: original ? messages.improvement.inputTooLong : messages.questions.titleRequired })
      document.getElementById('question-title')?.focus()
      return
    }

    setErrors({})
    inFlight.current = true
    setBusy(true)
    setResult(null)
    try {
      const suggestion = await improveQuestion(original)
      const fitsTitle = suggestion.length >= MIN_TITLE_LENGTH && suggestion.length <= MAX_TITLE_LENGTH &&
        !/[\r\n]/.test(suggestion)
      const revisedDraft = fitsTitle
        ? { ...draft, title: suggestion }
        : { ...draft, body: textToHtml(suggestion) + (draft.body || '') }
      setResult({ original, suggestion, fitsTitle, revisedDraft })
    } catch (failure) {
      setResult({ error: failure.message })
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }

  return { result, busy, errors, setErrors, improve, reset: () => setResult(null) }
}
