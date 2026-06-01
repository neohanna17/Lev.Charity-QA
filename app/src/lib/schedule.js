// Friendly schedule presets <-> cron. The cron is written as a *wall-clock*
// time in the suite's chosen timezone; the runner evaluates it in that same
// timezone (croner) so a "08:00" stays 08:00 across daylight-saving changes.
// We also keep a structured `spec` on the suite so the picker can repopulate
// without having to reverse-parse cron.

export const FREQUENCIES = [
  { value: 'manual', label: 'Manual only (no schedule)' },
  { value: 'hourly', label: 'Every hour' },
  { value: 'everyN', label: 'Every few hours' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays (Mon–Fri)' },
  { value: 'weekly', label: 'Once a week' },
];

// Curated timezone choices for the schedule picker. The viewer's own timezone
// is added on top of this list by the picker if it isn't already here.
export const TIMEZONES = [
  { value: 'Europe/Berlin', label: 'Central European — Berlin · Paris · Amsterdam (CET/CEST)' },
  { value: 'Europe/London', label: 'United Kingdom — London (GMT/BST)' },
  { value: 'Africa/Johannesburg', label: 'South Africa — Johannesburg (SAST)' },
  { value: 'America/New_York', label: 'US Eastern — New York (ET)' },
  { value: 'UTC', label: 'UTC' },
];

export const tzLabel = (tz) => TIMEZONES.find((t) => t.value === tz)?.label || tz || 'UTC';

export const WEEKDAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

export function defaultSpec() {
  return { freq: 'manual', time: '08:00', everyHours: 4, weekday: 1, tz: 'Europe/Berlin' };
}

// Build a cron string whose time-of-day is the literal wall-clock time. The
// runner evaluates this cron in the suite's `tz`, so no UTC conversion is done
// here — that keeps the time fixed (e.g. 08:00) across daylight-saving shifts.
export function buildCron(spec) {
  const s = { ...defaultSpec(), ...(spec || {}) };
  if (s.freq === 'manual') return '';
  if (s.freq === 'hourly') return '0 * * * *';
  if (s.freq === 'everyN') {
    const n = Math.min(23, Math.max(1, Number(s.everyHours) || 4));
    return `0 */${n} * * *`;
  }

  const [h, m] = String(s.time || '08:00').split(':').map((x) => Number(x) || 0);
  if (s.freq === 'daily') return `${m} ${h} * * *`;
  if (s.freq === 'weekdays') return `${m} ${h} * * 1-5`;
  if (s.freq === 'weekly') return `${m} ${h} * * ${Number(s.weekday)}`;
  return '';
}

// Human-readable. Times are in the suite's chosen timezone.
export function describeSchedule(spec) {
  const s = { ...defaultSpec(), ...(spec || {}) };
  if (s.freq === 'manual') return 'No schedule — runs only when you click Run';
  if (s.freq === 'hourly') return 'Every hour';
  if (s.freq === 'everyN') return `Every ${s.everyHours} hours`;
  const t = s.time || '08:00';
  const where = tzLabel(s.tz).split(' — ')[0]; // short region name
  if (s.freq === 'daily') return `Every day at ${t} (${where})`;
  if (s.freq === 'weekdays') return `Weekdays at ${t} (${where})`;
  if (s.freq === 'weekly') {
    const d = WEEKDAYS.find((w) => w.value === Number(s.weekday));
    return `Every ${d ? d.label : 'week'} at ${t} (${where})`;
  }
  return '';
}

export const localTzLabel = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'your local time';
  } catch {
    return 'your local time';
  }
};

// ----- Concrete "next run" preview ---------------------------------------
// The schedule is a wall-clock time in the suite's timezone, so to show the
// user real upcoming dates we have to do a little timezone math.

// Break a Date into its wall-clock parts *in a given timezone*.
function tzParts(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: +p.year,
    mo: +p.month - 1,
    d: +p.day,
    weekday: wd[p.weekday],
    hour: +p.hour,
    minute: +p.minute,
  };
}

// The signed offset (ms) of a timezone at a given instant.
function tzOffset(date, tz) {
  const t = tzParts(date, tz);
  const asUTC = Date.UTC(t.y, t.mo, t.d, t.hour, t.minute, 0);
  return asUTC - Math.floor(date.getTime() / 60000) * 60000;
}

// The absolute Date for a wall-clock time (Y-M-D H:M) in a timezone.
function zonedToDate(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo, d, h, mi, 0);
  // One correction pass is enough except exactly on a DST transition.
  return new Date(guess - tzOffset(new Date(guess), tz));
}

// The next `count` times this schedule will fire, as absolute Dates.
export function nextRuns(spec, count = 3) {
  const s = { ...defaultSpec(), ...(spec || {}) };
  if (s.freq === 'manual') return [];
  const now = Date.now();
  const out = [];

  if (s.freq === 'hourly') {
    const d = new Date(now);
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    for (let i = 0; i < count; i++) out.push(new Date(d.getTime() + i * 3600000));
    return out;
  }

  if (s.freq === 'everyN') {
    const n = Math.min(23, Math.max(1, Number(s.everyHours) || 4));
    const d = new Date(now);
    d.setMinutes(0, 0, 0);
    while (out.length < count) {
      d.setHours(d.getHours() + 1);
      if (d.getHours() % n === 0 && d.getTime() > now) out.push(new Date(d));
    }
    return out;
  }

  const [h, mi] = String(s.time || '08:00').split(':').map((x) => Number(x) || 0);
  const tz = s.tz || 'UTC';
  let cursor = new Date(now);
  for (let i = 0; i < 370 && out.length < count; i++) {
    const tp = tzParts(cursor, tz);
    let dayOk = true;
    if (s.freq === 'weekdays') dayOk = tp.weekday >= 1 && tp.weekday <= 5;
    if (s.freq === 'weekly') dayOk = tp.weekday === Number(s.weekday);
    if (dayOk) {
      const cand = zonedToDate(tp.y, tp.mo, tp.d, h, mi, tz);
      if (cand.getTime() > now) out.push(cand);
    }
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return out;
}

// Format a "next run" Date in the suite's timezone, e.g. "Mon 2 Jun, 08:00".
export function formatNextRun(date, tz) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz || 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}
