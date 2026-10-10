/**
 * Date helpers.
 *
 * The app is offline-first and Nigerian (WAT, UTC+1). We keep dates as epoch
 * milliseconds and format them locally without pulling in a date library.
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ts: number): number {
  return startOfDay(ts) + DAY - 1;
}

/** Monday 00:00 of the week containing `ts`. */
export function startOfWeek(ts: number): number {
  const day = startOfDay(ts);
  const dow = new Date(day).getDay();
  const diff = (dow + 6) % 7; // Monday-first
  return day - diff * DAY;
}

/** First day of the month containing `ts`. */
export function startOfMonth(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

export function endOfMonth(ts: number): number {
  const d = new Date(startOfMonth(ts));
  d.setMonth(d.getMonth() + 1);
  return d.getTime() - 1;
}

export type Period = 'today' | 'week' | 'month';

export function periodRange(period: Period, now: number = Date.now()): { start: number; end: number } {
  switch (period) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'week':
      return { start: startOfWeek(now), end: endOfDay(now) };
    case 'month':
    default:
      return { start: startOfMonth(now), end: endOfDay(now) };
  }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** `7 Oct 2026` */
export function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** `Monday, 7 October 2026` */
export function formatDateLong(ts: number): string {
  const d = new Date(ts);
  return `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** `15:04` */
export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `7 Oct 2026, 15:04` */
export function formatDateTime(ts: number): string {
  return `${formatDate(ts)}, ${formatTime(ts)}`;
}

/** `Mon 7 Oct` */
export function formatDayShort(ts: number): string {
  const d = new Date(ts);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Human friendly day label for lists: Today / Yesterday / `7 Oct`. */
export function formatDayLabel(ts: number, now: number = Date.now()): string {
  const day = startOfDay(ts);
  const today = startOfDay(now);
  if (day === today) return 'Today';
  if (day === today - DAY) return 'Yesterday';
  return formatDate(ts);
}

/** Seconds elapsed since `ts`, e.g. `2h ago`, `just now`. */
export function formatRelative(ts: number, now: number = Date.now()): string {
  const diff = now - ts;
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return formatDate(ts);
}
