// Text for the privacy policy, data disclosure, product disclosure statement,
// terms of use and help pages. These are DRAFTS. Fill in the [square brackets]
// and have them reviewed by a qualified professional before public launch, and
// update them before version 2's online features go live.
//
// They describe:
//   - your applications, profile, files and CV check results, kept on the device, and
//     in your account too if you're signed in (see js/sync.js), and
//   - analytics cookies, only with consent (cookie banner, or Settings → Analytics
//     cookies), to improve your experience. See js/analytics.js.
//
// Each page: { title, updated, draft, intro, sections: [{ heading, paragraphs?, list?, after?, table? }] }
// In a section, `paragraphs` show first, then `list`, then `after`, then `table`.

import { APP_NAME } from '../config.js';

const UPDATED = '22 November 2026';
const SETTING = 'Profile → menu (three lines) → Analytics cookies';

export const LEGAL_PAGES = {
  privacy: {
    title: 'Privacy policy',
    updated: UPDATED,
    draft: true,
    intro:
      'Without an account, your applications, profile and files stay on your device. With an account, they’re also kept in your account, so they’re on every device you use. If you accept analytics cookies, we also collect anonymous usage data to improve your experience. You can change your mind at any time.',
    sections: [
      {
        heading: 'Who we are',
        paragraphs: [`${APP_NAME} is made by [your name or company] (“we”). You can contact us at [contact email].`],
      },
      {
        heading: 'What the app keeps',
        list: [
          'Your applications: company, job title, portal, the email you used to sign up, links, dates, notes and status history.',
          'Your profile: name, headline, location, contact details, summary, experience, education, projects, certifications and skills.',
          'Your CV and LinkedIn files, if you add them.',
          'CV check results: your score, how many things there are to fix, and the suggestions you chose to ignore.',
          'Preferences, such as light or dark mode and how lists are sorted.',
        ],
        after: [
          'Without an account, all of this stays in your browser’s storage on this device, and we can’t see it.',
          'With an account, it’s also kept in your account (see “If you create an account”). Your device keeps a copy too, so the app works with no signal.',
          'None of it is part of the analytics data below.',
        ],
      },
      {
        heading: 'Reading your CV',
        paragraphs: [
          'The CV check and “Fill in my profile from my CV” read your CV and LinkedIn PDF on your device, using readers that are part of the app. Your files aren’t sent anywhere to be read.',
          'If your CV is a scanned image, the app can read it with OCR (text recognition), also on your device. The first time, it downloads the OCR engine (about 5 MB) from the same place as the app.',
          'If you’re signed in, the files themselves and your CV check results are kept in your account, like the rest of your data, so they’re on your other devices too.',
          'If you’ve accepted analytics cookies, we only learn that one of these features was used. We never learn what your CV says, what it scored, or what was filled in.',
        ],
      },
      {
        heading: 'Analytics cookies, to improve your experience',
        paragraphs: ['If you accept analytics cookies, on the cookie banner or in Settings, we collect:'],
        list: [
          'Which screens and features you use, and when. For example, that the CV check was run or a profile was filled in from a CV, but never what it contained. Screen addresses are recorded without the ids of your applications.',
          'The app version, and whether you’re using the phone or computer layout.',
          'Whether you’re signed in, but not who you are.',
          'A random ID for your device, kept in an analytics cookie for 13 months from your last visit, so we can count how many people use the app and how often they come back. It isn’t linked to your name, email or account.',
        ],
        after: ['Like any website request, sending this data reveals your IP address to our database provider (below), which may keep it in its own short-term logs. We don’t store it with the analytics data.'],
      },
      {
        heading: 'What we don’t collect',
        list: [
          'The content of your applications or notes, including company names and job titles.',
          'Your profile details, email address, phone number, CV or LinkedIn files, for analytics.',
          'Passwords for any job portal. The app never asks for them.',
        ],
        after: ['If a future feature needs any of this to work better, we’ll ask you separately first. Saying no won’t affect the rest of the app.'],
      },
      {
        heading: 'How we use analytics data',
        list: [
          'To improve your experience: to learn which features help most, and which are confusing.',
          'To find where people get stuck, so we can fix it.',
          'To make the app faster and easier to use.',
          'To decide what to build next.',
          'To produce overall statistics, such as how many people use the app each month.',
        ],
      },
      {
        heading: 'Your choice',
        paragraphs: [
          `Analytics cookies are only used if you accept them on the cookie banner or switch them on in ${SETTING}. Until you choose, nothing is collected. You can switch them off at any time: we stop collecting straight away, and the analytics cookie is removed from your device. Saying no doesn’t affect anything else in the app.`,
          'To ask us to delete analytics data we already hold, contact us at [contact email].',
        ],
      },
      {
        heading: 'Who handles your data',
        paragraphs: [
          'Supabase, our database and account provider, stores account data, synced data and analytics data for us on servers in Sydney, Australia. It may only use it to provide that service to us. Only you can read your account data through the app; analytics data can only be read by us. [Link to Supabase’s privacy policy.]',
        ],
      },
      {
        heading: 'How long we keep it',
        paragraphs: [
          'Account data, including your synced applications, profile and files, is kept until you delete it or your account.',
          'We keep analytics data for [14 months], then delete it. Overall statistics that can’t identify anyone may be kept for longer.',
        ],
      },
      {
        heading: 'What we never do',
        list: [
          'Sell your information.',
          'Use your information for advertising.',
          'Track you across other apps or websites. Our cookies only work on Foliofy.',
        ],
      },
      {
        heading: 'Cookies',
        paragraphs: ['Our Cookie policy lists every cookie and what’s stored on your device, and why: Settings → Cookie policy.'],
      },
      {
        heading: 'Hosting',
        paragraphs: [
          'GitHub Pages hosts the app’s files and may keep standard server logs, such as IP addresses and the times pages were loaded, to keep the service running and secure. [Link to GitHub’s privacy statement.]',
        ],
      },
      {
        heading: 'If you create an account',
        paragraphs: [
          'An account is optional. If you create one, your email address, a securely scrambled copy of your password (never the password itself), when you signed up, and what you agreed to (age, terms and privacy policy, and whether you want emails about Foliofy) are stored by Supabase on servers in Sydney, Australia.',
          'While you’re signed in, your applications, profile, CV and LinkedIn files and CV check results are kept in your account, so they appear on every device you sign in on and are backed up. Files are kept in private storage that only your account can open. If you sign out, everything stays on the device too.',
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
          'Later versions will add optional features such as reading your Gmail, writing cover letters, and an AI review of your CV. Before any of these goes live, we’ll update this policy, and the app will ask for your permission first.',
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

  cookies: {
    title: 'Cookie policy',
    updated: UPDATED,
    draft: true,
    intro: 'What Foliofy stores on your device, and why. Only analytics cookies need your OK; the rest is needed for the app to work.',
    sections: [
      {
        heading: 'Needed for the app to work',
        paragraphs: ['These are always on, because the app can’t work without them. They stay on your device and aren’t used to track you.'],
        table: {
          columns: ['What', 'Why', 'How long'],
          rows: [
            ['Your data (browser storage)', 'Your applications, profile and files, so the app works on this device, even with no signal', 'Until you delete it'],
            ['Sign-in (browser storage)', 'Keeps you signed in, if you have an account', 'Until you sign out'],
            ['Settings (browser storage)', 'Light or dark mode, sort order, prompts you’ve dismissed, sync progress', 'Until you clear your browser'],
            ['foliofy_consent (cookie)', 'Remembers your answer on the cookie banner', '12 months'],
          ],
        },
      },
      {
        heading: 'Analytics cookies, to improve your experience',
        paragraphs: ['Only if you accept them. They help us see how the app is used, so we can improve your experience.'],
        table: {
          columns: ['What', 'Why', 'How long'],
          rows: [
            ['foliofy_id (cookie)', 'A random ID for your device, so we can count how many people use the app and how often they come back. Not linked to your name, email or account.', '13 months from your last visit'],
          ],
        },
        after: ['What’s collected with it is listed in the Privacy policy, under “Analytics cookies, to improve your experience”.'],
      },
      {
        heading: 'Changing your mind',
        paragraphs: [`Switch analytics cookies on or off at any time in ${SETTING}. Switching them off removes the analytics cookie straight away.`],
      },
      {
        heading: 'No third-party cookies',
        paragraphs: ['Foliofy doesn’t use advertising cookies, and no other company sets cookies through the app.'],
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
            ['Applications', 'Company, job title, portal, login email, links, dates, notes, status history', 'This device, and your account if you’re signed in (Supabase, Sydney)', 'No one; Supabase stores it for us'],
            ['Profile', 'Name, headline, location, contact details, summary, experience, education, projects, certifications, skills', 'This device, and your account if you’re signed in (Supabase, Sydney)', 'No one; Supabase stores it for us'],
            ['CV and LinkedIn files', 'The files you add', 'This device, and your account’s private storage if you’re signed in', 'No one; Supabase stores it for us'],
            ['CV check results', 'Your score, how many things to fix, and which suggestions you ignored', 'This device, and your account if you’re signed in', 'No one; Supabase stores it for us'],
            ['Preferences', 'Light or dark mode, sort order, dismissed prompts', 'This device', 'No one'],
            ['Backups', 'A copy of your applications, profile, CV and LinkedIn files', 'Wherever you save the file', 'Anyone you give the file to'],
            ['Account (only if you create one)', 'Email address, a scrambled copy of your password, sign-up date, what you agreed to', 'Supabase, in Sydney', 'Supabase, which runs it for us'],
            ['Analytics (only if you accept analytics cookies)', 'Screens and features used, app version, phone or computer layout, whether you’re signed in, a random device ID', 'Our database (Supabase, Sydney), for [14 months]', 'Only us'],
          ],
        },
      },
      {
        heading: 'Used to improve the app',
        paragraphs: [
          'Usage data shows us which features work, where people get stuck, and what breaks, so we can fix bugs and build better features. It never includes what you write in the app.',
          `You choose whether to share it, on the cookie banner or in ${SETTING}. Nothing is collected until you accept.`,
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
          'If you accept analytics cookies, we collect anonymous usage data, such as which screens and features are used, to improve your experience. It never includes the content of your applications, profile or files. Nothing is collected until you accept.',
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
          'Back up your data if you don’t have an account, because then it’s kept only on your device.',
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
          'If you accept analytics cookies, you allow us to collect and use usage data, as described in the Privacy policy and Cookie policy, to improve your experience of the app. You can switch them off at any time.',
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
          'An optional account: sign in and your applications, profile, CV and LinkedIn files are the same on every device you use, and backed up.',
          'Tracking applications: status, portal, the email you used, follow-up dates, notes and history.',
          'Filling in your profile from your CV or LinkedIn PDF, on this device and without AI. Scanned CVs are read with OCR.',
          'Checking your CV: a score, what to fix first and what’s already strong.',
          'Adding a follow-up date to your calendar, with a reminder on the day.',
          'Backing up to a file (including your CV) and restoring it, on this phone or a new one.',
        ],
        after: ['Without an account, everything is saved only on this device, so back up now and then.'],
      },
      {
        heading: 'Coming soon',
        list: ['Changing the email you sign in with, and deleting your account from inside the app.'],
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
          'Tap a suggestion to see the lines in your CV it’s about and how to fix them. If one doesn’t apply to you, tap Ignore this suggestion. Your CV is checked on this device. If you’re signed in, the CV and its check are also kept in your account.',
        ],
      },
      {
        heading: 'Backing up',
        paragraphs: [
          'With an account (Settings, Account), your data is backed up to it automatically. Without one, it’s kept only on this device: go to Profile, tap the menu button (three lines), then Backup, restore and storage, and save a backup somewhere safe.',
        ],
      },
      {
        heading: 'Moving to a new phone',
        paragraphs: ['Back up on the old phone, send the file to the new phone, then choose Restore from a backup.'],
      },
      {
        heading: 'Does the app collect my data?',
        paragraphs: [
          `Only what you agree to. Analytics cookies, which share anonymous usage data like which screens you use, are only on if you accept them (${SETTING}). If you create an account, your data is kept in it so it’s on all your devices. Neither ever includes your data in analytics.`,
        ],
      },
      {
        heading: 'Report a problem or share feedback',
        paragraphs: ['[Add a support email or feedback form before launch.]'],
      },
    ],
  },
};
