// Text for the privacy policy, data disclosure, product disclosure statement,
// terms of use and help pages. These are DRAFTS. Fill in the [square brackets]
// and have them reviewed by a qualified professional before public launch, and
// update them before version 2's online features go live.
//
// They describe:
//   - your applications, profile, files and CV check results, kept on the device, and
//     in your account too if you're signed in, or in an online copy for that browser if
//     you choose one without an account (see js/sync.js and js/auth.js), and
//   - analytics cookies, only with consent (cookie banner, or Settings → Analytics
//     cookies), to improve your experience. See js/analytics.js.
//
// Each page: { title, updated, draft, intro, sections: [{ heading, paragraphs?, list?, after?, table? }] }
// In a section, `paragraphs` show first, then `list`, then `after`, then `table`.
// A table cell is text, or { text, note } for a smaller second line (like a cookie's name).

import { APP_NAME } from '../config.js';

const UPDATED = '22 November 2026';
const SETTING = 'Settings → Analytics cookies (on a phone, Settings is the menu button on Profile)';

export const LEGAL_PAGES = {
  privacy: {
    title: 'Privacy policy',
    updated: UPDATED,
    draft: true,
    intro:
      'Without an account, your applications, profile and files stay on your device, plus an online copy for that browser if you choose one. With an account, they’re also kept in your account, so they’re on every device you use. If you accept analytics cookies, we also collect anonymous usage data to improve your experience. You can change your mind at any time.',
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
          'Your CV and LinkedIn files, if you add them, and your earlier CVs (the newest 10), so you can see what you sent each employer.',
          'CV check results: your score, how many things there are to fix, and the suggestions you chose to ignore.',
          'Preferences, such as light or dark mode and how lists are sorted.',
        ],
        after: [
          'Without an account, all of this stays in your browser’s storage on this device. If you choose to keep a copy online, it’s also kept on our server, linked to that browser (see “Online copy without an account”).',
          'With an account, it’s also kept in your account (see “If you create an account”). Your device keeps a copy too, so the app works with no signal.',
          'None of it is part of the analytics data below.',
        ],
      },
      {
        heading: 'Reading your CV',
        paragraphs: [
          'The CV check and “Fill in my profile from my CV” read your CV and LinkedIn PDF on your device, using readers that are part of the app. Your files aren’t sent anywhere to be read.',
          'If your CV is a scanned image, the app can read it with OCR (text recognition), also on your device. The first time, it downloads the OCR engine (about 5 MB) from the same place as the app.',
          'If you’re signed in, the files themselves and your CV check results are kept in your account, like the rest of your data, so they’re on your other devices too. If you keep an online copy without an account, they’re kept in it.',
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
          'Supabase, our database and account provider, stores account data, synced data, online copies and analytics data for us on servers in Sydney, Australia. It may only use it to provide that service to us. Only you can read your account data through the app; analytics data can only be read by us. [Link to Supabase’s privacy policy.]',
        ],
      },
      {
        heading: 'How long we keep it',
        paragraphs: [
          'Account data, including your synced applications, profile and files, is kept until you delete it or your account.',
          'An online copy kept without an account is deleted when you turn it off, or when you log in or create an account in that browser (if you agree, its data moves into the account). If the copy can no longer be reached, for example because that browser’s data was cleared, or that browser hasn’t opened Foliofy for 12 months, it’s deleted after 12 months unused.',
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
        heading: 'Gmail, if you connect it',
        paragraphs: [
          'Connecting Gmail is optional (Settings → Gmail). Google asks you to allow read-only access: Foliofy can’t send, delete or change your email.',
          'Your email is read on your device, straight from Google, and never sent to our server. The app looks only at job emails: application confirmations, assessment and interview invites, offers and rejections. From those it saves, on your applications: the company, job title, job number, portal, status, the email address you applied with, a link to the email in Gmail, and the name, job title, email address and phone number of a recruiter who writes to you. These are kept like the rest of your applications (on your device, and in your account or online copy if you use one).',
          'The permission Google gives lasts about an hour and is kept only in the app’s memory, never saved. Disconnecting Gmail in Settings withdraws it; you can also remove Foliofy at myaccount.google.com/permissions. Disconnecting clears the list of email changes on this device; applications already added stay.',
          'Google’s sign-in window is on Google’s own site, under Google’s privacy policy. Foliofy loads Google’s sign-in code only when you open the Gmail screens.',
          'Foliofy’s use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. We don’t use Gmail data for advertising, don’t sell it, don’t let people read it, and don’t use it to train AI.',
        ],
      },
      {
        heading: 'Online copy without an account',
        paragraphs: [
          'Without an account, the app asks you once whether to keep a copy online. If you say yes, your applications, profile (which can include your name and contact details), CV and LinkedIn files and CV check results are kept on our server (Supabase, in Sydney, Australia). The copy is held under a random ID instead of an account, so no email address or password is attached to it. Files are kept in private storage.',
          'Only the browser that made the copy can open it. So it brings your data back if the app’s storage on that device is lost, but not if you clear that browser’s data or change devices. For that, create an account.',
          'You can turn it on or off at any time in Settings → Backup, restore and storage. Turning it off deletes the online copy (straight away, or as soon as you’re back online). If you sign in to an account later, you’re asked again after you sign out.',
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
          'Later versions will add optional AI features, such as writing cover letters and an AI review of your CV. Before any of these goes live, we’ll update this policy, and the app will ask for your permission first.',
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
            [{ text: 'Your data', note: 'Browser storage' }, 'Your applications, profile and files, so the app works on this device, even with no signal', 'Until you delete it'],
            [{ text: 'Sign-in', note: 'Browser storage' }, 'Keeps you signed in if you have an account, or links this browser to its online copy if you keep one', 'Until you sign out or turn the online copy off'],
            [{ text: 'Settings', note: 'Browser storage' }, 'Light or dark mode, sort order, prompts you’ve dismissed, sync progress', 'Until you clear your browser'],
            [{ text: 'Cookie choice', note: 'Cookie: foliofy_consent' }, 'Remembers your answer on the cookie banner', '12 months'],
          ],
        },
      },
      {
        heading: 'Analytics cookies, to improve your experience',
        paragraphs: ['Only if you accept them. They help us see how the app is used, so we can improve your experience.'],
        table: {
          columns: ['What', 'Why', 'How long'],
          rows: [
            [{ text: 'Analytics ID', note: 'Cookie: foliofy_id' }, 'A random ID for your device, so we can count how many people use the app and how often they come back. Not linked to your name, email or account.', '13 months from your last visit'],
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
        paragraphs: ['Foliofy doesn’t use advertising cookies, and no other company sets cookies through the app. If you connect Gmail, you sign in to Google in Google’s own window, on Google’s site, under Google’s cookie and privacy policies.'],
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
            ['Applications', 'Company, job title, portal, login email, links, dates, notes, status history', 'This device, plus your account or online copy (Supabase, Sydney)', 'No one; Supabase stores it for us'],
            ['Profile', 'Name, headline, location, contact details, summary, experience, education, projects, certifications, skills', 'This device, plus your account or online copy (Supabase, Sydney)', 'No one; Supabase stores it for us'],
            ['CV and LinkedIn files', 'The files you add, and your earlier CVs (the newest 10)', 'This device, plus private storage in your account or online copy', 'No one; Supabase stores it for us'],
            ['CV check results', 'Your score, how many things to fix, and which suggestions you ignored', 'This device, plus your account or online copy', 'No one; Supabase stores it for us'],
            ['Preferences', 'Light or dark mode, sort order, dismissed prompts', 'This device', 'No one'],
            ['Backups', 'A copy of your applications, profile, CV and LinkedIn files', 'Wherever you save the file', 'Anyone you give the file to'],
            ['From your email (only if you connect Gmail)', 'Read on your device. Saved on applications: company, job title, job number, portal, status, the email you applied with, a link to the email, and recruiter contact details', 'With your applications', 'No one; your emails never reach our server'],
            ['Online copy (only if you choose one, without an account)', 'The four rows above, under a random ID instead of an account (no email address or password)', 'Supabase, in Sydney, until you turn it off or 12 months unused', 'Supabase, which runs it for us'],
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
          'If you choose to use the AI tools (cover letters, job match and the AI review of your CV), the app will explain exactly what it sends and where before you agree.',
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
          'Back up your data if you don’t have an account, because then it’s kept only on your device (and in an online copy only that browser can open, if you keep one).',
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
          'Without an account, an optional online copy that this browser can bring back if the app’s storage is lost.',
          'Tracking applications: status, portal, the email you used, follow-up dates, notes and history.',
          'Filling in your profile from your CV or LinkedIn PDF, on this device and without AI. Scanned CVs are read with OCR.',
          'Checking your CV: a score, what to fix first and what’s already strong.',
          'A CV history: your earlier CVs are kept with their CV check score, and each application can say which CV you sent.',
          'Adding a follow-up date to your calendar, with a reminder on the day.',
          'Backing up to a file (including your CV) and restoring it, on this phone or a new one.',
        ],
        after: ['Without an account, everything is saved on this device (and its online copy, if you keep one), so back up to a file now and then.'],
      },
      {
        heading: 'Coming soon',
        list: [
          'Adding and updating applications from your Gmail, with recruiter contacts. It’s built and being set up with Google; Settings → Gmail says when it’s ready.',
          'Changing the email you sign in with, and deleting your account from inside the app.',
        ],
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
          'Foliofy is a preview, so some features aren’t built yet. To see what’s coming, open Settings (on a phone, the menu button on Profile), then What’s coming.',
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
          'Tap a suggestion to see the lines in your CV it’s about and how to fix them. If one doesn’t apply to you, tap Ignore this suggestion. Your CV is checked on this device. If you’re signed in, the CV and its check are also kept in your account (or in your online copy, if you keep one).',
        ],
      },
      {
        heading: 'Adding applications from your email',
        paragraphs: [
          'Connect Gmail in Settings → Gmail, then tap Check Gmail now on Activity. A confirmation email adds the application; later emails move it on (assessment, interview, offer, rejection), never backwards. Recruiters who write are saved as contacts.',
          'Every change is listed on Activity with Undo. An email that could belong to more than one application, or to none, waits under Needs a look: link it, add it as a new application, or mark it as not a job email.',
        ],
      },
      {
        heading: 'Your earlier CVs',
        paragraphs: [
          'When you add a different CV, the one before it is kept in your CV history (Profile, then CV history), with its CV check score. The newest 10 are kept. You can view any of them, make one your current CV again, or delete it.',
          'When you add an application, it remembers which CV was your current one. You can change it on the application’s Edit screen, under CV sent.',
        ],
      },
      {
        heading: 'Backing up',
        paragraphs: [
          'With an account (Settings, Account), your data is backed up to it automatically. Without one, it’s kept on this device, plus an online copy if you keep one, which only this browser can open. So save a backup file somewhere safe now and then: Settings, then Backup, restore and storage (on a phone, Settings is the menu button on Profile).',
        ],
      },
      {
        heading: 'Moving to a new phone',
        paragraphs: ['Back up on the old phone, send the file to the new phone, then choose Restore from a backup.'],
      },
      {
        heading: 'Does the app collect my data?',
        paragraphs: [
          `Only what you agree to. Analytics cookies, which share anonymous usage data like which screens you use, are only on if you accept them (${SETTING}). If you create an account, your data is kept in it so it’s on all your devices. Without an account, you choose whether to keep an online copy. Analytics never includes your data.`,
        ],
      },
      {
        heading: 'Report a problem or share feedback',
        paragraphs: ['[Add a support email or feedback form before launch.]'],
      },
    ],
  },
};
