import { useEffect, useMemo, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import luxonPlugin from '@fullcalendar/luxon3'
import rrulePlugin from '@fullcalendar/rrule'
import timeGridPlugin from '@fullcalendar/timegrid'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../firebase'
import {
  GOODS_OPTIONS,
  STORE_TIME_ZONE,
  formatEventRange,
  getDirectionsUrl,
  toCalendarEvents,
} from './eventModel'

const goodsLabels = new Map(GOODS_OPTIONS.map((option) => [option.value, option.label]))

function EventDetails({ selection, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const { details, start, end, allDay } = selection

  return (
    <div className="event-modal" role="presentation">
      <button
        aria-label="Close event details"
        className="event-modal-backdrop"
        type="button"
        onClick={onClose}
      />
      <section
        aria-labelledby="event-detail-title"
        aria-modal="true"
        className="event-detail-panel"
        role="dialog"
      >
        <div className="event-detail-head">
          <div>
            <p className="eyebrow">Event details</p>
            <h3 id="event-detail-title">{details.title}</h3>
          </div>
          <button className="event-close" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <dl className="event-detail-list">
          <div>
            <dt>When</dt>
            <dd>{formatEventRange(start, end, allDay)}</dd>
          </div>
          <div>
            <dt>Where</dt>
            <dd>
              <strong>{details.venueName}</strong>
              <span>{details.address}</span>
            </dd>
          </div>
          <div>
            <dt>What we are bringing</dt>
            <dd>
              <span className="goods-tags">
                {(details.goodsCategories ?? []).map((category) => (
                  <span className="goods-tag" key={category}>
                    {goodsLabels.get(category) ?? category}
                  </span>
                ))}
              </span>
              {details.goodsNotes && <span>{details.goodsNotes}</span>}
            </dd>
          </div>
        </dl>

        {details.description && <p className="event-description">{details.description}</p>}

        <a
          className="button primary event-directions"
          href={getDirectionsUrl(details.address)}
          rel="noreferrer"
          target="_blank"
        >
          Open directions
        </a>
      </section>
    </div>
  )
}

function EventsCalendar() {
  const [records, setRecords] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [status, setStatus] = useState(isFirebaseConfigured ? 'loading' : 'unconfigured')

  useEffect(() => {
    if (!db) {
      return undefined
    }

    const publishedEvents = query(collection(db, 'events'), where('status', '==', 'published'))

    return onSnapshot(
      publishedEvents,
      (snapshot) => {
        setRecords(snapshot.docs.map((eventDoc) => ({ id: eventDoc.id, ...eventDoc.data() })))
        setStatus('ready')
      },
      () => {
        setStatus('error')
      },
    )
  }, [])

  const events = useMemo(() => toCalendarEvents(records), [records])

  const handleEventClick = ({ event }) => {
    setSelectedEvent({
      details: event.extendedProps.details,
      start: event.start,
      end: event.end ?? event.start,
      allDay: event.allDay,
    })
  }

  return (
    <>
      <div className="events-calendar-shell">
        {status === 'loading' && <p className="calendar-message">Loading upcoming events...</p>}
        {status === 'error' && (
          <p className="calendar-message is-error">
            We could not load events right now. Please check back shortly.
          </p>
        )}
        {status === 'unconfigured' && (
          <p className="calendar-message">
            Event updates are being prepared. Check back soon for our upcoming schedule.
          </p>
        )}
        {status === 'ready' && records.length === 0 && (
          <p className="calendar-message">No events are posted yet. New dates will appear here.</p>
        )}

        <FullCalendar
          allDayText="All day"
          buttonText={{ today: 'Today', month: 'Month', week: 'Week', day: 'Day' }}
          dayMaxEvents
          events={events}
          eventClick={handleEventClick}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          height="auto"
          initialView="dayGridMonth"
          nowIndicator
          plugins={[dayGridPlugin, timeGridPlugin, rrulePlugin, luxonPlugin]}
          timeZone={STORE_TIME_ZONE}
        />
      </div>

      {selectedEvent && (
        <EventDetails selection={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </>
  )
}

export default EventsCalendar
