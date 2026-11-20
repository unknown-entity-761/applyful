// Shared text rules for reading CVs: dates, contact details, section headings.
// Used by the CV check (rules.js) and by filling in your profile from a CV (parse.js),
// so both understand a CV the same way.

// ---- Dates ----

export const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
export const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export const FULL_MONTHS = new Set(['january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december']);

const NAMED_DATE = `(?:${MONTHS})\\.?,?\\s+(?:'\\d{2}|(?:19|20)\\d{2})`;
const NUMERIC_DATE = '(?:0?[1-9]|1[0-2])[/.](?:19|20)\\d{2}';
const ANY_DATE = `(?:${NAMED_DATE}|${NUMERIC_DATE}|(?:19|20)\\d{2})`;
const ENDS = 'present|current|now|today|ongoing|date';
const RANGE = `\\b(${ANY_DATE})\\s*(?:-|–|—|to|until)\\s*(${ANY_DATE}|${ENDS})\\b`;

/** A fresh global regex for date ranges like "Mar 2021 – Present" (group 1 = start, group 2 = end). */
export const rangeAll = () => new RegExp(RANGE, 'gi');
export const RANGE_TEST = new RegExp(RANGE, 'i');
export const NAMED_DATE_ALL = new RegExp(`\\b(${MONTHS})\\.?,?\\s+(?:'\\d{2}|(?:19|20)\\d{2})\\b`, 'gi');
export const NUMERIC_DATE_ALL = new RegExp(`\\b${NUMERIC_DATE}\\b`, 'g');

export const isOngoing = (token) => new RegExp(`^(${ENDS})$`, 'i').test(String(token ?? '').trim());

/** The year and month (1–12, or 0 if only a year is given) in "Mar 2021", "03/2021", "2021" or "'21". */
function yearAndMonth(token) {
  const text = String(token ?? '').toLowerCase().trim();
  const year4 = /(19|20)\d{2}/.exec(text);
  const year2 = /'(\d{2})/.exec(text);
  const year = year4 ? Number(year4[0]) : year2 ? 2000 + Number(year2[1]) : null;
  if (year === null) return null;
  const named = MONTH_KEYS.findIndex((key) => text.startsWith(key));
  const numeric = /^(\d{1,2})[/.]/.exec(text);
  return { year, month: named >= 0 ? named + 1 : numeric ? Number(numeric[1]) : 0 };
}

/** A date as a number that sorts in date order, for comparing. "Present" = Infinity. */
export function dateValue(token) {
  if (isOngoing(token)) return Number.POSITIVE_INFINITY;
  const date = yearAndMonth(token);
  return date ? date.year * 13 + date.month : null;
}

/**
 * The same date as 'YYYY-MM' for the profile form. A year on its own becomes
 * January (start) or December (end). Returns '' for "Present" or anything unreadable.
 */
export function toYearMonth(token, { end = false } = {}) {
  if (isOngoing(token)) return '';
  const date = yearAndMonth(token);
  if (!date) return '';
  const month = date.month || (end ? 12 : 1);
  return `${date.year}-${String(month).padStart(2, '0')}`;
}

// ---- Contact details ----

export const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
export const PHONE_CANDIDATES = /\+?\d[\d ().-]{6,}\d/g;
export const LINKEDIN_URL = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+\/?/i;

/** The first phone number in the text (8 to 15 digits, not a year range), or ''. */
export function findPhone(text) {
  for (const candidate of text.match(PHONE_CANDIDATES) ?? []) {
    const digits = candidate.replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 15 && !/^(19|20)\d{2}\s*[-.]\s*(19|20)\d{2}$/.test(candidate.trim())) {
      return candidate.trim();
    }
  }
  return '';
}

// ---- Words ----

export const wordCount = (text) => text.split(/\s+/).filter((word) => /[A-Za-z0-9]/.test(word)).length;

/** Lower case, punctuation as spaces, padded with spaces so " sql " matches whole words. */
export function norm(value) {
  const text = String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bsr\b\.?/g, 'senior')
    .replace(/\bjr\b\.?/g, 'junior')
    .replace(/\bmgr\b/g, 'manager')
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim();
  return ` ${text} `;
}

const COMPANY_ENDINGS = / (pty|ltd|limited|inc|incorporated|llc|llp|plc|co|corp|corporation|company|group|gmbh|ag|sa|bv|nv|sdn|bhd|pte|holdings)(?= )/g;
export const normCompany = (name) => norm(name).replace(COMPANY_ENDINGS, '').replace(/\s+/g, ' ');

/** "JANE DOE" → "Jane Doe"; mixed case is left alone. */
export function tidyCase(text) {
  if (text !== text.toUpperCase() || !/[A-Z]/.test(text)) return text;
  return text.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, gap, letter) => gap + letter.toUpperCase());
}

// ---- Section headings ----

// Heading names, after dropping words like "Key", "Professional" or "Work".
const SECTION_NAMES = {
  experience: ['experience', 'experiences', 'employment', 'employment history', 'work history', 'history', 'work', 'career', 'positions held'],
  education: ['education', 'qualifications', 'education and training', 'education and qualifications', 'academic background', 'background', 'study', 'studies', 'training and education', 'academics', 'education history'],
  skills: ['skills', 'skill set', 'skillset', 'skills and tools', 'skills and abilities', 'skills and competencies', 'competencies', 'expertise', 'areas of expertise', 'capabilities', 'strengths', 'tools', 'tools and technologies', 'technologies', 'proficiencies', 'skills summary', 'tech stack', 'top skills'],
  summary: ['summary', 'profile', 'about', 'about me', 'objective', 'statement', 'personal statement', 'overview', 'introduction', 'bio', 'profile summary', 'summary of qualifications'],
  projects: ['projects', 'project', 'project experience', 'portfolio', 'side projects', 'personal projects', 'selected projects'],
  certifications: ['certifications', 'certification', 'certificates', 'licences', 'licenses', 'licences and certifications', 'licenses and certifications', 'certifications and licences', 'certifications and licenses', 'courses and certifications', 'certifications and training'],
  other: ['awards', 'honors awards', 'honours and awards', 'achievements', 'volunteering', 'volunteer experience', 'volunteer work', 'interests', 'hobbies', 'hobbies and interests', 'references', 'referees', 'languages', 'publications', 'leadership', 'activities', 'extracurricular activities', 'courses', 'training', 'development', 'additional information', 'information', 'memberships', 'affiliations', 'contact', 'contact details', 'contact information', 'details', 'patents'],
};
const HEADING_QUALIFIERS = /^(key|relevant|professional|technical|core|work|career|my|selected|additional|other|academic|personal|executive|employment|transferable|soft|hard|it|computer|industry)\s+/;
const PROJECT_HINT = /\bproject/i;
const CERT_HINT = /\b(certific|licen[cs])/i;
const OTHER_HINT = /\b(award|volunteer|interest|hobb|referee|reference|language|publication|course|training|membership|achievement)/i;

export const HEADING_LABELS = { experience: 'Experience', education: 'Education', skills: 'Skills', summary: 'Summary' };

/** What kind of section a line starts, or null if it isn't a heading. */
export function headingKind(line) {
  const text = line.text.replace(/[:|•]+\s*$/, '').trim();
  if (!text || line.bullet || text.length > 45 || wordCount(text) > 5 || /[.,;]$/.test(text) || /\d/.test(text)) return null;

  let key = norm(text).trim();
  for (;;) {
    for (const [kind, names] of Object.entries(SECTION_NAMES)) if (names.includes(key)) return kind;
    const shorter = key.replace(HEADING_QUALIFIERS, '');
    if (shorter === key) break;
    key = shorter;
  }
  // A heading-styled or capitalised line about projects, awards and so on. (Not any
  // heading-styled line: some templates style job titles as headings.)
  const shouting = text === text.toUpperCase() && /[A-Z]{3}/.test(text);
  if (line.heading || shouting) {
    if (PROJECT_HINT.test(text)) return 'projects';
    if (CERT_HINT.test(text)) return 'certifications';
    if (OTHER_HINT.test(text)) return 'other';
  }
  return null;
}

/** Splits the CV into sections by its headings. Lines before the first heading are 'top'. */
export function findSections(lines) {
  const found = new Map();
  let current = 'top';
  const tagged = lines.map((line) => {
    const kind = headingKind(line);
    if (kind) {
      current = kind;
      if (!found.has(kind)) found.set(kind, line.text);
      return { ...line, section: kind, isHeading: true };
    }
    return { ...line, section: current, isHeading: false };
  });
  return { lines: tagged, found };
}

/** A short, mostly capitalised line, like a job title or company name. */
export function looksLikeTitle(text) {
  const words = text.split(/\s+/).filter((word) => /[A-Za-z]/.test(word));
  if (words.length > 8) return false;
  if (RANGE_TEST.test(text) || /[|@]/.test(text) || / at /.test(text)) return true;
  const capitalised = words.filter((word) => /^[A-Z]/.test(word)).length;
  return words.length > 0 && capitalised / words.length >= 0.6;
}

/** True when a PDF line carries on the sentence from the line before it. */
export function continues(previous, text) {
  if (/[.!?]$/.test(previous)) return false;
  return /^[a-z(&,]/.test(text) ||
    /[,–-]$/.test(previous) ||
    /\b(and|or|of|to|the|a|an|with|for|in|on|by|from|across|using|into|at|as|that|which|including)$/i.test(previous);
}
