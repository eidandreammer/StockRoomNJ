import { useEffect, useMemo, useRef, useState } from 'react'
import { DateTime } from 'luxon'
import QRCode from 'qrcode'
import {
  browserLocalPersistence,
  getMultiFactorResolver,
  inMemoryPersistence,
  multiFactor,
  onAuthStateChanged,
  sendEmailVerification,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  TotpMultiFactorGenerator,
} from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { auth, db, isFirebaseConfigured, isUsingFirebaseEmulators } from './firebase'
import { getFriendlyErrorMessage } from './friendlyErrors'
import AdminBids from './AdminBids'
import AdminLegalDocuments from './AdminLegalDocuments'
import AdminProducts from './AdminProducts'
import {
  GOODS_OPTIONS,
  STORE_TIME_ZONE,
  WEEKDAY_OPTIONS,
  expandRecurringOccurrences,
  formatOccurrenceLabel,
  recurrenceSignature,
  toDate,
} from './events/eventModel'

const now = () => DateTime.now().setZone(STORE_TIME_ZONE)

const AUTH_APP_NAME = 'StockRoom NJ Admin'
const TOTP_DISPLAY_NAME = 'Authenticator app'
const RECAPTCHA_SCRIPT_ID = 'stockroom-recaptcha-script'
const RECAPTCHA_SCRIPT_SRC = 'https://www.google.com/recaptcha/api.js?render=explicit'
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY?.trim()
const LOCALHOST_NAMES = new Set(['localhost', '::1', '[::1]'])
const isLocalhost = LOCALHOST_NAMES.has(globalThis.location?.hostname) ||
  /^127(?:\.\d{1,3}){3}$/.test(globalThis.location?.hostname ?? '')
const RECAPTCHA_DISABLED = import.meta.env.VITE_DISABLE_RECAPTCHA === 'true' || isLocalhost

let recaptchaScriptPromise = null

function loadRecaptchaScript() {
  if (globalThis.grecaptcha?.render) {
    return Promise.resolve(globalThis.grecaptcha)
  }

  if (recaptchaScriptPromise) {
    return recaptchaScriptPromise
  }

  recaptchaScriptPromise = new Promise((resolve, reject) => {
    const resolveReady = () => {
      if (!globalThis.grecaptcha?.ready) {
        reject(new Error('reCAPTCHA did not initialize. Refresh the page and try again.'))
        return
      }

      globalThis.grecaptcha.ready(() => resolve(globalThis.grecaptcha))
    }

    const existingScript = document.getElementById(RECAPTCHA_SCRIPT_ID)

    if (existingScript) {
      existingScript.addEventListener('load', resolveReady, { once: true })
      existingScript.addEventListener('error', () => reject(new Error('Could not load reCAPTCHA.')), {
        once: true,
      })
      return
    }

    const script = document.createElement('script')
    script.id = RECAPTCHA_SCRIPT_ID
    script.src = RECAPTCHA_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = resolveReady
    script.onerror = () => {
      recaptchaScriptPromise = null
      reject(new Error('Could not load reCAPTCHA. Check the site key domain settings.'))
    }

    document.head.appendChild(script)
  })

  return recaptchaScriptPromise
}

function hasTotpFactor(user) {
  return multiFactor(user).enrolledFactors.some(
    (factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID,
  )
}

function getTotpHint(resolver) {
  return resolver.hints.find((hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID)
}

const handleSignOut = async () => {
  if (auth && auth.currentUser) {
    const uid = auth.currentUser.uid
    localStorage.removeItem('mfa_remember_' + uid)
    localStorage.removeItem('mfa_verified_at_' + uid)
    localStorage.removeItem('admin_mfa_remember')
    sessionStorage.removeItem('mfa_verified_session_' + uid)
  }
  await signOut(auth)
}

function formatAuthError(error) {
  return getFriendlyErrorMessage(error, 'admin')
}

function formatTotpSetupError(error) {
  if (isUsingFirebaseEmulators && (error?.message?.includes('Missing phoneEnrollmentInfo') || error?.code === 'auth/invalid-argument')) {
    return 'Two-step authentication (TOTP MFA) is not supported by the Firebase Auth Emulator. Bypassing is required for local development.'
  }

  return getFriendlyErrorMessage(error, 'admin')
}

function dateInput(value) {
  return value ? DateTime.fromJSDate(toDate(value), { zone: STORE_TIME_ZONE }).toFormat('yyyy-LL-dd') : ''
}

function dateTimeInput(value) {
  return value
    ? DateTime.fromJSDate(toDate(value), { zone: STORE_TIME_ZONE }).toFormat("yyyy-LL-dd'T'HH:mm")
    : ''
}

function defaultForm() {
  const start = now().plus({ hours: 1 }).startOf('hour')

  return {
    title: '',
    venueName: '',
    address: '',
    description: '',
    goodsCategories: [],
    goodsNotes: '',
    kind: 'single',
    allDay: false,
    start: start.toFormat("yyyy-LL-dd'T'HH:mm"),
    end: start.plus({ hours: 3 }).toFormat("yyyy-LL-dd'T'HH:mm"),
    frequency: 'weekly',
    interval: 1,
    weekdays: [start.weekday],
    until: start.plus({ months: 3 }).toFormat('yyyy-LL-dd'),
  }
}

function recordToForm(record) {
  if (!record) {
    return defaultForm()
  }

  const { schedule } = record
  const inclusiveAllDayEnd = schedule.allDay
    ? DateTime.fromJSDate(toDate(schedule.end), { zone: STORE_TIME_ZONE }).minus({ days: 1 }).toJSDate()
    : schedule.end

  return {
    title: record.title ?? '',
    venueName: record.venueName ?? '',
    address: record.address ?? '',
    description: record.description ?? '',
    goodsCategories: record.goodsCategories ?? [],
    goodsNotes: record.goodsNotes ?? '',
    kind: schedule.kind ?? 'single',
    allDay: Boolean(schedule.allDay),
    start: schedule.allDay ? dateInput(schedule.start) : dateTimeInput(schedule.start),
    end: schedule.allDay ? dateInput(inclusiveAllDayEnd) : dateTimeInput(schedule.end),
    frequency: schedule.frequency ?? 'weekly',
    interval: Number(schedule.interval) || 1,
    weekdays: (schedule.weekdays ?? []).map(Number),
    until: dateInput(schedule.until),
  }
}

function parseLocal(value, allDay) {
  return DateTime.fromISO(value, { zone: STORE_TIME_ZONE })[allDay ? 'startOf' : 'toUTC'](
    allDay ? 'day' : undefined,
  )
}

function formToPayload(form) {
  const start = parseLocal(form.start, form.allDay)
  const selectedEnd = parseLocal(form.end, form.allDay)
  const end = form.allDay ? selectedEnd.plus({ days: 1 }) : selectedEnd
  const until =
    form.kind === 'recurring'
      ? DateTime.fromISO(form.until, { zone: STORE_TIME_ZONE }).endOf('day')
      : null

  return {
    title: form.title.trim(),
    venueName: form.venueName.trim(),
    address: form.address.trim(),
    description: form.description.trim(),
    goodsCategories: form.goodsCategories,
    goodsNotes: form.goodsNotes.trim(),
    schedule: {
      kind: form.kind,
      allDay: form.allDay,
      start: start.toJSDate(),
      end: end.toJSDate(),
      frequency: form.kind === 'recurring' ? form.frequency : null,
      interval: form.kind === 'recurring' ? Number(form.interval) || 1 : null,
      weekdays: form.kind === 'recurring' && form.frequency === 'weekly' ? form.weekdays : [],
      until: until?.toJSDate() ?? null,
    },
  }
}

function switchAllDay(form, allDay) {
  if (allDay) {
    return {
      ...form,
      allDay,
      start: form.start.slice(0, 10),
      end: form.end.slice(0, 10),
    }
  }

  return {
    ...form,
    allDay,
    start: `${form.start.slice(0, 10)}T09:00`,
    end: `${form.end.slice(0, 10)}T17:00`,
  }
}

function validateForm(form) {
  if (!form.title.trim() || !form.venueName.trim() || !form.address.trim()) {
    return 'Add a title, venue, and address.'
  }

  if (form.goodsCategories.length === 0) {
    return 'Select at least one goods category.'
  }

  const payload = formToPayload(form)

  if (!toDate(payload.schedule.start) || !toDate(payload.schedule.end)) {
    return 'Add a valid start and end.'
  }

  if (toDate(payload.schedule.end) <= toDate(payload.schedule.start)) {
    return 'The end must come after the start.'
  }

  if (form.kind === 'recurring' && !form.until) {
    return 'Add an end date for the recurring series.'
  }

  if (form.kind === 'recurring' && form.frequency === 'weekly' && form.weekdays.length === 0) {
    return 'Choose at least one weekday for a weekly series.'
  }

  return ''
}

function CheckboxGroup({ values, onChange }) {
  const toggle = (value) => {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value])
  }

  return (
    <div className="admin-check-grid">
      {GOODS_OPTIONS.map((option) => (
        <label key={option.value}>
          <input
            checked={values.includes(option.value)}
            type="checkbox"
            onChange={() => toggle(option.value)}
          />
          {option.label}
        </label>
      ))}
    </div>
  )
}

function EventEditor({ isSaving, record, onCancel, onSave }) {
  const [form, setForm] = useState(() => recordToForm(record))
  const [error, setError] = useState('')

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const toggleWeekday = (weekday) => {
    update(
      'weekdays',
      form.weekdays.includes(weekday)
        ? form.weekdays.filter((item) => item !== weekday)
        : [...form.weekdays, weekday],
    )
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const nextError = validateForm(form)

    if (nextError) {
      setError(nextError)
      return
    }

    onSave(formToPayload(form))
  }

  return (
    <form className="admin-editor" onSubmit={handleSubmit}>
      <div className="admin-panel-head">
        <div>
          <p className="admin-kicker">{record ? 'Edit event' : 'New event'}</p>
          <h2>{record?.title ?? 'Create a calendar event'}</h2>
        </div>
        <button className="admin-button is-secondary" type="button" onClick={onCancel}>
          Close
        </button>
      </div>

      {error && <p className="admin-alert is-error">{error}</p>}

      <div className="admin-form-grid">
        <label className="is-wide">
          <span>Event title</span>
          <input required value={form.title} onChange={(event) => update('title', event.target.value)} />
        </label>
        <label>
          <span>Venue</span>
          <input
            required
            value={form.venueName}
            onChange={(event) => update('venueName', event.target.value)}
          />
        </label>
        <label>
          <span>Address</span>
          <input
            required
            value={form.address}
            onChange={(event) => update('address', event.target.value)}
          />
        </label>
        <label className="is-wide">
          <span>Description</span>
          <textarea
            rows="3"
            value={form.description}
            onChange={(event) => update('description', event.target.value)}
          />
        </label>
      </div>

      <fieldset>
        <legend>What are you bringing?</legend>
        <CheckboxGroup
          values={form.goodsCategories}
          onChange={(values) => update('goodsCategories', values)}
        />
        <label className="admin-stack">
          <span>Goods notes</span>
          <textarea
            rows="2"
            value={form.goodsNotes}
            onChange={(event) => update('goodsNotes', event.target.value)}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>Schedule</legend>
        <div className="admin-inline-options">
          <label>
            <input
              checked={form.kind === 'single'}
              name="kind"
              type="radio"
              onChange={() => update('kind', 'single')}
            />
            One-time
          </label>
          <label>
            <input
              checked={form.kind === 'recurring'}
              name="kind"
              type="radio"
              onChange={() => update('kind', 'recurring')}
            />
            Repeating
          </label>
          <label>
            <input
              checked={form.allDay}
              type="checkbox"
              onChange={(event) => setForm((current) => switchAllDay(current, event.target.checked))}
            />
            All day
          </label>
        </div>

        <div className="admin-form-grid">
          <label>
            <span>Start</span>
            <input
              required
              type={form.allDay ? 'date' : 'datetime-local'}
              value={form.start}
              onChange={(event) => update('start', event.target.value)}
            />
          </label>
          <label>
            <span>End</span>
            <input
              required
              type={form.allDay ? 'date' : 'datetime-local'}
              value={form.end}
              onChange={(event) => update('end', event.target.value)}
            />
          </label>
        </div>

        {form.kind === 'recurring' && (
          <div className="admin-recurrence">
            <div className="admin-form-grid">
              <label>
                <span>Repeats</span>
                <select value={form.frequency} onChange={(event) => update('frequency', event.target.value)}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
              <label>
                <span>Every</span>
                <input
                  min="1"
                  required
                  type="number"
                  value={form.interval}
                  onChange={(event) => update('interval', event.target.value)}
                />
              </label>
              <label>
                <span>Series ends</span>
                <input required type="date" value={form.until} onChange={(event) => update('until', event.target.value)} />
              </label>
            </div>

            {form.frequency === 'weekly' && (
              <div className="admin-weekdays">
                {WEEKDAY_OPTIONS.map((weekday) => (
                  <label key={weekday.value}>
                    <input
                      checked={form.weekdays.includes(weekday.value)}
                      type="checkbox"
                      onChange={() => toggleWeekday(weekday.value)}
                    />
                    {weekday.short}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </fieldset>

      <button className="admin-button" disabled={isSaving} type="submit">
        {isSaving ? 'Saving...' : record ? 'Save changes' : 'Save draft'}
      </button>
    </form>
  )
}

function OccurrenceEditor({ occurrence, onCancel, onSave }) {
  const [form, setForm] = useState(() => {
    const details = occurrence.details
    const inclusiveEnd = occurrence.allDay
      ? DateTime.fromJSDate(occurrence.end, { zone: STORE_TIME_ZONE }).minus({ days: 1 }).toJSDate()
      : occurrence.end

    return {
      title: details.title,
      venueName: details.venueName,
      address: details.address,
      description: details.description ?? '',
      goodsCategories: details.goodsCategories ?? [],
      goodsNotes: details.goodsNotes ?? '',
      allDay: occurrence.allDay,
      start: occurrence.allDay ? dateInput(occurrence.start) : dateTimeInput(occurrence.start),
      end: occurrence.allDay ? dateInput(inclusiveEnd) : dateTimeInput(occurrence.end),
    }
  })

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const handleSubmit = (event) => {
    event.preventDefault()
    const start = parseLocal(form.start, form.allDay)
    const selectedEnd = parseLocal(form.end, form.allDay)
    const end = form.allDay ? selectedEnd.plus({ days: 1 }) : selectedEnd

    if (!start.isValid || !end.isValid || end <= start) {
      return
    }

    onSave({
      title: form.title.trim(),
      venueName: form.venueName.trim(),
      address: form.address.trim(),
      description: form.description.trim(),
      goodsCategories: form.goodsCategories,
      goodsNotes: form.goodsNotes.trim(),
      allDay: form.allDay,
      start: start.toJSDate(),
      end: end.toJSDate(),
    })
  }

  return (
    <form className="occurrence-editor" onSubmit={handleSubmit}>
      <h3>Edit this occurrence</h3>
      <div className="admin-form-grid">
        <label><span>Title</span><input required value={form.title} onChange={(event) => update('title', event.target.value)} /></label>
        <label><span>Venue</span><input required value={form.venueName} onChange={(event) => update('venueName', event.target.value)} /></label>
        <label className="is-wide"><span>Address</span><input required value={form.address} onChange={(event) => update('address', event.target.value)} /></label>
        <label><span>Start</span><input required type={form.allDay ? 'date' : 'datetime-local'} value={form.start} onChange={(event) => update('start', event.target.value)} /></label>
        <label><span>End</span><input required type={form.allDay ? 'date' : 'datetime-local'} value={form.end} onChange={(event) => update('end', event.target.value)} /></label>
        <label className="admin-checkbox"><input checked={form.allDay} type="checkbox" onChange={(event) => setForm((current) => switchAllDay(current, event.target.checked))} />All day</label>
        <label className="is-wide"><span>Description</span><textarea rows="2" value={form.description} onChange={(event) => update('description', event.target.value)} /></label>
      </div>
      <CheckboxGroup values={form.goodsCategories} onChange={(values) => update('goodsCategories', values)} />
      <label className="admin-stack"><span>Goods notes</span><textarea rows="2" value={form.goodsNotes} onChange={(event) => update('goodsNotes', event.target.value)} /></label>
      <div className="admin-row">
        <button className="admin-button" type="submit">Save occurrence</button>
        <button className="admin-button is-secondary" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function OccurrenceManager({ record, onClose, onUpdate }) {
  const [editing, setEditing] = useState(null)
  const occurrences = useMemo(() => expandRecurringOccurrences(record), [record])
  const exceptions = record.exceptions ?? []

  const saveExceptions = (nextExceptions) => onUpdate(record.id, { exceptions: nextExceptions })
  const upsertException = (occurrence, nextException) => {
    saveExceptions([
      ...exceptions.filter((exception) => exception.originalStart !== occurrence.originalStart),
      { originalStart: occurrence.originalStart, ...nextException },
    ])
  }

  return (
    <section className="admin-panel occurrence-manager">
      <div className="admin-panel-head">
        <div>
          <p className="admin-kicker">Recurring dates</p>
          <h2>{record.title}</h2>
        </div>
        <button className="admin-button is-secondary" type="button" onClick={onClose}>Close</button>
      </div>

      <p className="admin-muted">
        Edit or cancel one date without changing the full series. Up to 500 dates are shown.
      </p>

      {editing && (
        <OccurrenceEditor
          key={editing.originalStart}
          occurrence={editing}
          onCancel={() => setEditing(null)}
          onSave={(override) => {
            upsertException(editing, { action: 'override', override })
            setEditing(null)
          }}
        />
      )}

      <div className="occurrence-list">
        {occurrences.map((occurrence) => (
          <article className={`occurrence-item is-${occurrence.action}`} key={occurrence.originalStart}>
            <div>
              <strong>{formatOccurrenceLabel(occurrence.start, occurrence.end, occurrence.allDay)}</strong>
              <span>{occurrence.action === 'scheduled' ? 'Scheduled' : occurrence.action}</span>
            </div>
            <div className="admin-row">
              {occurrence.action !== 'cancelled' && (
                <>
                  <button className="admin-text-button" type="button" onClick={() => setEditing(occurrence)}>Edit date</button>
                  <button className="admin-text-button is-danger" type="button" onClick={() => upsertException(occurrence, { action: 'cancelled' })}>Cancel date</button>
                </>
              )}
              {occurrence.action !== 'scheduled' && (
                <button
                  className="admin-text-button"
                  type="button"
                  onClick={() => saveExceptions(exceptions.filter((exception) => exception.originalStart !== occurrence.originalStart))}
                >
                  Restore
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function TotpEnrollment({ user, onComplete }) {
  const [status, setStatus] = useState(user?.emailVerified ? 'loading' : 'email-unverified')
  const [totpSecret, setTotpSecret] = useState(null)
  const [qrCode, setQrCode] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!user?.emailVerified) {
      return undefined
    }

    let isActive = true

    async function prepareTotp() {
      if (isUsingFirebaseEmulators) {
        if (isActive) {
          setError('Two-step authentication (TOTP MFA) is not supported by the Firebase Auth Emulator. Bypassing is required for local development.')
          setStatus('error')
        }
        return
      }

      setStatus('loading')
      setError('')

      try {
        const multiFactorSession = await multiFactor(user).getSession()
        const nextTotpSecret = await TotpMultiFactorGenerator.generateSecret(multiFactorSession)
        const qrCodeUrl = nextTotpSecret.generateQrCodeUrl(user.email ?? user.uid, AUTH_APP_NAME)
        const nextQrCode = await QRCode.toDataURL(qrCodeUrl, { margin: 1, width: 232 })

        if (isActive) {
          setTotpSecret(nextTotpSecret)
          setQrCode(nextQrCode)
          setStatus('ready')
        }
      } catch (setupError) {
        if (isActive) {
          setError(formatTotpSetupError(setupError))
          setStatus('error')
        }
      }
    }

    prepareTotp()

    return () => {
      isActive = false
    }
  }, [user])

  const sendVerificationEmail = async () => {
    setError('')
    setNotice('')
    setIsSendingEmail(true)

    try {
      await sendEmailVerification(user)
      setNotice('Verification email sent. Open it, then sign out and sign back in to continue.')
    } catch (sendError) {
      setError(sendError.message ?? 'Could not send the verification email.')
    } finally {
      setIsSendingEmail(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const verificationCode = code.trim()

    if (!/^\d{6}$/.test(verificationCode)) {
      setError('Enter the 6-digit code from your authenticator app.')
      return
    }

    if (!totpSecret) {
      setError('The authenticator setup is not ready yet.')
      return
    }

    setError('')
    setIsSaving(true)

    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
        totpSecret,
        verificationCode,
      )
      await multiFactor(user).enroll(assertion, TOTP_DISPLAY_NAME)
      localStorage.setItem('mfa_verified_at_' + user.uid, Date.now().toString())
      localStorage.setItem('mfa_remember_' + user.uid, 'true')
      sessionStorage.setItem('mfa_verified_session_' + user.uid, 'true')
      localStorage.setItem('admin_mfa_remember', 'true')
      onComplete()
    } catch (enrollError) {
      setError(formatTotpSetupError(enrollError))
    } finally {
      setIsSaving(false)
    }
  }

  if (status === 'email-unverified') {
    return (
      <main className="admin-state">
        <h1>Verify this admin email</h1>
        <p>Firebase requires a verified email before two-step authentication can be enabled.</p>
        <p>Signed-in email: <code>{user?.email}</code></p>
        {notice && <p className="admin-alert">{notice}</p>}
        {error && <p className="admin-alert is-error">{error}</p>}
        <div className="admin-row">
          <button className="admin-button" disabled={isSendingEmail} type="button" onClick={sendVerificationEmail}>
            {isSendingEmail ? 'Sending...' : 'Send verification email'}
          </button>
          <button className="admin-button is-secondary" type="button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </main>
    )
  }

  if (status === 'loading') {
    return <main className="admin-state"><p>Preparing two-step authentication...</p></main>
  }

  if (status === 'error') {
    return (
      <main className="admin-state">
        <h1>Two-step setup failed</h1>
        {error && <p className="admin-alert is-error">{error}</p>}
        <button className="admin-button" type="button" onClick={handleSignOut}>Sign out</button>
      </main>
    )
  }

  return (
    <main className="admin-auth-shell">
      <form className="admin-auth-card is-wide-auth" onSubmit={handleSubmit}>
        <p className="admin-kicker">Required security setup</p>
        <h1>Enable two-step authentication</h1>
        <p>Scan this QR code with Google Authenticator, Authy, Microsoft Authenticator, or another TOTP app.</p>
        {error && <p className="admin-alert is-error">{error}</p>}
        <div className="admin-totp-setup">
          {qrCode && <img alt="Authenticator app QR code" src={qrCode} />}
          <div>
            <span>Manual setup key</span>
            <code>{totpSecret?.secretKey}</code>
          </div>
        </div>
        <label>
          <span>6-digit code</span>
          <input
            required
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength="6"
            pattern="[0-9]{6}"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        </label>
        <div className="admin-row">
          <button className="admin-button" disabled={isSaving} type="submit">
            {isSaving ? 'Verifying...' : 'Enable 2FA'}
          </button>
          <button className="admin-button is-secondary" type="button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </form>
    </main>
  )
}

function RecaptchaGate({ onVerified }) {
  const containerRef = useRef(null)
  const widgetIdRef = useRef(null)
  const [status, setStatus] = useState(RECAPTCHA_SITE_KEY ? 'loading' : 'missing')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!RECAPTCHA_SITE_KEY) {
      return undefined
    }

    let isActive = true

    async function renderRecaptcha() {
      setStatus('loading')
      setError('')

      try {
        const grecaptcha = await loadRecaptchaScript()

        if (!isActive || !containerRef.current || widgetIdRef.current !== null) {
          return
        }

        widgetIdRef.current = grecaptcha.render(containerRef.current, {
          sitekey: RECAPTCHA_SITE_KEY,
          callback: (token) => {
            if (!token || !isActive) {
              return
            }

            setStatus('verified')
            onVerified()
          },
          'expired-callback': () => {
            if (!isActive) {
              return
            }

            setStatus('expired')
            setError('The reCAPTCHA check expired. Complete it again to continue.')
          },
          'error-callback': () => {
            if (!isActive) {
              return
            }

            setStatus('error')
            setError('reCAPTCHA could not verify this browser. Refresh the page and try again.')
          },
        })
        setStatus('ready')
      } catch (recaptchaError) {
        if (!isActive) {
          return
        }

        setStatus('error')
        setError(recaptchaError.message ?? 'Could not load reCAPTCHA.')
      }
    }

    renderRecaptcha()

    return () => {
      isActive = false

      if (widgetIdRef.current !== null && globalThis.grecaptcha?.reset) {
        try {
          globalThis.grecaptcha.reset(widgetIdRef.current)
        } catch {
          // Google owns the iframe lifecycle; unmount should not block React cleanup.
        }
      }

      widgetIdRef.current = null
    }
  }, [onVerified])

  if (status === 'missing') {
    return (
      <main className="admin-auth-shell">
        <section className="admin-auth-card">
          <p className="admin-kicker">StockRoom NJ</p>
          <h1>reCAPTCHA setup required</h1>
          <p>Add <code>VITE_RECAPTCHA_SITE_KEY</code> to the Vite environment variables before showing the dashboard login.</p>
          <a href="./">Back to storefront</a>
        </section>
      </main>
    )
  }

  return (
    <main className="admin-auth-shell">
      <section className="admin-auth-card" aria-live="polite">
        <p className="admin-kicker">StockRoom NJ</p>
        <h1>Security check</h1>
        <p>Complete reCAPTCHA to continue to the admin sign-in.</p>
        {error && <p className="admin-alert is-error">{error}</p>}
        <div className="admin-recaptcha-widget" ref={containerRef} />
        {status === 'loading' && <p className="admin-muted">Loading reCAPTCHA...</p>}
        {status === 'verified' && <p className="admin-muted">Verification complete.</p>}
        <a href="./">Back to storefront</a>
      </section>
    </main>
  )
}

function Login() {
  const [isRecaptchaVerified, setIsRecaptchaVerified] = useState(RECAPTCHA_DISABLED)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaResolver, setMfaResolver] = useState(null)
  const [mfaCode, setMfaCode] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [rememberMfa, setRememberMfa] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      if (rememberMfa) {
        await setPersistence(auth, browserLocalPersistence)
        localStorage.setItem('admin_mfa_remember', 'true')
      } else {
        await setPersistence(auth, inMemoryPersistence)
        localStorage.removeItem('admin_mfa_remember')
      }
      await signInWithEmailAndPassword(auth, email, password)
    } catch (signInError) {
      if (signInError?.code === 'auth/multi-factor-auth-required') {
        const resolver = getMultiFactorResolver(auth, signInError)

        if (!getTotpHint(resolver)) {
          setError('This dashboard only supports authenticator app verification.')
          setIsSubmitting(false)
          return
        }

        setMfaResolver(resolver)
        setMfaCode('')
        setIsSubmitting(false)
        return
      }

      setError(formatAuthError(signInError))
      setIsSubmitting(false)
    }
  }

  const handleTotpSubmit = async (event) => {
    event.preventDefault()
    const verificationCode = mfaCode.trim()

    if (!/^\d{6}$/.test(verificationCode)) {
      setError('Enter the 6-digit code from your authenticator app.')
      return
    }

    const totpHint = getTotpHint(mfaResolver)

    if (!totpHint) {
      setError('This dashboard only supports authenticator app verification.')
      return
    }

    setError('')
    setIsSubmitting(true)

    try {
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(totpHint.uid, verificationCode)
      const userCredential = await mfaResolver.resolveSignIn(assertion)
      const user = userCredential.user

      if (rememberMfa) {
        localStorage.setItem('mfa_remember_' + user.uid, 'true')
        localStorage.setItem('mfa_verified_at_' + user.uid, Date.now().toString())
      } else {
        localStorage.removeItem('mfa_remember_' + user.uid)
        localStorage.removeItem('mfa_verified_at_' + user.uid)
      }
      sessionStorage.setItem('mfa_verified_session_' + user.uid, 'true')
    } catch (totpError) {
      setError(formatAuthError(totpError))
      setIsSubmitting(false)
    }
  }

  if (!isRecaptchaVerified) {
    return <RecaptchaGate onVerified={() => setIsRecaptchaVerified(true)} />
  }

  if (mfaResolver) {
    return (
      <main className="admin-auth-shell">
        <form className="admin-auth-card" onSubmit={handleTotpSubmit}>
          <p className="admin-kicker">StockRoom NJ</p>
          <h1>Two-step verification</h1>
          <p>Enter the current 6-digit code from your authenticator app.</p>
          {error && <p className="admin-alert is-error">{error}</p>}
          <label>
            <span>6-digit code</span>
            <input
              required
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength="6"
              pattern="[0-9]{6}"
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </label>
          <div className="admin-row">
            <button className="admin-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Verifying...' : 'Verify'}
            </button>
            <button
              className="admin-button is-secondary"
              disabled={isSubmitting}
              type="button"
              onClick={() => {
                setMfaResolver(null)
                setMfaCode('')
                setPassword('')
                setError('')
              }}
            >
              Back
            </button>
          </div>
        </form>
      </main>
    )
  }

  return (
    <main className="admin-auth-shell">
      <form className="admin-auth-card" onSubmit={handleSubmit}>
        <p className="admin-kicker">StockRoom NJ</p>
        <h1>Admin dashboard</h1>
        <p>Sign in with a provisioned staff account to manage shop inventory and events.</p>
        {error && <p className="admin-alert is-error">{error}</p>}
        <label><span>Email</span><input required autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label><span>Password</span><input required autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label className="admin-checkbox-row">
          <input
            type="checkbox"
            checked={rememberMfa}
            onChange={(event) => setRememberMfa(event.target.checked)}
          />
          <span>Do not ask again for 3 days</span>
        </label>
        <button className="admin-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </button>
        <a href="./">Back to storefront</a>
      </form>
    </main>
  )
}

function AdminApp() {
  const [authState, setAuthState] = useState(isFirebaseConfigured ? 'loading' : 'unconfigured')
  const [authError, setAuthError] = useState('')
  const [user, setUser] = useState(null)
  const [records, setRecords] = useState([])
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [managing, setManaging] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!auth || !db) {
      return undefined
    }

    return onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        setUser(null)
        setAuthError('')
        setAuthState('signed-out')
        return
      }

      // Check MFA expiration if they have MFA enrolled and aren't using the emulator
      if (hasTotpFactor(nextUser) && !isUsingFirebaseEmulators) {
        const isSessionVerified = sessionStorage.getItem('mfa_verified_session_' + nextUser.uid) === 'true'
        const rememberMfa = localStorage.getItem('mfa_remember_' + nextUser.uid) === 'true'
        const mfaVerifiedAt = parseInt(localStorage.getItem('mfa_verified_at_' + nextUser.uid) || '0', 10)
        const isWithinThreeDays = (Date.now() - mfaVerifiedAt) < (3 * 24 * 60 * 60 * 1000)

        if (!isSessionVerified && (!rememberMfa || !isWithinThreeDays)) {
          try {
            await handleSignOut()
          } catch (e) {
            console.error('Failed to sign out admin after MFA expired:', e)
          }
          return
        }
      }

      setUser(nextUser)
      setAuthError('')

      try {
        const adminDoc = await getDoc(doc(db, 'admins', nextUser.uid))
        if (!adminDoc.exists()) {
          setAuthState('unauthorized')
          return
        }

        setAuthState((hasTotpFactor(nextUser) || isUsingFirebaseEmulators) ? 'authorized' : 'mfa-enrollment-required')
      } catch (error) {
        setAuthError(getFriendlyErrorMessage(error, 'admin'))
        setAuthState('verification-error')
      }
    })
  }, [])

  useEffect(() => {
    if (authState !== 'authorized') {
      return undefined
    }

    return onSnapshot(collection(db, 'events'), (snapshot) => {
      setRecords(
        snapshot.docs
          .map((eventDoc) => ({ id: eventDoc.id, ...eventDoc.data() }))
          .sort((a, b) => toDate(a.schedule.start) - toDate(b.schedule.start)),
      )
    })
  }, [authState])

  const visibleRecords = records.filter((record) => filter === 'all' || record.status === filter)
  const currentManagingRecord = records.find((record) => record.id === managing?.id)

  const saveEvent = async (payload) => {
    setNotice('')
    setError('')
    setIsSaving(true)

    try {
      if (!editing?.id) {
        await addDoc(collection(db, 'events'), {
          ...payload,
          status: 'draft',
          exceptions: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: user.uid,
          updatedBy: user.uid,
        })
        setNotice('Draft created.')
        setEditing(null)
        return
      }

      const currentRecord = records.find((record) => record.id === editing.id) ?? editing

      if (!currentRecord?.schedule) {
        throw new Error('Could not load the current event record. Refresh the admin page and try again.')
      }

      const recurrenceChanged =
        recurrenceSignature(currentRecord.schedule) !== recurrenceSignature(payload.schedule)
      const hasExceptions = (currentRecord.exceptions ?? []).length > 0

      if (
        recurrenceChanged &&
        hasExceptions &&
        !window.confirm('Changing this schedule will clear its per-date edits and cancellations. Continue?')
      ) {
        return
      }

      await updateDoc(doc(db, 'events', editing.id), {
        ...payload,
        ...(recurrenceChanged && hasExceptions ? { exceptions: [] } : {}),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      })
      setNotice('Event updated.')
      setEditing(null)
    } catch (saveError) {
      setError(getFriendlyErrorMessage(saveError, 'admin'))
    } finally {
      setIsSaving(false)
    }
  }

  const updateRecord = async (id, changes) => {
    setNotice('')
    setError('')

    try {
      await updateDoc(doc(db, 'events', id), {
        ...changes,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      })
    } catch (updateError) {
      setError(getFriendlyErrorMessage(updateError, 'admin'))
    }
  }

  const deleteRecord = async (record) => {
    if (!window.confirm(`Delete "${record.title}" and all of its recurring dates?`)) {
      return
    }

    setNotice('')
    setError('')

    try {
      await deleteDoc(doc(db, 'events', record.id))
      setNotice('Event deleted.')
    } catch (deleteError) {
      setError(getFriendlyErrorMessage(deleteError, 'admin'))
    }
  }

  if (!isFirebaseConfigured || authState === 'unconfigured') {
    return <main className="admin-state"><h1>Firebase setup required</h1><p>Add the Vite Firebase environment variables before using the dashboard.</p></main>
  }

  if (authState === 'loading') {
    return <main className="admin-state"><p>Checking staff access...</p></main>
  }

  if (authState === 'signed-out') {
    return <Login />
  }

  if (authState === 'mfa-enrollment-required') {
    return <TotpEnrollment user={user} onComplete={() => setAuthState('authorized')} />
  }

  if (authState === 'unauthorized') {
    return (
      <main className="admin-state">
        <h1>Staff access required</h1>
        <p>This account does not have dashboard access. Ask an owner to add it as an approved staff account.</p>
        <p>Signed-in UID: <code>{user?.uid}</code></p>
        <button className="admin-button" type="button" onClick={handleSignOut}>Sign out</button>
      </main>
    )
  }

  if (authState === 'verification-error') {
    return (
      <main className="admin-state">
        <h1>Could not verify staff access</h1>
        <p>This account is signed in, but it is not approved for the dashboard yet.</p>
        <p>Signed-in UID: <code>{user?.uid}</code></p>
        {authError && <p className="admin-alert is-error">{authError}</p>}
        <button className="admin-button" type="button" onClick={handleSignOut}>Sign out</button>
      </main>
    )
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="admin-kicker">StockRoom NJ</p>
          <h1>Admin dashboard</h1>
        </div>
        <div className="admin-row">
          <a className="admin-button is-secondary" href="./">View storefront</a>
          <button className="admin-button is-secondary" type="button" onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      <main className="admin-main">
        {isUsingFirebaseEmulators && (
          <p className="admin-alert is-warning">
            Two-step authentication is skipped only while using the Firebase Auth Emulator because TOTP MFA is not supported reliably there.
          </p>
        )}
        {notice && <p className="admin-alert">{notice}</p>}
        {error && <p className="admin-alert is-error">{error}</p>}

        <AdminProducts user={user} />
        <AdminBids user={user} />
        <AdminLegalDocuments user={user} />

        {editing && (
          <EventEditor
            key={editing.id ?? 'new-event'}
            isSaving={isSaving}
            record={editing.id ? editing : null}
            onCancel={() => setEditing(null)}
            onSave={saveEvent}
          />
        )}

        {currentManagingRecord && (
          <OccurrenceManager record={currentManagingRecord} onClose={() => setManaging(null)} onUpdate={updateRecord} />
        )}

        <section className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <p className="admin-kicker">Shared live calendar</p>
              <h2>Events</h2>
            </div>
            <button className="admin-button" type="button" onClick={() => setEditing({})}>New event</button>
          </div>

          <div className="admin-filters" aria-label="Filter events">
            {['all', 'draft', 'published'].map((option) => (
              <button className={filter === option ? 'is-active' : ''} key={option} type="button" onClick={() => setFilter(option)}>
                {option}
              </button>
            ))}
          </div>

          <div className="admin-event-list">
            {visibleRecords.length === 0 && <p className="admin-muted">No events match this filter.</p>}
            {visibleRecords.map((record) => (
              <article className="admin-event-item" key={record.id}>
                <div>
                  <span className={`admin-status is-${record.status}`}>{record.status}</span>
                  <h3>{record.title}</h3>
                  <p>{formatOccurrenceLabel(record.schedule.start, record.schedule.end, record.schedule.allDay)}</p>
                  <span>{record.venueName} · {record.schedule.kind === 'recurring' ? `${record.schedule.frequency} series` : 'one-time event'}</span>
                </div>
                <div className="admin-row">
                  <button className="admin-text-button" type="button" onClick={() => setEditing(record)}>Edit</button>
                  {record.schedule.kind === 'recurring' && <button className="admin-text-button" type="button" onClick={() => setManaging(record)}>Manage dates</button>}
                  <button className="admin-text-button" type="button" onClick={() => updateRecord(record.id, { status: record.status === 'published' ? 'draft' : 'published' })}>
                    {record.status === 'published' ? 'Unpublish' : 'Publish'}
                  </button>
                  <button className="admin-text-button is-danger" type="button" onClick={() => deleteRecord(record)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

export default AdminApp
