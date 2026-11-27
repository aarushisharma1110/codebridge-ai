import { useCallback, useEffect, useState } from 'react'
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
        setResult({ load, attempt, error, status: failure.status })
      }
    })
    return () => controller.abort()
  }, [load, attempt])

  const current = result?.load === load && result.attempt === attempt ? result : null
  return {
    data: current?.data,
    error: current?.error,
    status: current?.status,
    loading: !current,
    retry: () => setAttempt((value) => value + 1),
    // Replaces the loaded data in place, for example after a vote.
    setData: (update) => setResult((previous) => previous && previous.load === load
      ? { ...previous, data: typeof update === 'function' ? update(previous.data) : update } : previous),
  }
}

// useResource with a loader rebuilt only when deps change.
export function useLoad(loader, deps) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loader, deps)
  return useResource(load)
}
