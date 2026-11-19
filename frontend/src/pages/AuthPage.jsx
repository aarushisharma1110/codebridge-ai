import { useState } from 'react'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Layout'
import { Notice } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { auth } from '../services/api'
import messages from '../../../lang/message/en/messages.json'

const localPattern = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i
const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

function validate(email, password, confirmation, registering) {
  const [local, domain, extra] = email.split('@')
  const errors = {}
  if (!email) errors.email = messages.auth.emailRequired
  else if (email.length > 254 || local.length > 64 || extra !== undefined ||
      !localPattern.test(local) || !domain || !domainPattern.test(domain)) {
    errors.email = messages.auth.invalidEmail
  }
  if (!password) errors.password = messages.auth.passwordRequired
  else if (registering && [...password].length < 8) errors.password = messages.auth.passwordTooShort
  else if (new TextEncoder().encode(password).length > 72) errors.password = messages.auth.passwordTooLong
  if (registering && (!confirmation || password !== confirmation)) {
    errors.confirmation = confirmation ? messages.auth.passwordMismatch : messages.auth.confirmationRequired
  }
  return errors
}

export function AuthPage({ registering = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, expired, signedOut } = useAuth()
  const [email, setEmail] = useState(location.state?.email || '')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const checked = validate(email.trim(), password, confirmation, registering)
    setErrors(checked)
    setError('')
    if (Object.keys(checked).length) {
      form.elements.namedItem(Object.keys(checked)[0])?.focus()
      return
    }

    setBusy(true)
    try {
      const credentials = { email: email.trim(), password }
      if (registering) {
        await auth.register(credentials)
        navigate('/login', { replace: true, state: { registered: true, email: credentials.email } })
      } else {
        await login(credentials)
      }
    } catch (failure) {
      setError(failure.message)
      setBusy(false)
    }
  }

  const contextual = location.state?.registered ? messages.auth.registered
    : signedOut && !registering ? messages.auth.signedOut
      : expired && !registering ? messages.auth.sessionEnded : ''

  return <div className="auth-shell">
    <header className="auth-header"><Brand /></header>
    <main className="auth-main" tabIndex={-1}>
      <div className="panel auth-card">
        <div className="eyebrow">{messages.auth.workspace}</div>
        <h1>{registering ? messages.auth.createAnAccount : messages.auth.welcome}</h1>
        <p className="auth-description">{registering ? messages.auth.registerDescription : messages.auth.loginDescription}</p>
        {error ? <Notice kind="error">{error}</Notice> : contextual && <Notice>{contextual}</Notice>}
        <form className="form-stack" noValidate onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">{messages.auth.emailAddress}</label>
            <input id="email" name="email" type="email" autoComplete="email" required value={email}
              disabled={busy} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined}
              onChange={(event) => setEmail(event.target.value)} placeholder={messages.auth.emailPlaceholder} />
            {errors.email && <span id="email-error" className="field-error">{errors.email}</span>}
          </div>
          <div className="field">
            <label htmlFor="password">{messages.auth.password}</label>
            <div className="password-control">
              <input id="password" name="password" type={visible ? 'text' : 'password'} required value={password}
                autoComplete={registering ? 'new-password' : 'current-password'} disabled={busy}
                aria-invalid={Boolean(errors.password)} aria-describedby="password-help"
                onChange={(event) => setPassword(event.target.value)} />
              <button type="button" className="icon-button" aria-label={visible ? messages.auth.hidePassword : messages.auth.showPassword}
                onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button>
            </div>
            <span id="password-help" className={errors.password ? 'field-error' : 'hint'}>
              {errors.password || (registering ? messages.auth.passwordHint : '')}
            </span>
          </div>
          {registering && <div className="field">
            <label htmlFor="confirmation">{messages.auth.confirmPassword}</label>
            <input id="confirmation" name="confirmation" type={visible ? 'text' : 'password'} required value={confirmation}
              autoComplete="new-password" disabled={busy} aria-invalid={Boolean(errors.confirmation)}
              aria-describedby={errors.confirmation ? 'confirmation-error' : undefined}
              onChange={(event) => setConfirmation(event.target.value)} />
            {errors.confirmation && <span className="field-error" id="confirmation-error">{errors.confirmation}</span>}
          </div>}
          <button className="button primary" disabled={busy}>
            {busy ? (registering ? messages.auth.creatingAccount : messages.auth.loggingIn) : (registering ? messages.auth.createAccount : messages.auth.logIn)}
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </form>
        <p className="auth-switch">{registering ? messages.auth.existingAccount : messages.auth.newAccount}{' '}
          <Link to={registering ? '/login' : '/register'}>{registering ? messages.auth.logIn : messages.auth.createAnAccount}</Link>
        </p>
      </div>
    </main>
  </div>
}
