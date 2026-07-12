import type { UserSettings } from '../types'

export function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function dateKeyToLocalDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

export function addLocalDays(dateKey: string, days: number): string {
  const date = dateKeyToLocalDate(dateKey)
  date.setDate(date.getDate() + days)
  return localDateKey(date)
}

export function calendarDayDifference(fromDateKey: string, toDateKey: string): number {
  const [fromYear, fromMonth, fromDay] = fromDateKey.split('-').map(Number)
  const [toYear, toMonth, toDay] = toDateKey.split('-').map(Number)
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) /
      86_400_000,
  )
}

export function timeToMinutes(value: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error(`Invalid local time: ${value}`)
  }
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

export function localDateTime(dateKey: string, minutesAfterMidnight: number): Date {
  const date = dateKeyToLocalDate(dateKey)
  date.setHours(Math.floor(minutesAfterMidnight / 60), minutesAfterMidnight % 60, 0, 0)
  return date
}

/** FNV-1a gives us a stable, platform-independent non-cryptographic seed. */
export function stableHash(input: string): number {
  let hash = 0x811c9dc5
  for (const character of input) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function deriveSchedule(userId: string, dateKey: string, settings: UserSettings) {
  // Keep the parameters for source compatibility with older adapters. Daily
  // availability is now the user's complete local calendar day, not a random
  // configurable window.
  void userId
  const nextMidnight = localDateTime(dateKey, 24 * 60)
  return {
    unlockAt: localDateTime(dateKey, 0),
    deadlineAt: new Date(nextMidnight.getTime() - 1),
    morningAt: localDateTime(dateKey, timeToMinutes(settings.morningReminderTime)),
  }
}

export function validateScheduleSettings(settings: UserSettings): void {
  timeToMinutes(settings.morningReminderTime)
  if (
    settings.unlockWindowStart !== '00:00' ||
    settings.unlockWindowEnd !== '23:59' ||
    settings.deadlineTime !== '23:59'
  ) {
    throw new Error('Daily challenges always run from local midnight through 11:59 PM.')
  }
}
