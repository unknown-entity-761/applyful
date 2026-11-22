// "Add to calendar" for follow-up dates: a calendar file (.ics) that the phone's
// calendar app opens, or a link that opens Google Calendar with the event filled in.
// The event is all day on the follow-up date, with a reminder at 9 am.
// Nothing is sent anywhere until you choose where to add it.

import { addDays } from './ui.js';
import { APP_NAME } from './config.js';

const compactDate = (iso) => iso.replaceAll('-', '');

function eventText(app) {
  const title = `Follow up: ${app.title} at ${app.company}`;
  const details = [
    `Follow up on your application for ${app.title} at ${app.company}.`,
    app.portal && `Portal: ${app.portal}`,
    app.loginEmail && `Login email: ${app.loginEmail}`,
    app.postingUrl && `Job posting: ${app.postingUrl}`,
    `Added from ${APP_NAME}.`,
  ].filter(Boolean).join('\n');
  return { title, details };
}

/** Text in a calendar file: backslashes, commas, semicolons and line breaks are escaped. */
const escapeIcs = (text) => String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Calendar files keep lines to 75 bytes; longer ones continue on the next line after a space. */
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const charSize = new TextEncoder().encode(char).length;
    if (size + charSize > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += charSize;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** The calendar file for an application's follow-up date, or '' if it has none. */
export function followUpIcs(app, now = new Date()) {
  if (!app.followUpOn) return '';
  const { title, details } = eventText(app);
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${APP_NAME}//Follow-ups//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    // The same id every time, so adding it again updates the event in most calendar apps.
    `UID:followup-${app.id}@applyful.app`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compactDate(app.followUpOn)}`,
    `DTEND;VALUE=DATE:${compactDate(addDays(app.followUpOn, 1))}`,
    `SUMMARY:${escapeIcs(title)}`,
    `DESCRIPTION:${escapeIcs(details)}`,
    ...(app.postingUrl ? [`URL:${app.postingUrl}`] : []),
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcs(title)}`,
    'TRIGGER;RELATED=START:PT9H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** A Google Calendar link with the follow-up filled in, or '' if there's no date. */
export function googleCalendarUrl(app) {
  if (!app.followUpOn) return '';
  const { title, details } = eventText(app);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${compactDate(app.followUpOn)}/${compactDate(addDays(app.followUpOn, 1))}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** A safe file name like "follow-up-acme-corp.ics". */
export function icsFileName(app) {
  const slug = app.company.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `follow-up-${slug || 'application'}.ics`;
}

/** Opens the calendar file: iPhone shows "Add to Calendar"; elsewhere it downloads and opens. */
export function openCalendarFile(app) {
  const file = new File([followUpIcs(app)], icsFileName(app), { type: 'text/calendar' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
