import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Notice, Heading } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { auth } from '../services/api'
import messages from '../../../lang/message/en/messages.json'

const m = messages.q2a
const localPattern = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i
const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i
const handlePattern = /^[A-Za-z0-9_.-]{2,20}$/

export const validPasswordLength = (password) =>
  [...password].length >= 8 && new TextEncoder().encode(password).length <= 72

function emailError(email) {
  const [local, domain, extra] = email.split('@')
  if (!email) return messages.auth.emailRequired
  if (email.length > 254 || local.length > 64 || extra !== undefined ||
      !localPattern.test(local) || !domain || !domainPattern.test(domain)) return messages.auth.invalidEmail
  return ''
}

function validate({ handle, email, password }, registering) {
  const errors = {}
  if (registering) {
    if (!handlePattern.test(handle)) errors.handle = m.auth.handleError
    const invalid = emailError(email)
    if (invalid) errors.email = invalid
  } else if (!email) errors.email = m.auth.identifierRequired
  if (!password) errors.password = messages.auth.passwordRequired
  else if (registering && [...password].length < 8) errors.password = messages.auth.passwordTooShort
  else if (new TextEncoder().encode(password).length > 72) errors.password = messages.auth.passwordTooLong
  return errors
}

function Field({ id, label, note, error, ...props }) {
  return <tr><td>
    <label className="qa-form-tall-label" htmlFor={id}>{label}</label>
    <div className="qa-form-tall-data">
      <input id={id} name={id} className="qa-form-tall-text" aria-invalid={Boolean(error)}
        aria-describedby={`${id}-help`} {...props} />
      {error ? <span className="qa-form-tall-error" id={`${id}-help`}>{error}</span>
        : note && <span className="qa-form-tall-note" id={`${id}-help`}>{note}</span>}
    </div>
  </td></tr>
}

export function AuthPage({ registering = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, expired, signedOut } = useAuth()
  const [form, setForm] = useState({ handle: '', email: location.state?.email || '', password: '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (name) => (event) => setForm({ ...form, [name]: event.target.value })

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const values = { handle: form.handle.trim(), email: form.email.trim(), password: form.password }
    const checked = validate(values, registering)
    setErrors(checked)
    setError('')
    if (Object.keys(checked).length) {
      event.currentTarget.elements.namedItem(Object.keys(checked)[0])?.focus()
      return
    }
    setBusy(true)
    try {
      if (registering) {
        await auth.register(values)
        navigate('/login', { replace: true, state: { registered: true, email: values.handle } })
      } else {
        await login({ email: values.email, password: values.password })
      }
    } catch (failure) {
      setError(failure.message)
      setBusy(false)
    }
  }

  return <>
    <Heading>{registering ? m.headings.register : m.headings.login}</Heading>
    {location.state?.registered && !registering && <Notice kind="success">{m.auth.registered}</Notice>}
    {expired && !registering && <Notice kind="warning">{messages.auth.sessionEnded}</Notice>}
    {signedOut && !registering && !location.state?.registered && <Notice kind="success">{messages.auth.signedOut}</Notice>}
    {!expired && !signedOut && !location.state?.registered && location.state?.from && <Notice kind="warning">{m.misc.loginRequired}</Notice>}
    <form className="qa-part-form" onSubmit={submit} noValidate>
      {error && <Notice kind="error">{error}</Notice>}
      <table className="qa-form-tall-table"><tbody>
        {registering && <Field id="handle" label={m.auth.handle} note={m.auth.handleHelp} error={errors.handle}
          value={form.handle} onChange={set('handle')} autoComplete="username" maxLength={20} />}
        <Field id="email" label={registering ? m.auth.email : m.auth.identifier} note={registering ? m.auth.emailHelp : null}
          error={errors.email} value={form.email} onChange={set('email')}
          autoComplete={registering ? 'email' : 'username'} type={registering ? 'email' : 'text'} />
        <Field id="password" label={m.auth.password} note={registering ? m.auth.passwordHelp : null} error={errors.password}
          value={form.password} onChange={set('password')} type="password"
          autoComplete={registering ? 'new-password' : 'current-password'} />
      </tbody></table>
      <div className="qa-form-tall-buttons">
        <button className="qa-form-tall-button qa-form-tall-button-login" disabled={busy}>
          {registering ? (busy ? m.auth.registering : m.auth.registerButton) : (busy ? m.auth.loggingIn : m.auth.loginButton)}
        </button>
      </div>
      <p className="qa-form-tall-note" style={{ marginTop: 10 }}>
        <Link to={registering ? '/login' : '/register'}>{registering ? m.auth.toLogin : m.auth.toRegister}</Link>
      </p>
    </form>
  </>
}
