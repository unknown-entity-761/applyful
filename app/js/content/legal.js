// Text for the privacy policy, data disclosure, product disclosure statement,
// terms of use and help pages. These are DRAFTS. Fill in the [square brackets]
// and have them reviewed by a qualified professional before public launch, and
// update them before version 2's online features go live.
//
// They describe:
//   - your applications, profile, files and CV check results, which stay on the device, and
//   - optional usage data ("Help improve the app" in Settings, off unless switched
//     on), which is collected to improve the service. See js/analytics.js.
//
// Each page: { title, updated, draft, intro, sections: [{ heading, paragraphs?, list?, after?, table? }] }
// In a section, `paragraphs` show first, then `list`, then `after`, then `table`.

import { APP_NAME } from '../config.js';

const UPDATED = '21 November 2026';
const SETTING = 'Profile → menu (three lines) → Help improve the app';

export const LEGAL_PAGES = {
  privacy: {
    title: 'Privacy policy',
    updated: UPDATED,
    draft: true,
    intro:
      'Your applications, profile and files stay on your device. If you agree, the app also shares anonymous usage data with us so we can improve it. You can change your mind at any time.',
    sections: [
      {
        heading: 'Who we are',
        paragraphs: [`${APP_NAME} is made by [your name or company] (“we”). You can contact us at [contact email].`],
      },
      {
        heading: 'What stays on your device',
        list: [
          'Your applications: company, job title, portal, the email you used to sign up, links, dates, notes and status history.',
          'Your profile: name, headline, location, contact details, summary, experience, education, projects, certifications and skills.',
          'Your CV and LinkedIn files, if you add them.',
          'CV check results: your score, the suggestions, the lines they quote from your CV, and the ones you chose to ignore.',
          'Preferences, such as light or dark mode and how lists are sorted.',
        ],
        after: ['All of this is kept in your browser’s storage on this device. We can’t see it, and it isn’t part of the usage data below.'],
      },
      {
        heading: 'Reading your CV',
        paragraphs: [
          'The CV check and “Fill in my profile from my CV” read your CV and LinkedIn PDF on your device, using readers that are part of the app. Your files aren’t uploaded or sent to us, and the results stay on this device.',
          'If your CV is a scanned image, the app can read it with OCR (text recognition), also on your device. The first time, it downloads the OCR engine (about 5 MB) from the same place as the app. Nothing about your CV is sent.',
          'If you’ve switched on Help improve the app, we only learn that one of these features was used. We never learn what your CV says, what it scored, or what was filled in.',
        ],
      },
      {
        heading: 'Usage data we collect to improve the app',
        paragraphs: ['If you turn on Help improve the app, we collect:'],
        list: [
          'Which screens and features you use, and how often. For example, that an application was added or a status was changed, but not what it said.',
          'Errors and crashes, so we can fix them.',
          'Your device type, operating system, browser, screen size, language and app version.',
          'Your approximate country or region, worked out from your internet connection. We don’t keep your full IP address.',
          'A random ID for your device, so we can count how many people use the app. It isn’t linked to your name or email.',
        ],
      },
      {
        heading: 'What we don’t collect',
        list: [
          'The content of your applications or notes, including company names and job titles.',
          'Your profile details, email address, phone number, CV or LinkedIn files.',
          'Passwords for any job portal. The app never asks for them.',
        ],
        after: ['If a future feature needs any of this to work better, we’ll ask you separately first. Saying no won’t affect the rest of the app.'],
      },
      {
        heading: 'How we use usage data',
        list: [
          'To find and fix bugs and crashes.',
          'To learn which features help most, and which are confusing.',
          'To make the app faster and easier to use.',
          'To decide what to build next.',
          'To produce overall statistics, such as how many people use the app each month.',
        ],
      },
      {
        heading: 'Your choice',
        paragraphs: [
          `Usage data is only collected if you switch it on in ${SETTING}. It’s off until you do. You can switch it off at any time, and we’ll stop collecting usage data from your device straight away.`,
          'To ask us to delete usage data we already hold, contact us at [contact email].',
        ],
      },
      {
        heading: 'Who handles usage data',
        paragraphs: [
          'We use [analytics provider] to collect and store usage data for us. They may only use it to provide that service to us. [Link to their privacy policy, and say which country the data is stored in.]',
        ],
      },
      {
        heading: 'How long we keep it',
        paragraphs: [
          'We keep usage data for [14 months], then delete it. Overall statistics that can’t identify anyone may be kept for longer.',
        ],
      },
      {
        heading: 'What we never do',
        list: [
          'Sell your information.',
          'Use your information for advertising.',
          'Track you across other apps or websites.',
        ],
      },
      {
        heading: 'Hosting',
        paragraphs: [
          'The company that hosts the app’s files may keep standard server logs, such as IP addresses and the times pages were loaded, to keep the service running and secure. [Name the host and link to its privacy policy.]',
        ],
      },
      {
        heading: 'If you create an account',
        paragraphs: [
          'An account is optional. If you create one, your email address, a securely scrambled copy of your password (never the password itself), when you signed up, and what you agreed to (age, terms and privacy policy, and whether you want emails about Foliofy) are stored by Supabase, our account service, on servers in Sydney, Australia. [Link to Supabase’s privacy policy.]',
          'Keeping your applications and profile in your account, so they appear on all your devices, is being built next. Until it’s switched on, they stay on each device. This policy will say more before it is.',
          'You can sign out at any time in Settings, Account. To delete your account, contact us at [contact email] until deleting it in the app is added.',
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          'Depending on where you live, you may have the right to access, correct or delete personal information we hold about you, and to complain to your local privacy regulator. Contact us at [contact email] to make a request.',
        ],
      },
      {
        heading: 'Future versions',
        paragraphs: [
          'Later versions will add optional features that need an online service, such as reading your Gmail, writing cover letters, and an AI review of your CV. Before any of these goes live, we’ll update this policy, and the app will ask for your permission first.',
        ],
      },
      {
        heading: 'Children',
        paragraphs: ['The app isn’t intended for children under 16. Creating an account asks you to confirm you’re 16 or older.'],
      },
      {
        heading: 'Changes to this policy',
        paragraphs: ['If this policy changes, we’ll update the date above and let you know in the app.'],
      },
    ],
  },

  data: {
    title: 'Data we collect and keep',
    updated: UPDATED,
    draft: true,
    intro: 'Here’s everything the app keeps, where it’s kept, who can see it, and the optional usage data that helps us improve the service.',
    sections: [
      {
        heading: 'Data in the app',
        table: {
          columns: ['Data', 'What it includes', 'Kept', 'Shared with'],
          rows: [
            ['Applications', 'Company, job title, portal, login email, links, dates, notes, status history', 'This device', 'No one'],
            ['Profile', 'Name, headline, location, contact details, summary, experience, education, projects, certifications, skills', 'This device', 'No one'],
            ['CV and LinkedIn files', 'The files you add', 'This device', 'No one'],
            ['CV check results', 'Your score, the suggestions and the lines they quote from your CV, and which suggestions you ignored', 'This device', 'No one'],
            ['Preferences', 'Light or dark mode, sort order, dismissed prompts', 'This device', 'No one'],
            ['Backups', 'A copy of your applications, profile, CV and LinkedIn files', 'Wherever you save the file', 'Anyone you give the file to'],
            ['Account (only if you create one)', 'Email address, a scrambled copy of your password, sign-up date, what you agreed to', 'Supabase, in Sydney', 'Supabase, which runs it for us'],
            ['Usage data (only if you switch it on)', 'Features used, errors, device and browser type, app version, approximate region, a random device ID', '[Analytics provider], for [14 months]', 'Us, and [analytics provider] on our behalf'],
          ],
        },
      },
      {
        heading: 'Used to improve the app',
        paragraphs: [
          'Usage data shows us which features work, where people get stuck, and what breaks, so we can fix bugs and build better features. It never includes what you write in the app.',
          `You choose whether to share it, in ${SETTING}. It’s off until you switch it on.`,
        ],
      },
      {
        heading: 'Never collected',
        list: [
          'Passwords for Workday, SuccessFactors or any other job portal.',
          'The content of your applications, profile, CV or LinkedIn files, unless you agree to it separately for a specific feature.',
        ],
      },
      {
        heading: 'Coming later',
        paragraphs: [
          'If you choose to connect Gmail or use the AI tools (cover letters, job match and the AI review of your CV), the app will explain exactly what it reads and where it’s sent before you agree. You’ll be able to disconnect at any time.',
        ],
      },
    ],
  },

  pds: {
    title: 'Product disclosure statement',
    updated: UPDATED,
    draft: true,
    intro: `What ${APP_NAME} does, what it doesn’t do, and what you should know before relying on it.`,
    sections: [
      {
        heading: 'What the app is',
        paragraphs: [`${APP_NAME} is a personal tool for recording and organising your job applications, follow-ups and career profile.`],
      },
      {
        heading: 'What the app isn’t',
        list: [
          'It isn’t a recruiter or job board, and it doesn’t apply for jobs on your behalf.',
          'It isn’t connected to, endorsed by or affiliated with any employer, Workday, SAP SuccessFactors, LinkedIn or any other job portal. Those names are trademarks of their owners and are used only to describe where you applied.',
          'It doesn’t guarantee interviews, offers or any other outcome.',
        ],
      },
      {
        heading: 'Suggestions, not predictions',
        paragraphs: [
          'The CV check score and its suggestions, and later job match ratings and cover letters, are there to help you improve your applications. They aren’t predictions of whether you’ll get a job. The CV check follows general rules that may not suit every industry or country, so use your judgement. Always check and edit anything the app writes before you use it.',
        ],
      },
      {
        heading: 'How we improve the app',
        paragraphs: [
          'If you switch on Help improve the app, we collect anonymous usage data, such as which features are used and any errors, to fix problems and improve the service. It never includes the content of your applications, profile or files. It’s off until you switch it on.',
        ],
      },
      {
        heading: 'Testing status',
        paragraphs: ['The app is in testing. Features may change and there may be bugs, so back up your data regularly.'],
      },
      {
        heading: 'Cost',
        paragraphs: ['The app is free while it’s in testing. [Add pricing details before launch.]'],
      },
      {
        heading: 'Your responsibilities',
        list: [
          'Keep the details you enter accurate.',
          'Don’t store passwords in the app. Use a password manager.',
          'Back up your data, because it’s kept only on your device.',
          'Check deadlines and requirements directly with employers.',
        ],
      },
      {
        heading: 'Your data',
        paragraphs: ['See the Privacy policy and Data we collect and keep, in Settings.'],
      },
    ],
  },

  terms: {
    title: 'Terms of use',
    updated: UPDATED,
    draft: true,
    intro: `By using ${APP_NAME}, you agree to these terms. If you don’t agree, please don’t use the app.`,
    sections: [
      {
        heading: 'Your content',
        paragraphs: ['You own everything you enter. You’re responsible for making sure it’s accurate and that you’re allowed to store it.'],
      },
      {
        heading: 'Usage data and feedback',
        paragraphs: [
          'If you switch on Help improve the app, you allow us to collect and use usage data, as described in the Privacy policy, to maintain and improve the app. You can switch it off at any time.',
          'If you send us feedback or suggestions, we may use them to improve the app without owing you anything.',
        ],
      },
      {
        heading: 'Acceptable use',
        paragraphs: ['Don’t use the app to break the law, or to store other people’s personal information without their permission.'],
      },
      {
        heading: 'No warranty',
        paragraphs: ['While it’s in testing, the app is provided “as is”, without warranties of any kind.'],
      },
      {
        heading: 'Limitation of liability',
        paragraphs: [
          'To the extent the law allows, we aren’t liable for lost data, missed opportunities or other losses that come from using the app. Keep your own backups.',
        ],
      },
      {
        heading: 'Changes',
        paragraphs: ['We may update these terms. If we do, we’ll change the date above and let you know in the app.'],
      },
      {
        heading: 'Governing law and contact',
        paragraphs: ['[Add governing law and jurisdiction.] Questions: [contact email].'],
      },
    ],
  },

  coming: {
    title: 'What’s coming',
    updated: '',
    draft: false,
    intro: 'Foliofy is a preview for testers, so some features aren’t built yet. If something seems to be missing, it’s probably on this list.',
    sections: [
      {
        heading: 'What works now',
        list: [
          'A short setup the first time you open the app, to fill in your profile from your CV or by hand.',
          'Tracking applications: status, portal, the email you used, follow-up dates, notes and history.',
          'Filling in your profile from your CV or LinkedIn PDF, on this device and without AI. Scanned CVs are read with OCR.',
          'Checking your CV: a score, what to fix first and what’s already strong.',
          'Adding a follow-up date to your calendar, with a reminder on the day.',
          'Backing up to a file (including your CV) and restoring it, on this phone or a new one.',
        ],
        after: ['In this preview, everything is saved only on this device, so back up now and then.'],
      },
      {
        heading: 'Coming soon',
        list: ['Signing in, so your applications are backed up online and show up on every device you use, phone or computer.'],
      },
      {
        heading: 'Later',
        list: [
          'Signing in with Google or Apple.',
          'Phone notifications for follow-ups, and a nudge when a company hasn’t replied.',
          'Locking the app with a PIN or Face ID.',
          'Apps for Android and iPhone.',
        ],
      },
      {
        heading: 'Further ahead',
        list: [
          'Cover letters and a job match check, written with AI, that you can edit before using.',
          'An AI review of your CV, with rewrites you can accept.',
          'Adding and updating applications from your Gmail, with recruiter contacts.',
          'A new look, more languages, and Foliofy on Google Play and the App Store.',
        ],
      },
      {
        heading: 'Found a problem?',
        paragraphs: ['If something on the “What works now” list doesn’t work, tell us. See Help and feedback.'],
      },
    ],
  },

  help: {
    title: 'Help and feedback',
    updated: '',
    draft: false,
    intro: 'Quick answers to common questions.',
    sections: [
      {
        heading: 'Something missing?',
        paragraphs: [
          'Foliofy is a preview, so some features aren’t built yet. To see what’s coming, go to Profile, tap the menu button (three lines), then What’s coming.',
        ],
      },
      {
        heading: 'Adding an application',
        paragraphs: ['Tap Add in the bar at the bottom. Only the company and job title are required.'],
      },
      {
        heading: 'Follow-ups',
        paragraphs: [
          'Give an application a follow-up date. When it’s due, it shows on Home. Open the application to mark it Done or snooze it for a week.',
          'To get a reminder from your calendar too, open the application and tap Calendar app (iPhone, Outlook and most Android calendars) or Google Calendar.',
        ],
      },
      {
        heading: 'Filling in your profile from your CV',
        paragraphs: [
          'Go to Profile, add your CV or LinkedIn PDF, then tap Fill in my profile from my CV (or from my LinkedIn PDF). The app picks out your details, jobs, education, projects, certifications and skills, and shows them highlighted so you can check them. Nothing is saved until you tap Save profile.',
          'It only adds what’s missing: anything you’ve already typed stays as it is. If your CV is a scanned image, the app offers to read it with OCR, which takes about half a minute.',
        ],
      },
      {
        heading: 'Checking your CV',
        paragraphs: [
          'Go to Profile, add your CV (a PDF or Word .docx file), then tap Check your CV. You’ll see a score, what to fix (most important first) and what’s already strong.',
          'Tap a suggestion to see the lines in your CV it’s about and how to fix them. If one doesn’t apply to you, tap Ignore this suggestion. Your CV is checked on this device and isn’t uploaded.',
        ],
      },
      {
        heading: 'Backing up',
        paragraphs: [
          'Your data is kept only on this device. Go to Profile, tap the menu button (three lines), then Backup, restore and storage, and save a backup somewhere safe.',
        ],
      },
      {
        heading: 'Moving to a new phone',
        paragraphs: ['Back up on the old phone, send the file to the new phone, then choose Restore from a backup.'],
      },
      {
        heading: 'Does the app collect my data?',
        paragraphs: [
          `Only if you switch on Help improve the app (${SETTING}). Then it shares anonymous usage data, like which features you use and any errors. It never includes your applications, profile or files.`,
        ],
      },
      {
        heading: 'Report a problem or share feedback',
        paragraphs: ['[Add a support email or feedback form before launch.]'],
      },
    ],
  },
};
