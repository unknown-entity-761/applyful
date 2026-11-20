// Fills in a profile from a CV or a LinkedIn PDF using plain rules, with no AI, the
// way job portals like Workday pre-fill their forms. It looks for the usual parts of
// a CV (headings, date ranges, job titles, schools, skills lists) and returns a
// profile-shaped object. Anything it can't place is left out, and the person checks
// everything on the review screen before it's saved.
//
//   parseCv(doc)        any CV read by extract.js or ocr.js
//   parseLinkedIn(doc)  LinkedIn's own "Save to PDF" export, which has a fixed layout
//
// Both return { firstName, lastName, headline, location, email, phone, linkedinUrl,
//               summary, skills, experience, education, projects, certifications }.
// (An AI reader could later handle the CVs these rules get wrong; see the tracker.)

import {
  MONTHS, rangeAll, EMAIL, LINKEDIN_URL, findPhone, wordCount, findSections,
  continues, looksLikeTitle, toYearMonth, isOngoing, tidyCase,
} from './text.js';

// ---- Word lists ----

const TITLE_WORDS = /\b(analyst|manager|engineer|developer|designer|assistant|associate|coordinator|consultant|specialist|officer|director|lead|head|intern|internship|administrator|accountant|advis[eo]r|representative|executive|supervisor|technician|scientist|architect|teacher|tutor|nurse|clerk|agent|owner|founder|co-founder|president|chief|ceo|cfo|cto|coo|researcher|writer|editor|producer|marketer|strategist|planner|buyer|cashier|barista|attendant|operator|programmer|tester|trainee|apprentice|volunteer|receptionist|secretary|recruiter|auditor|controller|paralegal|lawyer|solicitor|pharmacist|therapist|worker|crew|chef|cook|driver|salesperson|merchandiser|mentor|instructor|lecturer|professor|fellow|principal|teller|banker|underwriter|actuary|economist|statistician|surveyor|inspector|technologist|support|steward|ambassador)s?\b/i;
const COMPANY_WORDS = /\b(inc|ltd|limited|pty|llc|llp|plc|corp|corporation|company|co|group|bank|university|college|council|hospital|agency|studio|labs?|solutions|services|consulting|technologies|technology|partners|holdings|foundation|institute|government|department|ministry|retail|health|systems|software|media|capital|insurance|airlines?|motors|energy|pharma|logistics|bhd|sdn|gmbh)\b\.?/i;
const QUALIFICATION_WORDS = /\b(bachelor|master|masters|diploma|certificate|degree|ph\.?d|doctor(?:ate)?|b\.?sc|bcom|b\.?com|mba|m\.?sc|b\.?eng|m\.?eng|ll\.?b|associate degree|graduate certificate|honours|hons|high school|secondary school|hsc|vce|a-levels?|gcse|igcse|spm|stpm|matriculation|foundation in)\b/i;
const SCHOOL_WORDS = /\b(university|universiti|universitas|universidad|universit[ée]|college|institute|school|academy|tafe|polytechnic|politeknik|campus|conservatorium)\b/i;
const ISSUER_WORDS = /\b(microsoft|google|aws|amazon web services|amazon|coursera|comptia|cisco|pmi|project management institute|salesforce|oracle|ibm|tableau|hubspot|udemy|edx|linkedin learning|linkedin|scrum alliance|scrum\.org|axelos|isaca|isc2|cpa australia|cfa institute|acca|cima|meta|adobe|sap|red hat|vmware|databricks|snowflake|atlassian|servicenow|autodesk|github|kaggle|datacamp|deeplearning\.ai)\b/i;
const URL = /\bhttps?:\/\/\S+|\b(?:www\.)?(?:github\.com|gitlab\.com|behance\.net|dribbble\.com|kaggle\.com)\/\S+/i;

const tidy = (text) => text.replace(/\s+/g, ' ').replace(/^[\s|,·•–—:-]+|[\s|,·•–—:-]+$/g, '').trim();

/** "City, Region", "Remote" and similar. */
function looksLikeLocation(text) {
  const t = text.trim();
  if (/^(remote|hybrid|on-?site)$/i.test(t)) return true;
  if (/\d|@/.test(t) || TITLE_WORDS.test(t) || COMPANY_WORDS.test(t) || QUALIFICATION_WORDS.test(t) || SCHOOL_WORDS.test(t) || wordCount(t) > 6) return false;
  if (/\b(area|metropolitan)\b/i.test(t)) return true;
  const parts = t.split(/\s*,\s*/);
  return parts.length >= 2 && parts.length <= 3 &&
    parts.every((part) => /^[A-Z][A-Za-z .'-]*$/.test(part) && wordCount(part) <= 3);
}

function looksLikeName(text) {
  const t = text.trim();
  const words = t.split(/\s+/);
  if (words.length < 2 || words.length > 4 || t.length > 40) return false;
  if (/[\d@:/|•·,]/.test(t) || TITLE_WORDS.test(t) || COMPANY_WORDS.test(t) || SCHOOL_WORDS.test(t)) return false;
  return words.every((word) => /^[A-Z][A-Za-z'’.-]*$/.test(word) || /^[A-Z'’.-]+$/.test(word));
}

/** The first date range in a line, and what's left of the line without it. */
function firstRange(text) {
  const match = rangeAll().exec(text);
  if (!match) return null;
  return {
    start: toYearMonth(match[1]),
    end: isOngoing(match[2]) ? '' : toYearMonth(match[2], { end: true }),
    current: isOngoing(match[2]),
    rest: tidy(text.replace(match[0], ' ').replace(/\(\s*\)/g, '')),
  };
}

/** Splits "Data Analyst | Contoso, Sydney" into its parts, keeping "Sydney, NSW" together. */
function segments(text) {
  const parts = [];
  for (const piece of text.split(/\s+[|·•–—]\s+|\s+-\s+|\s*\|\s*|\t+|\s{3,}|\s+at\s+|\s+@\s+/)) {
    const part = tidy(piece);
    if (!part) continue;
    if (looksLikeLocation(part) || !part.includes(',')) parts.push(part);
    else parts.push(...part.split(/\s*,\s*/).map(tidy).filter(Boolean));
  }
  return parts;
}

/** Works out the job title and company from the lines around a job's dates. */
function titleAndCompany(headerLines) {
  const parts = headerLines.flatMap(segments).filter((part) => !looksLikeLocation(part) && wordCount(part) <= 10);
  const isTitle = (part) => TITLE_WORDS.test(part);
  const isCompany = (part) => COMPANY_WORDS.test(part) && !isTitle(part);
  const title = parts.find(isTitle) ?? parts.find((part) => !isCompany(part)) ?? '';
  const company = parts.find((part) => part !== title && isCompany(part)) ?? parts.find((part) => part !== title) ?? '';
  return { title, company };
}

/** Joins points, putting a bullet in front of each. */
const asPoints = (points) => points.map((point) => `• ${point}`).join('\n').slice(0, 2000);

/** Joins two pieces of a wrapped line, mending words split with a hyphen ("self-" + "starter"). */
const joinWrapped = (first, second) => (/[a-z]-$/i.test(first) && /^[a-z]/.test(second) ? `${first}${second}` : `${first} ${second}`);

/** Adds a line to a list of points, joining it onto the last one if a PDF line wrapped. */
function addPoint(points, line, format) {
  const last = points[points.length - 1];
  if (!line.bullet && last && format === 'pdf' && continues(last, line.text)) points[points.length - 1] = joinWrapped(last, line.text);
  else points.push(line.text);
}

// ---- A normal CV ----

export function parseCv(doc) {
  const lines = doc.lines.filter((line) => line.text);
  const { lines: tagged } = findSections(lines);
  const section = (kind) => tagged.filter((line) => line.section === kind && !line.isHeading);
  const allText = `${lines.map((line) => line.text).join('\n')}\n${doc.layout?.headerText ?? ''}`;

  const result = {
    ...topOfCv(section('top').length ? section('top') : lines.slice(0, 6), doc),
    email: EMAIL.exec(allText)?.[0] ?? '',
    phone: findPhone(allText),
    linkedinUrl: linkedinUrlIn(allText),
    summary: '',
    skills: parseSkills(section('skills')),
    experience: parseJobs(section('experience'), doc.format),
    education: parseEducation(section('education')),
    projects: parseProjects(section('projects'), doc.format),
    certifications: parseCertifications(section('certifications')),
  };

  const summary = section('summary');
  if (summary.length) result.summary = joinParagraph(summary, doc.format);
  else {
    const intro = section('top').find((line) => wordCount(line.text) >= 15 && !EMAIL.test(line.text));
    if (intro) result.summary = intro.text;
  }
  return result;
}

function linkedinUrlIn(text) {
  const match = LINKEDIN_URL.exec(text);
  if (!match) return '';
  const handle = match[0].replace(/\/$/, '').split('/in/')[1];
  return handle ? `https://www.linkedin.com/in/${handle}` : '';
}

function joinParagraph(lines, format) {
  const texts = lines.map((line) => line.text);
  const joined = format === 'pdf' ? texts.reduce((all, text) => (all ? joinWrapped(all, text) : text), '') : texts.join('\n');
  return joined.replace(/[ \t]+/g, ' ').trim().slice(0, 3000);
}

/** Name, headline and location from the lines above the first heading. */
function topOfCv(top, doc) {
  const out = { firstName: '', lastName: '', headline: '', location: '' };
  const firstLines = top.slice(0, 8);

  // The name: the biggest text that looks like a name (PDFs), or the first such line.
  const candidates = firstLines.filter((line) => looksLikeName(tidyCase(line.text)));
  const name = candidates.length && doc.format === 'pdf'
    ? candidates.reduce((best, line) => ((line.size || 0) > (best.size || 0) ? line : best))
    : candidates[0];
  if (name) {
    const words = tidyCase(name.text).split(/\s+/);
    out.firstName = words[0];
    out.lastName = words.slice(1).join(' ');
  }

  // The headline: the line straight after the name, if it isn't contact details.
  const nameIndex = name ? firstLines.indexOf(name) : -1;
  const next = firstLines[nameIndex + 1];
  if (next && !EMAIL.test(next.text) && !findPhone(next.text) && !LINKEDIN_URL.test(next.text) &&
      !looksLikeLocation(next.text) && wordCount(next.text) <= 14) {
    out.headline = tidy(next.text);
  }

  // The location: a "City, Region" part, or what's left on the contact line.
  for (const line of firstLines) {
    if (line === name) continue;
    const parts = line.text.split(/\s+[|·•–—]\s+|\s*\|\s*|\t+|\s{3,}/).map(tidy).filter(Boolean);
    const isContactLine = EMAIL.test(line.text) || Boolean(findPhone(line.text));
    const place = parts.find((part) => looksLikeLocation(part)) ??
      (isContactLine ? parts.find((part) => !EMAIL.test(part) && !findPhone(part) && !LINKEDIN_URL.test(part) &&
        !/https?:|www\./i.test(part) && /^[A-Za-z ,.'-]+$/.test(part) && wordCount(part) <= 4) : undefined);
    if (place) {
      out.location = place;
      break;
    }
  }
  return out;
}

function parseJobs(lines, format) {
  const jobs = [];
  let job = null;
  let pending = []; // short lines that may be the next job's title or company

  for (const line of lines) {
    const range = firstRange(line.text);
    if (range) {
      job = { header: [...pending.map((l) => l.text), range.rest].filter(Boolean), start: range.start, end: range.end, current: range.current, points: [] };
      jobs.push(job);
      pending = [];
      continue;
    }
    const isPoint = line.bullet || (wordCount(line.text) >= 8 && !looksLikeTitle(line.text));
    const wrapped = job && job.points.length && !line.bullet && format === 'pdf' && continues(job.points[job.points.length - 1], line.text);
    if (job && (isPoint || wrapped)) {
      if (pending.length && !wrapped) job.points.push(...pending.map((l) => l.text));
      pending = [];
      addPoint(job.points, line, format);
    } else if (job && !job.points.length && job.header.length < 3) {
      job.header.push(line.text); // e.g. the company on the line under the title and dates
    } else {
      pending.push(line);
      if (pending.length > 3) pending.shift();
    }
  }

  return jobs.map((item) => ({
    ...titleAndCompany(item.header),
    start: item.start,
    end: item.end,
    current: item.current,
    description: asPoints(item.points),
  })).filter((item) => item.title || item.company);
}

function parseEducation(lines) {
  const entries = [];
  let current = null;
  for (const line of lines) {
    const range = firstRange(line.text);
    const text = range ? range.rest : line.text;
    const years = range ? null : text.match(/\b(19|20)\d{2}\b/g);
    const parts = segments(text.replace(/\(\s*(19|20)\d{2}\s*\)|\b(19|20)\d{2}\b/g, ' '));
    const qualification = parts.find((part) => QUALIFICATION_WORDS.test(part)) ?? '';
    const school = parts.find((part) => part !== qualification && SCHOOL_WORDS.test(part)) ??
      (!qualification && SCHOOL_WORDS.test(text) ? parts[0] : '');

    const startsNew = (qualification && school) || !current ||
      (qualification && current.qualification) || (school && current.school);
    if ((qualification || school) && startsNew) {
      current = { qualification, school, start: '', end: '' };
      entries.push(current);
    } else if (current) {
      if (qualification && !current.qualification) current.qualification = qualification;
      if (school && !current.school) current.school = school;
    }
    if (current && !current.start && !current.end) {
      if (range) Object.assign(current, { start: range.start, end: range.end });
      else if (years) current.end = toYearMonth(years[years.length - 1], { end: true });
    }
  }
  return entries;
}

function parseSkills(lines) {
  const skills = [];
  for (const line of lines) {
    let text = line.text;
    const colon = text.indexOf(':');
    if (colon > 0 && colon < 40) text = text.slice(colon + 1);
    for (const piece of text.split(/[,;|•·]|\s{2,}|\t|\s\/\s/)) {
      const skill = piece.trim().replace(/^(and|&)\s+/i, '').replace(/\.$/, '').trim();
      if (skill && skill.length <= 40 && wordCount(skill) <= 4 && !/[!?]$/.test(skill)) skills.push(skill);
    }
  }
  return skills;
}

function parseProjects(lines, format) {
  const projects = [];
  let current = null;
  for (const line of lines) {
    const link = URL.exec(line.text)?.[0] ?? '';
    const words = wordCount(line.text);
    const isPoint = line.bullet || words >= 9;
    if (!isPoint && words <= 12 && !(current && format === 'pdf' && current.points.length && continues(current.points[current.points.length - 1], line.text))) {
      const range = firstRange(line.text);
      let name = tidy((range ? range.rest : line.text).replace(link, ''));
      const year = range ? null : /[\s,(]+((?:19|20)\d{2})\)?$/.exec(name);
      if (year) name = tidy(name.slice(0, year.index));
      if (!name) continue;
      current = { name, link, start: range?.start ?? '', end: range?.end ?? (year ? toYearMonth(year[1], { end: true }) : ''), points: [] };
      projects.push(current);
    } else if (current) {
      addPoint(current.points, line, format);
      if (link && !current.link) current.link = link;
    }
  }
  return projects.map(({ points, ...item }) => ({ ...item, description: asPoints(points) }));
}

function parseCertifications(lines) {
  const certs = [];
  for (const line of lines) {
    const text = line.text;
    if (wordCount(text) > 20 || (/^[a-z]/.test(text) && certs.length)) continue;
    const link = URL.exec(text)?.[0] ?? '';
    const dated = new RegExp(`\\b(?:(?:${MONTHS})\\.?\\s+)?(?:19|20)\\d{2}\\b`, 'i').exec(text);
    const rest = tidy(text.replace(link, '').replace(dated?.[0] ?? '\u0000', ' ').replace(/\(\s*\)/g, '').replace(/\b(issued|completed|credential id.*)$/i, ''));
    const parts = rest.split(/\s+[|·•–—]\s+|\s+-\s+|\s*\|\s*|,\s+|\s+by\s+|\s+from\s+/i).map(tidy).filter(Boolean);
    if (!parts.length) continue;
    const name = parts[0];
    const issuer = parts.slice(1).find((part) => ISSUER_WORDS.test(part) || wordCount(part) <= 5) ??
      (ISSUER_WORDS.exec(name)?.[0] ?? '');
    certs.push({ name, issuer: tidyCase(issuer), issued: dated ? toYearMonth(dated[0]) : '', link });
  }
  return certs;
}

// ---- LinkedIn's "Save to PDF" export ----

const LI_HEADINGS = ['Contact', 'Top Skills', 'Languages', 'Certifications', 'Honors-Awards', 'Publications', 'Patents', 'Summary', 'Experience', 'Education', 'Volunteer Experience'];
const LI_DATE = new RegExp(`^(?:(?:${MONTHS})\\s+)?(?:19|20)\\d{2}\\s*[-–]\\s*(?:present|(?:(?:${MONTHS})\\s+)?(?:19|20)\\d{2})(?:\\s*\\(.*\\))?$`, 'i');
const LI_DURATION = /^(\d+\s+years?)?\s*(\d+\s+months?)?$/i;

/** True if this looks like LinkedIn's own PDF export. */
export function isLinkedInExport(doc) {
  const texts = doc.lines.map((line) => line.text);
  return texts.some((text) => /linkedin\.com\/in\//i.test(text)) && texts.includes('Experience') && texts.some((text) => LI_DATE.test(text));
}

export function parseLinkedIn(doc) {
  const lines = doc.lines.filter((line) => line.text && !/^Page \d+ of \d+$/i.test(line.text));
  const texts = lines.map((line) => line.text);
  const out = { firstName: '', lastName: '', headline: '', location: '', email: '', phone: '', linkedinUrl: '', summary: '', skills: [], experience: [], education: [], projects: [], certifications: [] };

  // Name: the biggest text on page 1 that looks like a name; then headline and location under it.
  const skip = new Set();
  const nameCandidates = lines.map((line, i) => ({ line, i })).filter(({ line }) => line.page <= 1 && looksLikeName(line.text) && !LI_HEADINGS.includes(line.text));
  const name = nameCandidates.reduce((best, item) => (!best || (item.line.size || 0) > (best.line.size || 0) ? item : best), null);
  if (name) {
    const words = tidyCase(name.line.text).split(/\s+/);
    out.firstName = words[0];
    out.lastName = words.slice(1).join(' ');
    skip.add(name.i);
    const headline = texts[name.i + 1];
    if (headline && !LI_HEADINGS.includes(headline)) {
      out.headline = headline.slice(0, 140);
      skip.add(name.i + 1);
      const place = texts[name.i + 2];
      if (place && !LI_HEADINGS.includes(place) && (place.includes(',') || /\b(area|remote)\b/i.test(place))) {
        out.location = place;
        skip.add(name.i + 2);
      }
    }
  }

  // Split into sections by LinkedIn's fixed headings.
  const sections = {};
  let current = 'none';
  texts.forEach((text, i) => {
    if (LI_HEADINGS.includes(text)) current = text;
    else if (!skip.has(i)) (sections[current] ??= []).push(i);
  });
  const get = (heading) => (sections[heading] ?? []).map((i) => texts[i]);

  const all = texts.join('\n');
  out.email = EMAIL.exec(all)?.[0] ?? '';
  out.phone = findPhone(get('Contact').join('\n'));
  out.linkedinUrl = linkedinUrlIn(all);
  out.skills = get('Top Skills').filter((text) => wordCount(text) <= 4);
  out.certifications = get('Certifications').filter((text) => wordCount(text) <= 15).map((text) => ({ name: text, issuer: ISSUER_WORDS.exec(text)?.[0] ?? '', issued: '', link: '' }));
  out.summary = get('Summary').join(' ').replace(/\s+/g, ' ').trim().slice(0, 3000);
  out.experience = linkedInJobs(get('Experience'));
  out.education = linkedInEducation(get('Education'));
  return out;
}

function linkedInJobs(texts) {
  const isDate = (text) => LI_DATE.test(text);
  const isDuration = (text) => Boolean(text) && LI_DURATION.test(text) && /year|month/i.test(text);
  const isPlace = (text) => text.includes(',') || /\b(area|remote|hybrid|on-?site)\b/i.test(text);
  const companyLike = (text) => Boolean(text) && wordCount(text) <= 8 && !/[.!?]$/.test(text) && !isPlace(text) && !isDate(text) && !isDuration(text);

  const dateIndexes = texts.map((text, i) => (isDate(text) ? i : -1)).filter((i) => i > 0);
  const roles = [];
  let company = '';
  let previousDate = -1;
  for (const d of dateIndexes) {
    const gap = texts.slice(previousDate + 1, d - 1); // lines between the last role's dates and this title
    let headerStart = d - 1;
    if (isDuration(gap[gap.length - 1]) && gap.length >= 2) {
      company = gap[gap.length - 2];
      headerStart = d - 3;
    } else if (companyLike(gap[gap.length - 1])) {
      company = gap[gap.length - 1];
      headerStart = d - 2;
    }
    if (roles.length) roles[roles.length - 1].descriptionEnd = headerStart;
    const [startText, endText] = texts[d].replace(/\s*\(.*\)$/, '').split(/\s*[-–]\s*/);
    roles.push({
      title: texts[d - 1],
      company,
      start: toYearMonth(startText),
      end: isOngoing(endText) ? '' : toYearMonth(endText, { end: true }),
      current: isOngoing(endText),
      descriptionStart: d + 1 + (isPlace(texts[d + 1] ?? '') ? 1 : 0),
      descriptionEnd: texts.length,
    });
    previousDate = d;
  }
  return roles.map(({ descriptionStart, descriptionEnd, ...role }) => ({
    ...role,
    description: texts.slice(descriptionStart, descriptionEnd).join('\n').slice(0, 2000),
  }));
}

function linkedInEducation(texts) {
  const entries = [];
  texts.forEach((text, i) => {
    const years = /\((?:[A-Za-z]+\s+)?((?:19|20)\d{2})\s*[-–]\s*(?:[A-Za-z]+\s+)?((?:19|20)\d{2})\)\s*$/.exec(text);
    if (!years && !text.includes('·')) return;
    const qualification = tidy(text.split('·')[0]);
    const school = i > 0 && !texts[i - 1].includes('·') ? texts[i - 1] : '';
    entries.push({
      qualification,
      school,
      start: years ? toYearMonth(years[1]) : '',
      end: years ? toYearMonth(years[2], { end: true }) : '',
    });
  });
  return entries;
}
