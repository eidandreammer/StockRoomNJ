import { DateTime, Duration } from 'luxon'
import { RRule } from 'rrule'

export const STORE_TIME_ZONE = 'America/New_York'

export const GOODS_OPTIONS = [
  { value: 'cards', label: 'Cards' },
  { value: 'games', label: 'Games' },
  { value: 'figures', label: 'Figures' },
  { value: 'collectibles', label: 'Collectibles' },
  { value: 'other', label: 'Other' },
]

export const WEEKDAY_OPTIONS = [
  { value: 1, short: 'MO', label: 'Monday', rrule: RRule.MO },
  { value: 2, short: 'TU', label: 'Tuesday', rrule: RRule.TU },
  { value: 3, short: 'WE', label: 'Wednesday', rrule: RRule.WE },
  { value: 4, short: 'TH', label: 'Thursday', rrule: RRule.TH },
  { value: 5, short: 'FR', label: 'Friday', rrule: RRule.FR },
  { value: 6, short: 'SA', label: 'Saturday', rrule: RRule.SA },
  { value: 7, short: 'SU', label: 'Sunday', rrule: RRule.SU },
]

const FREQUENCIES = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
}

export function toDate(value) {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return value
  }

  if (typeof value.toDate === 'function') {
    return value.toDate()
  }

  return new Date(value)
}

export function toIso(value) {
  return toDate(value)?.toISOString() ?? ''
}

export function eventDuration(schedule) {
  return Math.max(toDate(schedule.end) - toDate(schedule.start), 0)
}

function allDayDuration(schedule) {
  const start = DateTime.fromJSDate(toDate(schedule.start), { zone: STORE_TIME_ZONE }).startOf('day')
  const end = DateTime.fromJSDate(toDate(schedule.end), { zone: STORE_TIME_ZONE }).startOf('day')

  return Math.max(end.diff(start, 'days').days, 1)
}

function occurrenceEnd(schedule, start) {
  if (schedule.allDay) {
    return DateTime.fromJSDate(start, { zone: STORE_TIME_ZONE })
      .plus({ days: allDayDuration(schedule) })
      .toJSDate()
  }

  return new Date(start.getTime() + eventDuration(schedule))
}

function localIso(value) {
  return DateTime.fromJSDate(toDate(value), { zone: STORE_TIME_ZONE }).toFormat("yyyy-LL-dd'T'HH:mm:ss")
}

function toFloatingDate(value) {
  const local = DateTime.fromJSDate(toDate(value), { zone: STORE_TIME_ZONE })

  return new Date(
    Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second),
  )
}

function fromFloatingDate(value) {
  const floating = DateTime.fromJSDate(value, { zone: 'utc' })

  return DateTime.fromObject(
    {
      year: floating.year,
      month: floating.month,
      day: floating.day,
      hour: floating.hour,
      minute: floating.minute,
      second: floating.second,
    },
    { zone: STORE_TIME_ZONE },
  ).toJSDate()
}

export function buildRRuleOptions(schedule) {
  const start = toFloatingDate(schedule.start)
  const options = {
    freq: FREQUENCIES[schedule.frequency] ?? RRule.WEEKLY,
    interval: Number(schedule.interval) || 1,
    dtstart: start,
    until: toFloatingDate(schedule.until),
  }

  if (schedule.frequency === 'weekly') {
    options.byweekday = (schedule.weekdays ?? [])
      .map((weekday) => WEEKDAY_OPTIONS.find((option) => option.value === Number(weekday))?.rrule)
      .filter(Boolean)
  }

  if (schedule.frequency === 'monthly') {
    options.bymonthday = DateTime.fromJSDate(start, { zone: 'utc' }).day
  }

  return options
}

export function buildFullCalendarRRule(schedule) {
  const start = toDate(schedule.start)
  const rule = {
    freq: schedule.frequency ?? 'weekly',
    interval: Number(schedule.interval) || 1,
    dtstart: localIso(start),
    until: localIso(schedule.until),
  }

  if (schedule.frequency === 'weekly') {
    rule.byweekday = (schedule.weekdays ?? [])
      .map((weekday) => WEEKDAY_OPTIONS.find((option) => option.value === Number(weekday))?.short)
      .filter(Boolean)
  }

  if (schedule.frequency === 'monthly') {
    rule.bymonthday = DateTime.fromJSDate(start, { zone: STORE_TIME_ZONE }).day
  }

  return rule
}

function eventInput(record, occurrence = {}) {
  const details = { ...record, ...occurrence.override }
  const schedule = record.schedule
  const start = occurrence.start ?? toDate(schedule.start)
  const end = occurrence.end ?? toDate(schedule.end)
  const allDay = occurrence.allDay ?? schedule.allDay

  return {
    id: occurrence.id ?? record.id,
    title: details.title,
    start,
    end,
    allDay,
    extendedProps: {
      recordId: record.id,
      details,
      originalStart: occurrence.originalStart ?? start.toISOString(),
      isRecurring: schedule.kind === 'recurring',
      isOverride: Boolean(occurrence.override),
    },
  }
}

export function toCalendarEvents(records) {
  return records.flatMap((record) => {
    const schedule = record.schedule

    if (schedule.kind !== 'recurring') {
      return [eventInput(record)]
    }

    const exceptions = record.exceptions ?? []
    const exdate = exceptions.map((exception) => localIso(exception.originalStart))
    const recurringEvent = {
      id: record.id,
      title: record.title,
      rrule: buildFullCalendarRRule(schedule),
      duration: schedule.allDay
        ? Duration.fromObject({ days: allDayDuration(schedule) }).toISO()
        : Duration.fromMillis(eventDuration(schedule)).toISO(),
      allDay: schedule.allDay,
      exdate,
      extendedProps: {
        recordId: record.id,
        details: record,
        isRecurring: true,
        isOverride: false,
      },
    }
    const overrides = exceptions
      .filter((exception) => exception.action === 'override')
      .map((exception) => {
        const override = exception.override ?? {}
        return eventInput(record, {
          id: `${record.id}-${exception.originalStart}`,
          originalStart: exception.originalStart,
          override,
          start: toDate(override.start) ?? toDate(exception.originalStart),
          end:
            toDate(override.end) ??
            occurrenceEnd(schedule, toDate(exception.originalStart)),
          allDay: override.allDay,
        })
      })

    return [recurringEvent, ...overrides]
  })
}

export function expandRecurringOccurrences(record, limit = 500) {
  if (record.schedule.kind !== 'recurring') {
    return []
  }

  const schedule = record.schedule
  const exceptions = new Map(
    (record.exceptions ?? []).map((exception) => [exception.originalStart, exception]),
  )

  return new RRule(buildRRuleOptions(schedule))
    .all((_, index) => index < limit)
    .map((floatingStart) => {
      const start = fromFloatingDate(floatingStart)
      const originalStart = start.toISOString()
      const exception = exceptions.get(originalStart)
      const override = exception?.override ?? {}

      return {
        originalStart,
        action: exception?.action ?? 'scheduled',
        details: { ...record, ...override },
        start: toDate(override.start) ?? start,
        end: toDate(override.end) ?? occurrenceEnd(schedule, start),
        allDay: override.allDay ?? schedule.allDay,
      }
    })
}

export function recurrenceSignature(schedule) {
  if (schedule.kind !== 'recurring') {
    return 'single'
  }

  return JSON.stringify({
    kind: schedule.kind,
    frequency: schedule.frequency,
    interval: Number(schedule.interval) || 1,
    weekdays: (schedule.weekdays ?? []).map(Number).sort(),
    until: toIso(schedule.until),
    start: toIso(schedule.start),
    end: toIso(schedule.end),
    allDay: Boolean(schedule.allDay),
  })
}

export function formatEventRange(startValue, endValue, allDay) {
  const start = DateTime.fromJSDate(toDate(startValue), { zone: STORE_TIME_ZONE })
  const end = DateTime.fromJSDate(toDate(endValue), { zone: STORE_TIME_ZONE })

  if (allDay) {
    const inclusiveEnd = end.minus({ days: 1 })
    return start.hasSame(inclusiveEnd, 'day')
      ? `${start.toFormat('cccc, LLLL d, yyyy')} · All day`
      : `${start.toFormat('LLL d, yyyy')} - ${inclusiveEnd.toFormat('LLL d, yyyy')} · All day`
  }

  if (start.hasSame(end, 'day')) {
    return `${start.toFormat('cccc, LLLL d, yyyy')} · ${start.toFormat('h:mm a')} - ${end.toFormat('h:mm a')}`
  }

  return `${start.toFormat('LLL d, yyyy, h:mm a')} - ${end.toFormat('LLL d, yyyy, h:mm a')}`
}

export function formatOccurrenceLabel(startValue, endValue, allDay) {
  return formatEventRange(startValue, endValue, allDay)
}

export function getDirectionsUrl(address) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
}
