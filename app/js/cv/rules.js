// The CV check: plain rules that run on this device. Give it what extract.js read
// from the CV (plus your profile and LinkedIn PDF, if you've added them). It returns
// what to fix, most important first, and what's already strong.
//
// It can't rewrite lines or fully check spelling and grammar. Those come with the
// AI review, which needs the online service (PRD, version 3).
//
// checkCv(doc, { profile, linkedin }) returns:
//   {
//     status:    'ok' | 'unreadable',
//     fixes:     [{ id, severity: 'high' | 'medium' | 'low', title, detail, quotes: [{ text, page }], more, tip }],
//     strengths: [{ id, title, detail }],
//     stats:     { pages, words, points, pointsWithNumbers },
//     checks:    how many checks ran,
//   }
// scoreCv(fixes, ignoredIds) turns the fixes into a score out of 100.

import {
  MONTHS, FULL_MONTHS, rangeAll, RANGE_TEST, NAMED_DATE_ALL, NUMERIC_DATE_ALL, EMAIL, PHONE_CANDIDATES,
  dateValue, wordCount, norm, normCompany, HEADING_LABELS, findSections, looksLikeTitle, continues,
} from './text.js';

export const SEVERITIES = {
  high: { label: 'Fix first', weight: 18 },
  medium: { label: 'Worth fixing', weight: 9 },
  low: { label: 'Nice to have', weight: 4 },
};
const SEVERITY_ORDER = ['high', 'medium', 'low'];

export function scoreCv(fixes, ignored = []) {
  const skip = new Set(ignored);
  const lost = fixes.filter((fix) => !skip.has(fix.id)).reduce((sum, fix) => sum + SEVERITIES[fix.severity].weight, 0);
  // Each fix costs less as the list grows, so a CV with plenty to fix still scores
  // above zero: one "Fix first" item gives 79, a long list lands in the 20s.
  const score = Math.round(100 * Math.exp(-lost / 75));
  return { score, label: scoreLabel(score) };
}

export function scoreLabel(score) {
  if (score >= 85) return 'Strong';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Needs work';
}

// ---- Patterns (dates, contact details and headings are shared, in text.js) ----

const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundreds?|thousands?|millions?|billions?|dozens?|doubled?|tripled?|halved)\b/i;
const DUTY_START = /^(responsible for|responsibilities (?:included|include|were)|duties (?:included|include|were)|tasks (?:included|include)|in charge of|worked on|helped (?:with|to)|assisted (?:with|in)|involved in|participated in|tasked with|my role|role involved)\b/i;
const FIRST_PERSON = /(^|[\s(])(I|I'm|I've|I'd)\s|\b(my|me)\b/i;

// The most common misspellings in CVs, and their fixes.
const MISSPELLINGS = {
  acheive: 'achieve', acheived: 'achieved', acheivement: 'achievement', acheivements: 'achievements', achievment: 'achievement', achievments: 'achievements',
  recieve: 'receive', recieved: 'received', managment: 'management', experiance: 'experience', expirience: 'experience',
  responsable: 'responsible', responsibilty: 'responsibility', responsiblity: 'responsibility', responsibilites: 'responsibilities',
  succesful: 'successful', sucessful: 'successful', successfull: 'successful', succesfully: 'successfully', sucessfully: 'successfully',
  liase: 'liaise', liasing: 'liaising', liason: 'liaison', seperate: 'separate', seperately: 'separately', calender: 'calendar',
  definately: 'definitely', enviroment: 'environment', independant: 'independent', maintainance: 'maintenance', maintenence: 'maintenance',
  occured: 'occurred', proffesional: 'professional', profesional: 'professional', refrence: 'reference', relevent: 'relevant',
  comunication: 'communication', communcation: 'communication', colaborate: 'collaborate', collaberate: 'collaborate', colaboration: 'collaboration',
  coordiante: 'coordinate', anaylse: 'analyse', anaylsis: 'analysis', analysys: 'analysis', buisness: 'business', bussiness: 'business',
  commitee: 'committee', comittee: 'committee', committment: 'commitment', accomodate: 'accommodate', adress: 'address', begining: 'beginning',
  beleive: 'believe', collegue: 'colleague', collegues: 'colleagues', excelent: 'excellent', excellant: 'excellent', familar: 'familiar',
  goverment: 'government', guarentee: 'guarantee', immediatly: 'immediately', knowlege: 'knowledge', knowledgable: 'knowledgeable',
  neccessary: 'necessary', necesary: 'necessary', oppurtunity: 'opportunity', opportunty: 'opportunity', perfomance: 'performance',
  persistant: 'persistent', postion: 'position', proficent: 'proficient', reccommend: 'recommend', recomend: 'recommend',
  schedual: 'schedule', stratergy: 'strategy', supervisior: 'supervisor', techincal: 'technical', untill: 'until', writting: 'writing',
  writen: 'written', attendence: 'attendance', assistent: 'assistant', budjet: 'budget', manger: 'manager', mangers: 'managers',
  pubic: 'public', costumer: 'customer', costumers: 'customers', wich: 'which', thier: 'their', recieving: 'receiving',
  acomplished: 'accomplished', accomplishd: 'accomplished', improvment: 'improvement', developement: 'development', enviromental: 'environmental',
  sucess: 'success', succes: 'success', priviledge: 'privilege', tommorow: 'tomorrow', wierd: 'weird',
};

const CLICHES = [
  'team player', 'hard working', 'hard-working', 'hardworking', 'go-getter', 'think outside the box', 'thinking outside the box',
  'results-driven', 'results driven', 'results-oriented', 'detail-oriented', 'detail oriented', 'detail-orientated', 'self-starter',
  'self starter', 'highly motivated', 'proven track record', 'excellent communication skills', 'strong communication skills',
  'works well under pressure', 'work well under pressure', 'fast learner', 'quick learner', 'people person', 'strong work ethic',
  'go-to person', 'synergy',
];
const REFERENCES_LINE = /\b(references|referees)\s+(are\s+)?(available\s+)?(up)?on\s+request\b/i;

// ---- Small helpers ----

const clip = (text, max = 220) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function pickQuotes(items, limit = 3) {
  return {
    quotes: items.slice(0, limit).map(({ text, page }) => ({ text: clip(text), page: page || 0 })),
    more: Math.max(0, items.length - limit),
  };
}

function hasNumber(text) {
  const withoutDates = text
    .replace(rangeAll(), ' ')
    .replace(NAMED_DATE_ALL, ' ')
    .replace(NUMERIC_DATE_ALL, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ');
  return /\d/.test(withoutDates) || /[$£€¥₹]/.test(withoutDates) || NUMBER_WORDS.test(withoutDates);
}

/** The points under your jobs: bullet points, and longer sentences describing what you did. */
function findPoints(lines, format) {
  const points = [];
  let current = null;
  for (const line of lines) {
    if (line.isHeading) {
      current = null;
      continue;
    }
    const text = line.text;
    const words = wordCount(text);
    const isDate = RANGE_TEST.test(text) && words <= 8;

    if (line.bullet) {
      current = { text, page: line.page };
      points.push(current);
    } else if (format === 'pdf' && current && !isDate && continues(current.text, text)) {
      current.text += ` ${text}`; // a point that wrapped onto the next line
    } else if (words >= 8 && !isDate && !looksLikeTitle(text)) {
      current = { text, page: line.page }; // a point without a bullet
      points.push(current);
    } else {
      current = null; // a job title, company or date
    }
  }
  return points.filter((point) => wordCount(point.text) >= 4);
}

function linkedinRoles(doc) {
  const dateLine = new RegExp(`^(?:(?:${MONTHS})\\s+)?(?:19|20)\\d{2}\\s*[-–]\\s*(?:present|(?:(?:${MONTHS})\\s+)?(?:19|20)\\d{2})(?:\\s*\\(.*\\))?$`, 'i');
  const texts = doc.lines.map((line) => line.text);
  const roles = [];
  texts.forEach((text, i) => {
    const title = texts[i - 1];
    if (i > 0 && dateLine.test(text) && title && wordCount(title) <= 10 && !dateLine.test(title)) {
      roles.push({ title, dates: text.replace(/\s*\(.*\)$/, '') });
    }
  });
  return roles.slice(0, 20);
}

// ---- The checks ----

const CHECKS = [
  function readableLayout(cv) {
    const { layout, format } = cv.doc;
    if (layout.columns) {
      cv.fix({
        id: 'columns',
        severity: 'high',
        title: 'Use one column, not two',
        detail: 'Portals like Workday and SuccessFactors read across the page, line by line. Side-by-side columns get mixed together, so your details can land in the wrong fields.',
        tip: 'Put everything in a single column. Move a sidebar of skills into its own Skills section.',
      });
    }
    if (layout.tables > 0) {
      cv.fix({
        id: 'tables',
        severity: 'medium',
        title: 'Tables can confuse portals',
        detail: `Your CV uses ${layout.tables === 1 ? 'a table' : `${layout.tables} tables`} for layout. Portals often read tables cell by cell, out of order.`,
        tip: 'Rebuild it with plain paragraphs and bullet points, and use tabs to line up dates.',
      });
    }
    if (layout.textBoxes > 0) {
      cv.fix({
        id: 'text-boxes',
        severity: 'medium',
        title: 'Move text out of text boxes',
        detail: 'Many portals skip text boxes completely, so anything inside them may never be read.',
        tip: 'Copy the text into the main body of the document, then delete the text boxes.',
      });
    }
    if (layout.images > 0) {
      cv.fix({
        id: 'images',
        severity: 'medium',
        title: 'Portals skip pictures and icons',
        detail: `Your CV has ${layout.images === 1 ? 'a picture' : `${layout.images} pictures`}. Portals only read text, so anything shown as an image (icons, logos, skill bars or a photo) is lost.`,
        tip: 'Write contact details and skill levels as text. Unless a photo is expected where you’re applying, leave it out.',
      });
    }
    if (!layout.columns && !layout.tables && !layout.textBoxes && !layout.images) {
      cv.strong({
        id: 'layout',
        title: 'Simple layout portals can read',
        detail: format === 'pdf' ? 'One column, real text and no pictures.' : 'No tables, text boxes, columns or pictures.',
      });
    }
  },

  function contactDetails(cv) {
    const body = cv.text;
    const header = cv.doc.layout.headerText;
    const phoneIn = (text) => (text.match(PHONE_CANDIDATES) ?? []).some((candidate) => {
      const digits = candidate.replace(/\D/g, '');
      return digits.length >= 8 && digits.length <= 15 && !/^(19|20)\d{2}\s*[-.]\s*(19|20)\d{2}$/.test(candidate.trim());
    });
    const email = EMAIL.test(body);
    const phone = phoneIn(body);
    const headerEmail = EMAIL.test(header);
    const headerPhone = phoneIn(header);
    const linkedin = /linkedin/i.test(body) || /linkedin/i.test(header);

    if ((headerEmail && !email) || (headerPhone && !phone)) {
      cv.fix({
        id: 'contact-in-header',
        severity: 'medium',
        title: 'Move contact details out of the page header',
        detail: 'Your email or phone number is only in the Word header, at the top of every page. Some portals skip headers, so they may not find how to reach you.',
        tip: 'Put your name, email and phone number as normal text at the top of the first page.',
      });
    }
    if (!email && !headerEmail) {
      cv.fix({
        id: 'no-email',
        severity: 'high',
        title: 'Add your email address',
        detail: 'There’s no email address in your CV, so recruiters have no easy way to reply.',
        tip: 'Add it under your name at the top, as plain text.',
      });
    }
    if (!phone && !headerPhone) {
      cv.fix({
        id: 'no-phone',
        severity: 'medium',
        title: 'Add a phone number',
        detail: 'Recruiters often call to arrange a first chat. No phone number was found in your CV.',
        tip: 'Add your mobile number under your name, with your country code if you’re applying abroad.',
      });
    }
    if (!linkedin) {
      cv.fix({
        id: 'no-linkedin',
        severity: 'low',
        title: 'Add your LinkedIn link',
        detail: 'Most recruiters look you up on LinkedIn. A link saves them the search and makes sure they find the right person.',
        tip: 'Add it with your contact details, like linkedin.com/in/your-name.',
      });
    }
    if ((email || headerEmail) && (phone || headerPhone)) {
      cv.strong({ id: 'contact', title: 'Easy to contact', detail: linkedin ? 'Email, phone and LinkedIn are all there.' : 'Email and phone are both there.' });
    }
  },

  function sectionHeadings(cv) {
    const { found } = cv.sections;
    const hasDates = RANGE_TEST.test(cv.text);
    if (!found.has('experience')) {
      cv.fix({
        id: 'no-experience-heading',
        severity: 'high',
        title: 'Add an “Experience” heading',
        detail: hasDates
          ? 'Your jobs are there, but without a standard heading portals may not recognise them as your work history.'
          : 'No work history was found. Portals look for a heading like “Experience” to find your jobs.',
        tip: 'Use a plain heading such as “Experience” or “Work experience” above your jobs, most recent first.',
      });
    }
    if (!found.has('education')) {
      cv.fix({
        id: 'no-education-heading',
        severity: 'medium',
        title: 'Add an “Education” section',
        detail: 'Portals and recruiters look for an Education heading, even when the role doesn’t need a degree.',
        tip: 'List your highest qualification, where you studied and the year you finished.',
      });
    }
    if (!found.has('skills')) {
      cv.fix({
        id: 'no-skills-heading',
        severity: 'medium',
        title: 'Add a “Skills” section',
        detail: 'Portals rank CVs by matching words from the job ad. A Skills section makes those words easy to find.',
        tip: 'List 8 to 15 skills and tools from the jobs you want, like SQL, Excel or stakeholder management.',
      });
    }
    if (!found.has('summary')) {
      cv.fix({
        id: 'no-summary',
        severity: 'low',
        title: 'Start with a short summary',
        detail: 'Two or three lines at the top tell a recruiter who you are and what you want, before they read the rest.',
        tip: 'For example: “Data analyst with 4 years in retail, skilled in SQL and Power BI, looking for a senior analyst role.”',
      });
    }
    const standard = ['experience', 'education', 'skills', 'summary'].filter((kind) => found.has(kind));
    if (standard.length >= 3) {
      cv.strong({
        id: 'headings',
        title: 'Clear headings portals recognise',
        detail: standard.map((kind) => HEADING_LABELS[kind]).join(', '),
      });
    }
  },

  function length(cv) {
    const { words } = cv;
    const pages = cv.doc.pages || Math.max(1, Math.round(words / 500));
    const pagesText = cv.doc.pages ? `${pages} page${pages === 1 ? '' : 's'}` : `about ${pages} page${pages === 1 ? '' : 's'}`;
    if (pages >= 4 || words > 1200) {
      cv.fix({
        id: 'too-long',
        severity: 'medium',
        title: 'Cut it down to 2 pages',
        detail: `It’s ${pagesText} and about ${words} words. Most recruiters expect 1 to 2 pages and spend a minute or less on a first read. (Academic and very senior CVs can be longer.)`,
        tip: 'Keep the last 10 years in detail. Shorten older jobs to one line each, and cut points that don’t match the jobs you want.',
      });
    } else if (pages === 3) {
      cv.fix({
        id: 'three-pages',
        severity: 'low',
        title: 'Three pages is long for most roles',
        detail: 'Most recruiters expect 1 to 2 pages. Your strongest points can get lost on page 3.',
        tip: 'Shorten older jobs and drop points that repeat each other.',
      });
    } else if (words < 250) {
      cv.fix({
        id: 'too-short',
        severity: 'medium',
        title: 'Add more detail',
        detail: `With about ${words} words, your CV doesn’t say much about what you’ve done. Recruiters can’t judge what they can’t see.`,
        tip: 'Under each job, add 3 to 5 points about what you achieved, with numbers where you can.',
      });
    } else {
      cv.strong({ id: 'length', title: 'Good length', detail: `${pagesText}, about ${words} words.` });
    }
  },

  function resultsWithNumbers(cv) {
    const { points } = cv;
    if (points.length < 3) return;
    const without = points.filter((point) => !hasNumber(point.text));
    const withCount = points.length - without.length;
    const share = withCount / points.length;
    const sample = [...without].sort((a, b) => wordCount(b.text) - wordCount(a.text));
    const tip = 'Add how many, how much or how often. For example, “Ran weekly sales reports” becomes “Ran weekly sales reports for 12 store managers, cutting prep time from 2 days to 3 hours.”';
    if (share < 0.3) {
      cv.fix({
        id: 'numbers',
        severity: 'high',
        title: 'Show results with numbers',
        detail: `${withCount === 0 ? 'None' : `Only ${withCount}`} of your ${points.length} points include a number. Numbers make results believable and stand out when a recruiter skims.`,
        ...pickQuotes(sample),
        tip,
      });
    } else if (share < 0.5) {
      cv.fix({
        id: 'numbers',
        severity: 'medium',
        title: 'Add numbers to more of your points',
        detail: `${withCount} of your ${points.length} points include a number. Aim for at least half.`,
        ...pickQuotes(sample),
        tip,
      });
    } else {
      cv.strong({ id: 'numbers', title: 'Results backed by numbers', detail: `${withCount} of your ${points.length} points include a number.` });
    }
  },

  function dutiesNotAchievements(cv) {
    const duties = cv.points.filter((point) => DUTY_START.test(point.text));
    if (duties.length === 0) {
      if (cv.points.length >= 3) cv.strong({ id: 'duties', title: 'Points start with what you did', detail: 'No “Responsible for…” lists of duties.' });
      return;
    }
    cv.fix({
      id: 'duties',
      severity: 'medium',
      title: 'Say what you achieved, not your duties',
      detail: `${duties.length === 1 ? 'One point starts' : `${duties.length} points start`} like a job description (“Responsible for…”, “Helped with…”). Recruiters want to know what changed because of you.`,
      ...pickQuotes(duties),
      tip: 'Start with an action word like Led, Built, Cut, Grew, Launched or Improved. For example, “Responsible for onboarding new staff” becomes “Onboarded 25 new starters a year and cut training time from 4 weeks to 2.”',
    });
  },

  function pointStyle(cv) {
    const long = cv.points.filter((point) => wordCount(point.text) > 40);
    if (long.length > 0) {
      cv.fix({
        id: 'long-points',
        severity: 'low',
        title: 'Shorten long points',
        detail: `${long.length === 1 ? 'One point is' : `${long.length} points are`} over 40 words. Points of 1 to 2 lines are easier to skim.`,
        ...pickQuotes(long),
        tip: 'Keep the action and the result, and cut the background. Split a point in two if it covers two things.',
      });
    }
    const firstPerson = cv.points.filter((point) => FIRST_PERSON.test(point.text));
    if (firstPerson.length > 0) {
      cv.fix({
        id: 'first-person',
        severity: 'low',
        title: 'Drop “I” and “my” from your points',
        detail: 'CV points usually leave out “I” and “my”. It saves space and reads more confidently.',
        ...pickQuotes(firstPerson),
        tip: 'For example, “I managed my team’s budget” becomes “Managed a $200k team budget.”',
      });
    }
    const odd = cv.lines.filter((line) => line.marker && /[-➢➤►▸✓✔❖◆◇]/.test(line.marker));
    if (odd.length > 0) {
      cv.fix({
        id: 'bullet-symbols',
        severity: 'low',
        title: 'Use plain round bullets',
        detail: 'Some of your bullets are special symbols (arrows, ticks or Word symbol-font characters). Some portals turn them into strange characters.',
        ...pickQuotes(odd.map((line) => ({ text: `${line.marker} ${line.text}`, page: line.page }))),
        tip: 'Use the standard round bullet (•) or a simple dash.',
      });
    }
  },

  function dates(cv) {
    const experience = cv.sections.lines.filter((line) => line.section === 'experience');
    const examples = { short: null, long: null, numeric: null };
    for (const line of cv.lines) {
      for (const match of line.text.matchAll(NAMED_DATE_ALL)) {
        const month = match[1].toLowerCase().replace('.', '');
        if (month === 'may') continue;
        const style = FULL_MONTHS.has(month) ? 'long' : 'short';
        examples[style] ??= { text: line.text, page: line.page, date: match[0] };
      }
      for (const match of line.text.matchAll(NUMERIC_DATE_ALL)) examples.numeric ??= { text: line.text, page: line.page, date: match[0] };
    }
    const styles = Object.values(examples).filter(Boolean);
    if (styles.length >= 2) {
      cv.fix({
        id: 'date-styles',
        severity: 'low',
        title: 'Write dates the same way',
        detail: `Your CV mixes date styles, like ${styles.map((example) => `“${example.date}”`).join(' and ')}. Consistent dates look careful and are easier for portals to read.`,
        ...pickQuotes(styles),
        tip: 'Pick one style, like “Mar 2021 – Present”, and use it everywhere.',
      });
    }

    const starts = [];
    for (const line of experience) {
      for (const match of line.text.matchAll(rangeAll())) {
        const value = dateValue(match[1]);
        if (value !== null) starts.push({ value, text: line.text, page: line.page });
      }
    }
    if (experience.length >= 3 && starts.length === 0) {
      cv.fix({
        id: 'no-dates',
        severity: 'medium',
        title: 'Add dates to your jobs',
        detail: 'No start and end dates were found under Experience. Recruiters and portals use them to work out how much experience you have.',
        tip: 'Give each job a month and year, like “Mar 2021 – Present”.',
      });
      return;
    }
    let up = 0;
    let down = 0;
    for (let i = 1; i < starts.length; i += 1) {
      if (starts[i].value > starts[i - 1].value + 1) up += 1;
      else if (starts[i].value < starts[i - 1].value) down += 1;
    }
    if (up > 0 && up >= down) {
      cv.fix({
        id: 'date-order',
        severity: 'medium',
        title: 'Put your most recent job first',
        detail: 'Your jobs look like they’re listed oldest first. Recruiters expect the most recent one at the top.',
        ...pickQuotes(starts.slice(0, 3)),
        tip: 'Reorder your Experience section so your current or latest job comes first.',
      });
    } else if (starts.length >= 2 && styles.length < 2) {
      cv.strong({ id: 'dates', title: 'Dates are clear', detail: 'One date style, most recent job first.' });
    }
  },

  function spelling(cv) {
    const found = new Map();
    const quotes = [];
    for (const line of cv.lines) {
      let hit = false;
      for (const word of line.text.match(/[A-Za-z][A-Za-z']*/g) ?? []) {
        const fix = MISSPELLINGS[word.toLowerCase()];
        if (fix) {
          found.set(word.toLowerCase(), fix);
          hit = true;
        }
      }
      const repeated = /\b([A-Za-z]{2,})\s+\1\b/i.exec(line.text);
      if (repeated && !/^(had|that)$/i.test(repeated[1])) {
        found.set(`${repeated[1].toLowerCase()} ${repeated[1].toLowerCase()}`, repeated[1].toLowerCase());
        hit = true;
      }
      if (hit) quotes.push(line);
    }
    if (found.size === 0) {
      cv.strong({ id: 'spelling', title: 'None of the common misspellings', detail: 'This is a basic check for about 100 mistakes often seen on CVs, not a full spelling check. Run your word processor’s spell check too.' });
      return;
    }
    cv.fix({
      id: 'spelling',
      severity: 'medium',
      title: found.size === 1 ? 'Fix a spelling mistake' : `Fix ${found.size} spelling mistakes`,
      detail: `${[...found].slice(0, 6).map(([wrong, right]) => `“${wrong}” should be “${right}”`).join(', ')}. One typo can be enough for some recruiters to stop reading.`,
      ...pickQuotes(quotes),
      tip: 'Fix these, then read your CV aloud or run your word processor’s spell check. A full spelling and grammar check comes with the AI review.',
    });
  },

  function overusedPhrases(cv) {
    const lower = cv.text.toLowerCase();
    const phrases = CLICHES.filter((phrase) => new RegExp(`(^|[^a-z])${phrase.replace(/[-\s]/g, '[-\\s]?')}([^a-z]|$)`).test(lower));
    if (phrases.length > 0) {
      const unique = [...new Set(phrases.map((phrase) => phrase.replace(/-/g, ' ')))];
      const lines = cv.lines.filter((line) => unique.some((phrase) => line.text.toLowerCase().replace(/-/g, ' ').includes(phrase)));
      cv.fix({
        id: 'cliches',
        severity: 'low',
        title: 'Show it instead of saying it',
        detail: `Phrases like ${unique.slice(0, 3).map((phrase) => `“${phrase}”`).join(', ')} are on most CVs, so recruiters skip over them.`,
        ...pickQuotes(lines),
        tip: 'Replace each one with proof. Instead of “team player”, say what you did together: “Worked with sales and finance to launch a pricing tool used by 300 staff.”',
      });
    }
    const references = cv.lines.filter((line) => REFERENCES_LINE.test(line.text));
    if (references.length > 0) {
      cv.fix({
        id: 'references-line',
        severity: 'low',
        title: 'Leave out “References available on request”',
        detail: 'Employers assume you’ll give references when asked. The line takes up space you could use to sell yourself.',
        ...pickQuotes(references),
        tip: 'Delete the line. Have your referees’ details ready for when you’re asked.',
      });
    }
  },

  function matchesProfileAndLinkedin(cv) {
    const missing = [];
    let compared = 0;
    for (const job of cv.profile?.experience ?? []) {
      const company = normCompany(job.company);
      if (company.trim().length < 2) continue;
      compared += 1;
      if (!cv.normText.includes(company)) {
        missing.push({ text: `In your profile: ${[job.title, job.company].filter(Boolean).join(' at ')}`, page: 0 });
      } else if (job.title && !cv.normText.includes(norm(job.title))) {
        missing.push({ text: `In your profile: “${job.title}” at ${job.company}, a different job title`, page: 0 });
      }
    }
    for (const role of cv.linkedin ? linkedinRoles(cv.linkedin) : []) {
      compared += 1;
      if (!cv.normText.includes(norm(role.title))) missing.push({ text: `On your LinkedIn: ${role.title} (${role.dates})`, page: 0 });
    }
    if (compared === 0) return;
    if (missing.length === 0) {
      cv.strong({ id: 'matches', title: cv.linkedin ? 'Matches your LinkedIn' : 'Matches your profile', detail: 'The jobs and titles line up.' });
      return;
    }
    cv.fix({
      id: 'mismatch',
      severity: 'low',
      title: cv.linkedin ? 'Your CV and LinkedIn don’t match' : 'Your CV and profile don’t match',
      detail: 'Recruiters often compare the two. Leaving out an old or short job is fine, but recent jobs and titles should match.',
      ...pickQuotes(missing),
      tip: 'Use the same job titles and company names in both, or update whichever one is out of date.',
    });
  },

  function targetRoles(cv) {
    const roles = (cv.profile?.targetRoles ?? '').split(',').map((role) => role.trim()).filter(Boolean);
    if (roles.length === 0) return;
    const mentioned = roles.filter((role) => cv.normText.includes(norm(role)));
    if (mentioned.length > 0) {
      cv.strong({ id: 'target-roles', title: 'Mentions the roles you want', detail: mentioned.join(', ') });
      return;
    }
    cv.fix({
      id: 'target-roles',
      severity: 'low',
      title: 'Mention the roles you want',
      detail: `Your profile says you want ${roles.slice(0, 3).map((role) => `“${role}”`).join(' or ')} roles, but your CV never uses ${roles.length === 1 ? 'that title' : 'those titles'}. Portals rank CVs by matching words like these.`,
      tip: `Use the job title in your summary, for example: “${roles[0]} with…”.`,
    });
  },

  function skillsFromProfile(cv) {
    const skills = cv.profile?.skills ?? [];
    if (skills.length === 0) return;
    const missing = skills.filter((skill) => norm(skill).trim() && !cv.normText.includes(norm(skill)));
    if (missing.length === 0) {
      cv.strong({ id: 'skills', title: 'Lists your skills', detail: 'Every skill in your profile is on your CV.' });
      return;
    }
    cv.fix({
      id: 'missing-skills',
      severity: 'low',
      title: missing.length === 1 ? 'A skill from your profile is missing' : `${missing.length} skills from your profile are missing`,
      detail: 'These are in your profile but not on your CV. Portals match skills like these to the job ad.',
      quotes: [{ text: missing.slice(0, 12).join(', '), page: 0 }],
      more: 0,
      tip: 'If you have them, add them to your Skills section, and use them in a point that shows how you used them.',
    });
  },
];

export const CHECK_COUNT = CHECKS.length;

// ---- Running the check ----

export function checkCv(doc, { profile = null, linkedin = null } = {}) {
  const lines = doc.lines.filter((line) => line.text);
  const text = lines.map((line) => line.text).join('\n');
  const words = wordCount(text);
  const fixes = [];
  const strengths = [];

  if (words < 40) {
    return {
      status: 'unreadable',
      fixes: [{
        id: 'no-text',
        severity: 'high',
        title: 'Portals can’t read your CV',
        detail: doc.format === 'pdf'
          ? 'Almost no text could be read from this PDF. It’s probably a scan or a picture of your CV, which portals see as blank.'
          : 'Almost no text could be read from this file.',
        quotes: [],
        more: 0,
        tip: 'Export your CV straight from Word, Google Docs or Pages as a PDF or .docx, rather than scanning or photographing it.',
      }],
      strengths: [],
      stats: { pages: doc.pages, words, points: 0, pointsWithNumbers: 0 },
      checks: CHECK_COUNT,
    };
  }

  const sections = findSections(lines);
  const experienceLines = sections.found.has('experience')
    ? sections.lines.filter((line) => line.section === 'experience')
    : sections.lines.filter((line) => !['education', 'skills', 'summary'].includes(line.section));
  const points = findPoints(experienceLines, doc.format);

  const cv = {
    doc,
    lines,
    text,
    normText: norm(`${text} ${doc.layout.headerText}`),
    words,
    sections,
    points,
    profile,
    linkedin,
    fix: (item) => fixes.push({ quotes: [], more: 0, ...item }),
    strong: (item) => strengths.push(item),
  };
  for (const check of CHECKS) check(cv);

  fixes.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  return {
    status: 'ok',
    fixes,
    strengths,
    stats: { pages: doc.pages, words, points: points.length, pointsWithNumbers: points.filter((point) => hasNumber(point.text)).length },
    checks: CHECK_COUNT,
  };
}
