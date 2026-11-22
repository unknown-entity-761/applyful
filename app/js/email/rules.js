// Reading job emails without AI (version 5, email import). Pure functions, no
// network or storage, so they can be tested with sample emails.
//
// An email here is { id, threadId, date, from: { name, email }, to: [addresses],
// subject, text } (gmail.js builds it from Gmail's format).
//
// readJobEmail(email) works out:
//   kind     'confirmation' | 'assessment' | 'interview' | 'offer' | 'rejection', or ''
//            when it isn't about an application you made (job alerts, newsletters)
//   company  "Acme", from the subject or body, the sender's name, or their address
//   title    "Data Analyst", from the subject or body
//   jobId    "R12345", a job or requisition number, if there is one
//   portal   "Workday", "Greenhouse"…, from the sender's address
//   person   true when a real person wrote it (a recruiter), not a no-reply address
//   contact  { name, title, email, phone } for that person, from their signature

import { tidyCase } from '../cv/text.js';

// ---- Tidy text ----

/** The email's own words: quoted earlier messages and long footers cut off. */
export function ownText(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  const out = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) break; // quoted reply
    if (/^\s*On .{5,200} wrote:\s*$/.test(line)) break;
    if (/^\s*-{2,}\s*(Original Message|Forwarded message)/i.test(line)) break;
    if (out.length > 3 && /^\s*From:\s.+/.test(line)) break; // Outlook-style quote
    out.push(line);
  }
  return out.join('\n').slice(0, 8000);
}

const flat = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

// ---- What kind of email it is ----

const NOT_ABOUT_YOUR_APPLICATION = [
  /\bjob alerts?\b/i,
  /\b(new|recommended|similar|suggested) jobs?\b/i,
  /\bjobs? (you may|you might|that match|matching|for you)\b/i,
  /\bunsubscribe from (these|job) (alerts|emails)\b/i,
  /\bverify your email\b/i,
  /\breset your password\b/i,
  /\b(complete|finish) your (profile|application)\b(?![^.]{0,40}\bassessment)/i, // reminders to finish applying
];

const REJECTION = [
  /\bregret to (inform|advise|let you know)\b/i,
  /\bnot (be )?(progressing|proceeding|moving forward|moving ahead|taking (it|your application) further)\b/i,
  /\bdecided (not )?to (progress|proceed|move forward|continue|go ahead) with (other|another) (candidates?|applicants?)\b/i,
  /\bdecided not to (progress|proceed|move forward|continue) with your application\b/i,
  /\b(will|would) not be (progressing|proceeding|moving forward|taking your application)\b/i,
  /\b(have|has|were|was) not (been )?(successful|selected|shortlisted)\b/i,
  /\bunsuccessful on this occasion\b/i,
  /\bnot been shortlisted\b/i,
  /\b(position|role|vacancy) has (now )?been filled\b/i,
  /\bno longer (being )?(under )?consider(ed|ation)\b/i,
  /\bpursue other candidates\b/i,
  /\bmove forward with (other|another) (candidates?|applicants?)\b/i,
];

const UNFORTUNATELY = /\bunfortunately\b[^.!?]{0,140}\b(not|unable to (offer|progress|proceed|move)|won['’]t|decided|other (candidates|applicants))\b/i;
const POLITE_NOTICE = /\bunfortunately\b[^.!?]{0,80}\b(respond|reply|get back|provide feedback|contact) (to )?(every|all|each|everyone|individual)/i;

const OFFER = [
  /\b(pleased|delighted|happy|excited) to (offer|extend (you )?(an|the|a formal) offer)\b/i,
  /\b(letter of offer|offer letter|offer of employment|employment offer)\b/i,
  /\bverbal offer\b/i,
];

const INTERVIEW = [
  /\b(invite|inviting|invitation for) you (to|for) (an? |the |your )?(\w+ )?(interview|phone screen|phone call|video call|call|chat|conversation|meeting)\b/i,
  /\b(schedule|arrange|book|set up|organise|organize) (an? |your |the )?(\w+ )?(interview|phone screen|call|chat|time to (chat|talk|meet))\b/i,
  /\b(like|love) to (invite|schedule|arrange|book|set up|organise|organize|speak|meet|chat|talk) (with )?you\b/i,
  /\binterview (invitation|invite|confirmation|request|scheduled|details)\b/i,
  /\byour interview\b/i,
];

const ASSESSMENT = [
  /\b(invite|inviting|invitation for) you (to|for) (complete |take )?(an? |the |our )?(online |coding |technical )?(assessment|test|challenge|questionnaire)\b/i,
  /\bplease (complete|take|finish) (the|this|our|an?|your) (\w+ ){0,2}(assessment|test|challenge|questionnaire)\b/i,
  /\b(online|psychometric|aptitude|cognitive|personality|technical|coding|skills?) (assessment|test)s? (invitation|invite|link|is ready|for you)\b/i,
  /\byour (online |coding |technical |video )?(assessment|test|challenge)\b/i,
  /\b(hackerrank|codility|testgorilla|hirevue|pymetrics|shl|criteria corp|vervoe|codesignal|harver)\b/i,
  /\b(one-way|video) interview (invitation|invite|link)\b/i,
];

const CONFIRMATION = [
  /\bthank(s| you) for (applying|your (job )?application|submitting your application|your interest in (the|our|joining)|applying to|applying for)\b/i,
  /\bwe (have|['’]ve) (received|got) your (job )?application\b/i,
  /\byour application (has been|was) (received|submitted|sent)\b/i,
  /\bapplication (received|submitted|confirmation|successfully submitted)\b/i,
  /\bsuccessfully (applied|submitted your application)\b/i,
];

const any = (patterns, text) => patterns.some((pattern) => pattern.test(text));

const CONDITIONAL = /\b(if|unless|otherwise|should you not|in the event|please (consider|assume))\b/i;

/** True when a sentence (not a "what if" one) says the application didn't succeed. */
function saysRejected(all) {
  return all.split(/(?<=[.!?])\s+/).some((sentence) => {
    if (CONDITIONAL.test(sentence)) return false;
    if (any(REJECTION, sentence)) return true;
    const sorry = sentence.match(UNFORTUNATELY);
    return Boolean(sorry) && !POLITE_NOTICE.test(sorry[0]);
  });
}

/** 'rejection' | 'offer' | 'interview' | 'assessment' | 'confirmation' | '' */
export function kindOf(subject, text) {
  const all = `${flat(subject)}. ${flat(text)}`;
  const rejected = saysRejected(all);
  if (any(NOT_ABOUT_YOUR_APPLICATION, all) && !rejected && !any(INTERVIEW, all)) return '';
  if (rejected) return 'rejection';
  if (any(OFFER, all)) return 'offer';
  // An assessment called a "video interview" is still an assessment.
  if (any(ASSESSMENT, all) && !/\b(phone|in[- ]person|onsite|on-site|panel|face[- ]to[- ]face) interview\b/i.test(all)) return 'assessment';
  if (any(INTERVIEW, all) || /\binterview\b/i.test(flat(subject))) return 'interview';
  if (any(CONFIRMATION, all)) return 'confirmation';
  return '';
}

// ---- Portals ----

const PORTAL_DOMAINS = [
  [/myworkday(jobs)?\.com$|workday\.com$/, 'Workday'],
  [/successfactors\.(com|eu)$|sapsf\.(com|eu)$/, 'SuccessFactors'],
  [/greenhouse(-mail)?\.io$/, 'Greenhouse'],
  [/lever\.co$/, 'Lever'],
  [/icims\.com$/, 'iCIMS'],
  [/taleo\.net$/, 'Taleo'],
  [/linkedin\.com$/, 'LinkedIn Easy Apply'],
  [/smartrecruiters\.com$/, 'SmartRecruiters'],
  [/jobvite\.com$/, 'Jobvite'],
  [/workable(mail)?\.com$/, 'Workable'],
  [/ashbyhq\.com$/, 'Ashby'],
  [/bamboohr\.com$/, 'BambooHR'],
  [/pageuppeople\.com$/, 'PageUp'],
  [/livehire\.com$/, 'LiveHire'],
  [/seek\.com(\.au)?$/, 'SEEK'],
  [/indeed(email)?\.com$/, 'Indeed'],
];

/** The portal an address belongs to ("Workday"), or ''. */
export function portalOf(address) {
  const domain = String(address ?? '').toLowerCase().split('@')[1] ?? '';
  return PORTAL_DOMAINS.find(([pattern]) => pattern.test(domain))?.[1] ?? '';
}

// Free email providers: their name isn't a company.
const PERSONAL_DOMAINS = /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|aol|proton(mail)?|gmx|mail|zoho|fastmail|bigpond|optusnet|qq|163)\./;

// ---- Company ----

const ROLE_WORDS = /\b(careers?|recruit(ing|ment|er|ers)?|talent( acquisition)?( team)?|hiring( team)?|jobs?|hr|human resources|people( team| and culture)?|team|no[- ]?reply|do[- ]?not[- ]?reply|notifications?|mailer|admin|candidates?|applications?|employment)\b/gi;
const HAS_ROLE_WORD = new RegExp(ROLE_WORDS.source, 'i'); // for .test(), which a /g pattern would make stateful
const PORTAL_NAMES = /^(workday|successfactors|sap successfactors|greenhouse|lever|icims|taleo|linkedin|smartrecruiters|jobvite|workable|ashby|bamboohr|pageup|livehire|seek|indeed)$/i;

const cleanCompany = (text) => {
  const name = String(text ?? '')
    .replace(/["“”]/g, '')
    .replace(/\s+(via|@|on behalf of)\s+.*$/i, '')
    .replace(ROLE_WORDS, ' ')
    .replace(/[|•–—:-]+\s*$/, '')
    .replace(/^\s*[|•–—:-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name || name.length > 60 || PORTAL_NAMES.test(name) || /^(the|our|a|an|your|us|we)$/i.test(name)) return '';
  if (name.split(' ').length > 6) return '';
  return tidyCase(name);
};

const COMPANY_PATTERNS = [
  /\b(?:applying|applied|application|apply|interest)\s+(?:to|at|with|in joining|in)\s+([A-Z][\w&.'’ -]{1,50}?)(?:\s+(?:for|as|and|we|this|-|–)\b|[.!,;:()]|$)/,
  /\b(?:position|role|job|opportunity|vacancy|career)\s+(?:at|with)\s+([A-Z][\w&.'’ -]{1,50}?)(?:\s+(?:and|we|has|have|is|-|–)\b|[.!,;:()]|$)/,
  /\b(?:join|joining)\s+(?:the\s+)?([A-Z][\w&.'’ -]{1,50}?)\s+team\b/,
  /\bthe\s+([A-Z][\w&.'’ -]{1,40}?)\s+(?:recruitment|recruiting|talent acquisition|hiring|careers?|people)\s+team\b/i,
];

/**
 * The company the email is about: from its words, the sender's name (unless it's a
 * person's), the company in a recruiter's signature, or the sender's address.
 */
export function companyOf(email, signatureCompany = '') {
  const subject = flat(email.subject);
  const body = flat(ownText(email.text)).slice(0, 1500);
  for (const pattern of COMPANY_PATTERNS) {
    const found = subject.match(pattern) ?? body.match(pattern);
    const name = found && cleanCompany(found[1]);
    if (name) return name;
  }
  const fromName = cleanCompany(email.from?.name);
  const address = String(email.from?.email ?? '').toLowerCase();
  const [local, domain = ''] = address.split('@');
  // Workday sends from <company>@myworkday.com, or <company>.wd3.myworkday.com.
  if (portalOf(address) === 'Workday') {
    const tenant = domain.split('.').length > 2 && !/^(wd\d+|www)$/.test(domain.split('.')[0]) ? domain.split('.')[0] : local;
    if (fromName) return fromName;
    if (tenant && !/^(no-?reply|donotreply|myworkday|workday)$/.test(tenant)) return tidyCase(tenant.replace(/[_-]+/g, ' ').toUpperCase());
  }
  if (fromName && !looksLikePerson(email.from?.name)) return fromName;
  const signed = cleanCompany(signatureCompany);
  if (signed) return signed;
  if (!portalOf(address) && domain && !PERSONAL_DOMAINS.test(domain)) {
    const parts = domain.split('.');
    const main = parts.length > 2 && /^(com|co|org|net|gov|edu|ac)$/.test(parts[parts.length - 2]) ? parts[parts.length - 3] : parts[parts.length - 2];
    if (main && !/^(mail|email|e|notify|hire|jobs|careers)$/.test(main)) return tidyCase(main.toUpperCase());
  }
  return '';
}

// ---- Job title ----

const TITLE_PATTERNS = [
  /\b(?:application|applying|applied)\s+for\s+(?:the\s+|a\s+|an\s+)?(?:position\s+of\s+|role\s+of\s+)?["“']?([A-Z][^"”'.!?\n]{2,80}?)["”']?\s*(?:position|role|job|opportunity|vacancy)?\s*(?:\(|\bat\b|\bwith\b|\bin\b|[-–|,.!:]|$)/,
  /\b(?:position|role)\s+of\s+["“']?([A-Z][^"”'.!?\n]{2,80}?)["”']?\s*(?:\(|\bat\b|\bwith\b|[-–|,.!:]|$)/,
  /\b(?:for|in)\s+(?:the|our)\s+["“']?([A-Z][^"”'.!?\n]{2,80}?)["”']?\s+(?:position|role|job|opportunity|vacancy)\b/,
  /^(?:re:\s*|fwd?:\s*)*(.{3,60}?)\s+(?:application|role|position)$/i,
  /^(?:re:\s*|fwd?:\s*)*(.{3,80}?)\s+[-–|:]\s+(?:application|applied|interview|assessment|update)/i,
  /^(?:re:\s*|fwd?:\s*)*(?:application|interview|assessment|update)(?:\s+(?:received|confirmation|invitation|invite|update))?\s*[-–|:]\s*(.{3,80}?)(?:\s+(?:at|with)\s+.*)?$/i,
];

const cleanTitle = (text) => {
  const title = String(text ?? '')
    .replace(/\((?:job|req|ref|id)[^)]*\)/gi, '')
    .replace(/\s*\b(?:job|req(?:uisition)?|ref(?:erence)?)\s*(?:id|no\.?|number|#)\s*[:#]?\s*\S+/gi, '')
    .replace(/["“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[-–|,:]+$/, '')
    .trim();
  if (!title || title.length < 3 || title.split(' ').length > 10) return '';
  if (/^(your|our|the|this|a|an|job|role|position|application|thank|thanks|we|you)\b/i.test(title)) return '';
  return title;
};

export function titleOf(email) {
  const subject = flat(email.subject);
  const body = flat(ownText(email.text)).slice(0, 2000);
  for (const text of [subject, body]) {
    for (const pattern of TITLE_PATTERNS) {
      const found = text.match(pattern);
      const title = found && cleanTitle(found[1]);
      if (title) return title;
    }
  }
  return '';
}

// ---- Job number ----

export function jobIdOf(email) {
  const all = `${flat(email.subject)} ${flat(ownText(email.text)).slice(0, 3000)}`;
  const labelled = all.match(/\b(?:job|req(?:uisition)?|reference|ref|vacancy|posting)\s*(?:id|no\.?|number|#)\s*[:#]?\s*([A-Z]{0,5}[-_]?\d{3,}[\w-]*)/i);
  if (labelled) return labelled[1].toUpperCase();
  const bare = all.match(/\b((?:JR|REQ|R|JOB)[-_]?\d{4,})\b/);
  return bare ? bare[1].toUpperCase() : '';
}

// ---- People and signatures ----

const AUTOMATED = /^(no-?reply|noreply|do-?not-?reply|notifications?|mailer(-daemon)?|careers?|jobs?|recruit(ing|ment)?|talent|hr|hiring|team|info|support|admin|applications?|candidates?)([._+-].*)?$/i;

/** "Jane Smith" yes; "Acme Careers", "Workday" no. */
export function looksLikePerson(name) {
  const text = String(name ?? '').trim();
  if (!/^[\p{L}'’.-]+( [\p{L}'’.-]+){1,3}$/u.test(text)) return false;
  return !HAS_ROLE_WORD.test(text) && !PORTAL_NAMES.test(text);
}

const SIGN_OFF = /^\s*(kind|best|warm|many|warmest)?\s*(regards|wishes|thanks)[,!.]?\s*$|^\s*(regards|thanks|thank you|cheers|sincerely|best|yours sincerely|yours faithfully|talk soon)[,!.]?\s*$/i;
const JOB_TITLE_WORDS = /\b(recruit\w*|talent|acquisition|hr|human resources|people|partner|manager|coordinator|consultant|specialist|lead|director|advisor|adviser|officer|associate|business partner|sourcer|head of|vp|generalist|executive)\b/i;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;

/** { name, title, phone } from the signature at the end of the email's own words. */
export function signatureOf(text, fallbackName = '') {
  const lines = ownText(text).split('\n').map((line) => line.trim());
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (SIGN_OFF.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  const block = (start >= 0 ? lines.slice(start) : lines.slice(-8)).filter(Boolean).slice(0, 8);
  const result = { name: '', title: '', phone: '', company: '' };
  for (const line of block) {
    if (!result.phone) {
      const phone = line.match(PHONE)?.[1];
      if (phone && phone.replace(/\D/g, '').length >= 8 && phone.replace(/\D/g, '').length <= 15) {
        result.phone = phone.replace(/\s+/g, ' ').trim();
        continue;
      }
    }
    if (!result.name && start >= 0 && looksLikePerson(line)) {
      result.name = line;
      continue;
    }
    if (!result.title && line.length <= 80 && JOB_TITLE_WORDS.test(line) && !/@|https?:/.test(line)) {
      result.title = line.replace(/\s*[|,–-]\s*$/, '');
      continue;
    }
    // A short line of capitalised words after the name: usually the company.
    if (!result.company && (result.name || result.title) && line.length <= 50 && /^[A-Z0-9][\w&.'’ -]*$/.test(line) && !/@|https?:|www\./i.test(line)) {
      result.company = line;
    }
  }
  if (!result.name && looksLikePerson(fallbackName)) result.name = fallbackName.trim();
  return result;
}

// ---- All together ----

export function readJobEmail(email) {
  const text = ownText(email.text);
  const kind = kindOf(email.subject, text);
  const address = String(email.from?.email ?? '').toLowerCase();
  const person = Boolean(address) && !AUTOMATED.test(address.split('@')[0]) && !portalOf(address) && looksLikePerson(email.from?.name);
  const signature = person ? signatureOf(text, email.from?.name) : null;
  return {
    kind,
    company: companyOf(email, signature?.company),
    title: titleOf(email),
    jobId: jobIdOf(email),
    portal: portalOf(address),
    person,
    contact: person ? { name: signature.name || email.from.name, title: signature.title, email: address, phone: signature.phone } : null,
  };
}
