import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import {
  STORE_TIME_ZONE,
  buildFullCalendarRRule,
  expandRecurringOccurrences,
  formatEventRange,
  toCalendarEvents,
} from '../src/events/eventModel'

const timedStart = DateTime.fromISO('2026-06-08T10:00', { zone: STORE_TIME_ZONE }).toJSDate()
const timedEnd = DateTime.fromISO('2026-06-08T14:00', { zone: STORE_TIME_ZONE }).toJSDate()

function recurringRecord(overrides = {}) {
  return {
    id: 'series-1',
    title: 'Market stop',
    venueName: 'Main Hall',
    address: '123 Market St, Wallington, NJ',
    description: '',
    goodsCategories: ['cards'],
    goodsNotes: '',
    exceptions: [],
    schedule: {
      kind: 'recurring',
      allDay: false,
      start: timedStart,
      end: timedEnd,
      frequency: 'weekly',
      interval: 1,
      weekdays: [1],
      until: DateTime.fromISO('2026-06-30', { zone: STORE_TIME_ZONE }).endOf('day').toJSDate(),
    },
    ...overrides,
  }
}

describe('toCalendarEvents', () => {
  it('maps a one-time timed event', () => {
    const events = toCalendarEvents([
      {
        ...recurringRecord(),
        id: 'single-1',
        schedule: { kind: 'single', allDay: false, start: timedStart, end: timedEnd },
      },
    ])

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ id: 'single-1', allDay: false })
    expect(events[0].start).toEqual(timedStart)
  })

  it('maps an all-day event using an exclusive end date', () => {
    const start = DateTime.fromISO('2026-06-08', { zone: STORE_TIME_ZONE }).toJSDate()
    const end = DateTime.fromISO('2026-06-09', { zone: STORE_TIME_ZONE }).toJSDate()
    const events = toCalendarEvents([
      {
        ...recurringRecord(),
        id: 'all-day-1',
        schedule: { kind: 'single', allDay: true, start, end },
      },
    ])

    expect(events[0]).toMatchObject({ allDay: true, start, end })
    expect(formatEventRange(start, end, true)).toContain('All day')
  })

  it.each([
    ['daily', undefined, 'daily'],
    ['weekly', [1, 3], 'weekly'],
    ['monthly', undefined, 'monthly'],
  ])('creates an RRule for %s series', (frequency, weekdays, expected) => {
    const record = recurringRecord({
      schedule: { ...recurringRecord().schedule, frequency, weekdays },
    })
    const rule = buildFullCalendarRRule(record.schedule)

    expect(rule.freq).toBe(expected)
    expect(rule.dtstart).toBe('2026-06-08T10:00:00')
  })

  it('excludes canceled occurrences and creates replacement overrides', () => {
    const originalStart = timedStart.toISOString()
    const replacementStart = DateTime.fromISO('2026-06-08T12:00', {
      zone: STORE_TIME_ZONE,
    }).toJSDate()
    const record = recurringRecord({
      exceptions: [
        { originalStart, action: 'cancelled' },
        {
          originalStart: DateTime.fromISO('2026-06-15T10:00', {
            zone: STORE_TIME_ZONE,
          }).toJSDate().toISOString(),
          action: 'override',
          override: { title: 'Later market stop', start: replacementStart },
        },
      ],
    })
    const events = toCalendarEvents([record])

    expect(events[0].exdate).toHaveLength(2)
    expect(events).toHaveLength(2)
    expect(events[1].title).toBe('Later market stop')
    expect(events[1].start).toEqual(replacementStart)
  })
})

describe('expandRecurringOccurrences', () => {
  it('expands recurrence dates and marks cancellations', () => {
    const record = recurringRecord({
      exceptions: [{ originalStart: timedStart.toISOString(), action: 'cancelled' }],
    })
    const occurrences = expandRecurringOccurrences(record)

    expect(occurrences).toHaveLength(4)
    expect(occurrences[0].action).toBe('cancelled')
  })

  it('keeps the same Eastern wall-clock time across daylight saving changes', () => {
    const start = DateTime.fromISO('2026-10-26T10:00', { zone: STORE_TIME_ZONE })
    const record = recurringRecord({
      schedule: {
        ...recurringRecord().schedule,
        start: start.toJSDate(),
        end: start.plus({ hours: 2 }).toJSDate(),
        until: DateTime.fromISO('2026-11-10', { zone: STORE_TIME_ZONE }).endOf('day').toJSDate(),
      },
    })
    const occurrences = expandRecurringOccurrences(record)

    expect(
      occurrences.map((occurrence) =>
        DateTime.fromJSDate(occurrence.start, { zone: STORE_TIME_ZONE }).toFormat('HH:mm'),
      ),
    ).toEqual(['10:00', '10:00', '10:00'])
  })

  it('keeps recurring all-day events aligned to calendar days across daylight saving changes', () => {
    const start = DateTime.fromISO('2026-10-26', { zone: STORE_TIME_ZONE }).startOf('day')
    const record = recurringRecord({
      schedule: {
        ...recurringRecord().schedule,
        allDay: true,
        start: start.toJSDate(),
        end: start.plus({ days: 1 }).toJSDate(),
        until: DateTime.fromISO('2026-11-10', { zone: STORE_TIME_ZONE }).endOf('day').toJSDate(),
      },
    })
    const occurrences = expandRecurringOccurrences(record)

    expect(
      occurrences.map((occurrence) =>
        DateTime.fromJSDate(occurrence.end, { zone: STORE_TIME_ZONE }).toFormat('HH:mm'),
      ),
    ).toEqual(['00:00', '00:00', '00:00'])
    expect(toCalendarEvents([record])[0].duration).toBe('P1D')
  })
})

describe('formatEventRange', () => {
  it('renders event times in the Eastern store timezone', () => {
    const startUtc = new Date('2026-06-08T14:00:00.000Z')
    const endUtc = new Date('2026-06-08T18:00:00.000Z')

    expect(formatEventRange(startUtc, endUtc, false)).toContain('10:00 AM - 2:00 PM')
  })
})
