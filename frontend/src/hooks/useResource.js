import { useEffect, useState } from 'react'
import messages from '../../../lang/message/en/messages.json'

export function useResource(load) {
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)])
    load(signal).then((data) => {
      if (!controller.signal.aborted) setResult({ load, attempt, data })
    }).catch((failure) => {
      if (!controller.signal.aborted) {
        const error = signal.aborted ? messages.client.timeout : failure.message
        setResult({ load, attempt, error })
      }
    })
    return () => controller.abort()
  }, [load, attempt])

  const current = result?.load === load && result.attempt === attempt ? result : null
  return {
    data: current?.data,
    error: current?.error,
    loading: !current,
    retry: () => setAttempt((value) => value + 1),
  }
}
