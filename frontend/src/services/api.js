const defaultBase = import.meta.env.DEV ? 'http://localhost:3000/api/v1' : '/api/v1'
const base = (import.meta.env.VITE_API_BASE_URL || defaultBase).replace(/\/+$/, '')
const isCount = (value) => Number.isSafeInteger(value) && value >= 0
const isUser = (user) => user && isCount(user.id) &&
  typeof user.email === 'string' && ['user', 'admin'].includes(user.role)
const isQuestion = (question) => question && isCount(question.id) && isCount(question.user_id) &&
  typeof question.title === 'string' && typeof question.body === 'string' &&
  (question.hidden === undefined || typeof question.hidden === 'boolean')
const isQuestionList = (items) => Array.isArray(items) && items.every(isQuestion)
const isHiddenQuestion = (question) => isQuestion(question) && question.hidden === true
let sessionVersion = 0
export const SESSION_EXPIRED = 'codebridge:session-expired'

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export function advanceSession() {
  sessionVersion += 1
}

async function request(path, { method = 'GET', body, signal, session = true } = {}) {
  const version = sessionVersion
  let response
  try {
    response = await fetch(base + path, {
      method,
      signal: signal || AbortSignal.timeout(20000),
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError(error.name === 'TimeoutError'
      ? 'The request timed out. Please try again.'
      : 'Could not reach CodeBridge. Check your connection and try again.')
  }
  if (response.status === 204) return undefined

  let data
  try {
    data = await response.json()
  } catch (error) {
    if (signal?.aborted) throw error
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new ApiError('The request timed out. Please try again.')
    }
  }

  if (!response.ok) {
    if (response.status === 401 && session && version === sessionVersion) {
      window.dispatchEvent(new Event(SESSION_EXPIRED))
    }
    const message = response.status === 429 ? 'Too many requests. Wait a moment and try again.'
      : response.status >= 500 ? 'The service is temporarily unavailable. Please try again.'
      : data?.message || 'The request could not be completed.'
    throw new ApiError(message, response.status)
  }
  if (!data || typeof data !== 'object') throw new ApiError('The server returned an unexpected response.')
  return data
}

async function readField(path, options, key, validate) {
  const result = (await request(path, options))?.[key]
  if (!validate(result)) throw new ApiError('The server returned an unexpected response.')
  return result
}

export const auth = {
  me: (signal) => readField('/auth/me', { signal, session: false }, 'user', isUser),
  login: (body) => readField('/auth/login', { method: 'POST', body, session: false }, 'user', isUser),
  register: (body) => readField('/auth/register', { method: 'POST', body, session: false }, 'user', isUser),
  logout: () => request('/auth/logout', { method: 'POST', session: false }),
}

const questionPath = (id) => '/questions/' + encodeURIComponent(id)

export const questions = {
  list: (signal) => readField('/questions', { signal }, 'questions', isQuestionList),
  listHidden: (signal) => readField('/questions/hidden', { signal }, 'questions', (items) =>
    Array.isArray(items) && items.every(isHiddenQuestion)),
  get: (id, signal) => readField(questionPath(id), { signal }, 'question', isQuestion),
  create: (body) => readField('/questions', { method: 'POST', body }, 'question', isQuestion),
  update: (id, body) => readField(questionPath(id), { method: 'PATCH', body }, 'question', isQuestion),
  hide: (id) => readField(`${questionPath(id)}/hide`, { method: 'POST' }, 'question', isHiddenQuestion),
  reshow: (id) => readField(`${questionPath(id)}/reshow`, { method: 'POST' }, 'question', (question) =>
    isQuestion(question) && question.hidden === false),
  remove: (id) => request(questionPath(id), { method: 'DELETE' }),
}

// Proposed Milestone 2 contracts are documented in docs/frontend.md.
async function optional(path, options, validate) {
  try {
    const data = await request(path, options)
    if (!data || !validate(data)) throw new ApiError('The server returned an unexpected response.')
    return data
  } catch (error) {
    if ([404, 405, 501].includes(error.status)) return null
    throw error
  }
}

const isUsageRow = (row) => row && typeof row.method === 'string' &&
  typeof row.endpoint === 'string' && isCount(row.count)

export function improveQuestion(body) {
  return optional('/ai/improve', { method: 'POST', body }, ({ suggestion }) =>
    typeof suggestion?.title === 'string' && suggestion.title.trim().length >= 12 &&
    suggestion.title.trim().length <= 120 && typeof suggestion.body === 'string' &&
    suggestion.body.trim().length <= 12000)
}

export function getUsage(signal) {
  return optional('/usage', { signal }, ({ total, threshold, breakdown }) =>
    isCount(total) && isCount(threshold) && threshold > 0 &&
    (breakdown === undefined || (Array.isArray(breakdown) && breakdown.every(isUsageRow))))
}

export const admin = {
  counts: async (signal) => {
    const data = await request('/admin/dashboard', { signal })
    if (!isCount(data?.users) || !isCount(data?.admins)) {
      throw new ApiError('The server returned an unexpected response.')
    }
    return data
  },
  users: (signal) => optional('/admin/users', { signal }, ({ users }) =>
    Array.isArray(users) && users.every((user) => isUser(user) && (user.api_calls == null || isCount(user.api_calls)))),
  usage: (signal) => optional('/admin/usage', { signal }, ({ byUser, byEndpoint }) =>
    Array.isArray(byUser) && byUser.every((row) => row && typeof row.email === 'string' &&
      isCount(row.user_id) && isCount(row.count)) && Array.isArray(byEndpoint) &&
    byEndpoint.every(isUsageRow)),
}
