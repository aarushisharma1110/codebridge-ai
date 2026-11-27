import messages from '../../../lang/message/en/messages.json'
const defaultBase = import.meta.env.DEV ? 'http://localhost:3000/api/v1' : '/api/v1'
const base = (import.meta.env.VITE_API_BASE_URL || defaultBase).replace(/\/+$/, '')
const isCount = (value) => Number.isSafeInteger(value) && value >= 0
const ROLES = ['user', 'expert', 'editor', 'moderator', 'admin']
const isUser = (user) => user && isCount(user.id) &&
  typeof user.email === 'string' && ROLES.includes(user.role)
const isQuestion = (question) => question && isCount(question.id) && isCount(question.user_id) &&
  typeof question.title === 'string' && typeof question.body === 'string' &&
  (question.hidden === undefined || typeof question.hidden === 'boolean')
const isPage = (key) => (data) => data && Array.isArray(data[key]) && isCount(data.total)
let sessionVersion = 0
export const USAGE_CHANGED = 'codebridge:usage-changed'
export const SESSION_EXPIRED = 'codebridge:session-expired'
export const LEVELS = ROLES

const LEVEL_ORDER = Object.fromEntries(ROLES.map((role, index) => [role, index]))
export const atLeast = (user, level) => Boolean(user) && LEVEL_ORDER[user.role] >= LEVEL_ORDER[level]

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export function advanceSession() {
  sessionVersion += 1
}

// Routes whose calls count toward API consumption (see docs/api-usage.md).
const COUNTED = /^\/(questions|ai|answers|comments|activity|tags|categories|users|favorites)(?:[/?]|$)|^\/admin\/(users\/|flagged|hidden|categories|options)/
const isCounted = (path) => COUNTED.test(path)

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
      ? messages.client.timeout
      : messages.client.networkError)
  }
  if (version === sessionVersion && isCounted(path)) {
    window.dispatchEvent(new Event(USAGE_CHANGED))
  }
  if (response.status === 204) return undefined

  let data
  try {
    data = await response.json()
  } catch (error) {
    if (signal?.aborted) throw error
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new ApiError(messages.client.timeout)
    }
  }

  if (!response.ok) {
    if (response.status === 401 && session && version === sessionVersion) {
      window.dispatchEvent(new Event(SESSION_EXPIRED))
    }
    const message = response.status === 429 ? messages.client.rateLimited
      : response.status >= 500 ? messages.client.serviceUnavailable
      : data?.message || messages.client.requestFailed
    throw new ApiError(message, response.status)
  }
  if (!data || typeof data !== 'object') throw new ApiError(messages.client.unexpectedResponse)
  return data
}

async function readField(path, options, key, validate) {
  const result = (await request(path, options))?.[key]
  if (!validate(result)) throw new ApiError(messages.client.unexpectedResponse)
  return result
}

async function readData(path, options, validate = (data) => Boolean(data)) {
  const data = await request(path, options)
  if (!validate(data)) throw new ApiError(messages.client.unexpectedResponse)
  return data
}

const query = (params = {}) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, value)
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}
const enc = encodeURIComponent

export const auth = {
  me: (signal) => readField('/auth/me', { signal, session: false }, 'user', isUser),
  login: (body) => readField('/auth/login', { method: 'POST', body, session: false }, 'user', isUser),
  register: (body) => readField('/auth/register', { method: 'POST', body, session: false }, 'user', isUser),
  logout: () => request('/auth/logout', { method: 'POST', session: false }),
  updateProfile: (body) => readField('/auth/me', { method: 'PATCH', body }, 'user', isUser),
  changePassword: (body) => request('/auth/password', { method: 'POST', body }),
}

const questionPath = (id) => '/questions/' + enc(id)

export const questions = {
  list: (params = {}, signal) => readData('/questions' + query(params), { signal }, isPage('questions')),
  listHidden: (signal) => readData('/questions/hidden', { signal }, isPage('questions')),
  get: (id, signal) => readData(questionPath(id), { signal }, (data) => isQuestion(data?.question) &&
    Array.isArray(data.answers) && Array.isArray(data.comments)),
  create: (body) => readField('/questions', { method: 'POST', body }, 'question', isQuestion),
  update: (id, body) => readField(questionPath(id), { method: 'PATCH', body }, 'question', isQuestion),
  hide: (id) => request(`${questionPath(id)}/hide`, { method: 'POST' }),
  reshow: (id) => readField(`${questionPath(id)}/reshow`, { method: 'POST' }, 'question', isQuestion),
  remove: (id) => request(questionPath(id), { method: 'DELETE' }),
  vote: (id, vote) => readField(`${questionPath(id)}/vote`, { method: 'POST', body: { vote } }, 'question', isQuestion),
  flag: (id, on) => readField(`${questionPath(id)}/flag`, { method: on ? 'POST' : 'DELETE' }, 'question', isQuestion),
  clearFlags: (id) => readField(`${questionPath(id)}/flags`, { method: 'DELETE' }, 'question', isQuestion),
  favorite: (id, on) => readField(`${questionPath(id)}/favorite`, { method: on ? 'POST' : 'DELETE' }, 'question', isQuestion),
  close: (id, body) => readField(`${questionPath(id)}/close`, { method: 'POST', body }, 'question', isQuestion),
  reopen: (id) => readField(`${questionPath(id)}/reopen`, { method: 'POST' }, 'question', isQuestion),
  select: (id, answerId) => readData(`${questionPath(id)}/select`, { method: 'POST', body: { answer_id: answerId } }),
  answer: (id, body, format = '') => readField(`${questionPath(id)}/answers`, { method: 'POST', body: { body, format } }, 'answer', Boolean),
  comment: (id, body) => readField(`${questionPath(id)}/comments`, { method: 'POST', body: { body } }, 'comment', Boolean),
}

// Answers and comments share the same moderation endpoints.
function postApi(kind) {
  const path = (id) => `/${kind}s/${enc(id)}`
  const read = (url, options) => readField(url, options, kind, Boolean)
  return {
    update: (id, body, format = '') => read(path(id), { method: 'PATCH', body: { body, format } }),
    vote: (id, vote) => read(`${path(id)}/vote`, { method: 'POST', body: { vote } }),
    flag: (id, on) => read(`${path(id)}/flag`, { method: on ? 'POST' : 'DELETE' }),
    clearFlags: (id) => read(`${path(id)}/flags`, { method: 'DELETE' }),
    hide: (id) => read(`${path(id)}/hide`, { method: 'POST' }),
    reshow: (id) => read(`${path(id)}/reshow`, { method: 'POST' }),
    remove: (id) => request(path(id), { method: 'DELETE' }),
    comment: (id, body) => readField(`${path(id)}/comments`, { method: 'POST', body: { body } }, 'comment', Boolean),
  }
}
export const answers = postApi('answer')
export const comments = postApi('comment')

export const browse = {
  activity: (params, signal) => readData('/activity' + query(params), { signal }, isPage('questions')),
  tags: (params, signal) => readData('/tags' + query(params), { signal }, isPage('tags')),
  favoriteTag: (tag, on) => request(`/tags/${enc(tag)}/favorite`, { method: on ? 'POST' : 'DELETE' }),
  categories: (signal) => readField('/categories', { signal }, 'categories', Array.isArray),
  users: (params, signal) => readData('/users' + query(params), { signal }, isPage('users')),
  user: (handle, signal) => readField(`/users/${enc(handle)}`, { signal }, 'user', (user) => user && typeof user.handle === 'string'),
  userActivity: (handle, params, signal) => readData(`/users/${enc(handle)}/activity` + query(params), { signal }, isPage('questions')),
  userAnswers: (handle, params, signal) => readData(`/users/${enc(handle)}/answers` + query(params), { signal }, isPage('answers')),
  favoriteUser: (handle, on) => request(`/users/${enc(handle)}/favorite`, { method: on ? 'POST' : 'DELETE' }),
  favorites: (signal) => readData('/favorites', { signal }, (data) => Array.isArray(data?.questions)),
  site: (signal) => readField('/site', { signal, session: false }, 'site', (site) => site && typeof site.site_title === 'string'),
}

// Optional endpoints: a missing route degrades the page instead of failing it.
async function optional(path, options, validate) {
  try {
    const data = await request(path, options)
    if (!data || !validate(data)) throw new ApiError(messages.client.unexpectedResponse)
    return data
  } catch (error) {
    if ([404, 405, 501].includes(error.status)) return null
    throw error
  }
}

const isUsageRow = (row) => row && typeof row.method === 'string' &&
  typeof row.endpoint === 'string' && isCount(row.count)

export async function improveQuestion(question) {
  const signal = AbortSignal.timeout(130000) // Allow the backend to report its configured timeout first.
  try {
    const improved = await readField('/ai/improve-question', { method: 'POST', body: { question }, signal },
      'improvedQuestion', (value) => typeof value === 'string' && Boolean(value.trim()) && value.trim().length <= 4000)
    return improved.trim()
  } catch (error) {
    if (signal.aborted || error.status === 504) throw new ApiError(messages.ai.timeout, 504)
    if (error.status === 503) throw new ApiError(messages.ai.unavailable, 503)
    if (error.status === 502) throw new ApiError(messages.ai.invalidSuggestion, 502)
    throw error
  }
}

export function getUsage(signal) {
  return optional('/usage', { signal }, ({ totalUsage, freeAllowance, remainingCalls, limitExceeded, allowanceExhausted, breakdown }) =>
    isCount(totalUsage) && freeAllowance === 20 && isCount(remainingCalls) &&
    typeof limitExceeded === 'boolean' && typeof allowanceExhausted === 'boolean' &&
    (breakdown === undefined || (Array.isArray(breakdown) && breakdown.every(isUsageRow))))
}

export const admin = {
  counts: async (signal) => {
    const data = await request('/admin/dashboard', { signal })
    if (!isCount(data?.users) || !isCount(data?.admins)) {
      throw new ApiError(messages.client.unexpectedResponse)
    }
    return data
  },
  users: (signal) => optional('/admin/users', { signal }, ({ users }) =>
    Array.isArray(users) && users.every((user) => isUser(user) && (user.api_calls == null || isCount(user.api_calls)))),
  usage: (signal) => optional('/admin/usage', { signal }, ({ byUser, byEndpoint }) =>
    Array.isArray(byUser) && byUser.every((row) => row && typeof row.email === 'string' &&
      isCount(row.user_id) && isCount(row.count)) && Array.isArray(byEndpoint) &&
    byEndpoint.every(isUsageRow)),
  stats: (signal) => readField('/admin/stats', { signal }, 'stats', Boolean),
  updateUser: (id, body) => readField(`/admin/users/${enc(id)}`, { method: 'PATCH', body }, 'user', Boolean),
  flagged: (signal) => readData('/admin/flagged', { signal }, (data) => Array.isArray(data?.questions)),
  hidden: (signal) => readData('/admin/hidden', { signal }, (data) => Array.isArray(data?.questions)),
  createCategory: (body) => readField('/admin/categories', { method: 'POST', body }, 'category', Boolean),
  updateCategory: (id, body) => readField(`/admin/categories/${enc(id)}`, { method: 'PATCH', body }, 'category', Boolean),
  deleteCategory: (id) => request(`/admin/categories/${enc(id)}`, { method: 'DELETE' }),
  options: (signal) => readField('/admin/options', { signal }, 'options', Boolean),
  updateOptions: (body) => readField('/admin/options', { method: 'PATCH', body }, 'options', Boolean),
}

