import { useEffect, useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
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
import { auth, db, isFirebaseConfigured } from './firebase'
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

function EventEditor({ record, onCancel, onSave }) {
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

      <button className="admin-button" type="submit">
        {record ? 'Save changes' : 'Save draft'}
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

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch {
      setError('Sign-in failed. Check your staff email and password.')
    }
  }

  return (
    <main className="admin-auth-shell">
      <form className="admin-auth-card" onSubmit={handleSubmit}>
        <p className="admin-kicker">StockRoom NJ</p>
        <h1>Event dashboard</h1>
        <p>Sign in with a provisioned staff account to update the public calendar.</p>
        {error && <p className="admin-alert is-error">{error}</p>}
        <label><span>Email</span><input required autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label><span>Password</span><input required autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button className="admin-button" type="submit">Sign in</button>
        <a href="./">Back to storefront</a>
      </form>
    </main>
  )
}

function AdminApp() {
  const [authState, setAuthState] = useState(isFirebaseConfigured ? 'loading' : 'unconfigured')
  const [user, setUser] = useState(null)
  const [records, setRecords] = useState([])
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [managing, setManaging] = useState(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!auth || !db) {
      return undefined
    }

    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser)

      if (!nextUser) {
        setAuthState('signed-out')
        return
      }

      const adminDoc = await getDoc(doc(db, 'admins', nextUser.uid))
      setAuthState(adminDoc.exists() ? 'authorized' : 'unauthorized')
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

    const currentRecord = records.find((record) => record.id === editing.id)
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
  }

  const updateRecord = async (id, changes) => {
    await updateDoc(doc(db, 'events', id), {
      ...changes,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    })
  }

  const deleteRecord = async (record) => {
    if (!window.confirm(`Delete "${record.title}" and all of its recurring dates?`)) {
      return
    }

    await deleteDoc(doc(db, 'events', record.id))
    setNotice('Event deleted.')
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

  if (authState === 'unauthorized') {
    return (
      <main className="admin-state">
        <h1>Staff access required</h1>
        <p>This account is signed in but is not listed in the Firebase <code>admins</code> collection.</p>
        <button className="admin-button" type="button" onClick={() => signOut(auth)}>Sign out</button>
      </main>
    )
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="admin-kicker">StockRoom NJ</p>
          <h1>Event dashboard</h1>
        </div>
        <div className="admin-row">
          <a className="admin-button is-secondary" href="./">View storefront</a>
          <button className="admin-button is-secondary" type="button" onClick={() => signOut(auth)}>Sign out</button>
        </div>
      </header>

      <main className="admin-main">
        {notice && <p className="admin-alert">{notice}</p>}

        {editing && (
          <EventEditor
            key={editing.id ?? 'new-event'}
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
