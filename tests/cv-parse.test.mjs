// Filling in the profile from a CV or LinkedIn PDF, with plain rules (no AI),
// and merging it so what you typed yourself always wins.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCv } from '../app/js/cv/extract.js';
import { parseCv, parseLinkedIn, isLinkedInExport } from '../app/js/cv/parse.js';
import { mergeIntoProfile, normalizeProfile } from '../app/js/profile.js';
import { loadFixture, wordCv } from './helpers.mjs';

async function readProfile(name) {
  const doc = await extractCv(name.endsWith('.docx') ? wordCv() : await loadFixture(name), { name });
  return isLinkedInExport(doc) ? parseLinkedIn(doc) : parseCv(doc);
}

const jobs = (found) => found.experience.map((job) => [job.title, job.company, job.start, job.current ? 'now' : job.end]);

test('PDF CV: contact details, jobs, education and skills', async () => {
  const found = await readProfile('cv-good.pdf');
  assert.equal(found.firstName, 'Alex');
  assert.equal(found.lastName, 'Morgan');
  assert.equal(found.email, 'alex.morgan@example.com');
  assert.equal(found.phone, '+61 412 345 678');
  assert.equal(found.linkedinUrl, 'https://www.linkedin.com/in/alexmorgan-example');
  assert.equal(found.location, 'Sydney');
  assert.match(found.summary, /^Data analyst with 5 years/);
  assert.deepEqual(jobs(found), [
    ['Senior Data Analyst', 'Contoso Retail', '2022-03', 'now'],
    ['Data Analyst', 'Fabrikam Bank', '2019-01', '2022-02'],
  ]);
  assert.equal(found.experience[0].description.split('\n').length, 4);
  assert.match(found.experience[0].description, /^• Built a weekly sales dashboard/);
  assert.deepEqual(found.education.map((e) => [e.qualification, e.school, e.start, e.end]), [
    ['Bachelor of Commerce (Business Analytics)', 'University of Sydney', '2015-01', '2018-12'],
  ]);
  assert.deepEqual(found.skills, ['SQL', 'Python', 'Power BI', 'Excel', 'Tableau', 'A/B testing', 'stakeholder management', 'data modelling']);
});

test('PDF CV with projects and certifications', async () => {
  const found = await readProfile('cv-full.pdf');
  assert.equal(`${found.firstName} ${found.lastName}`, 'Jordan Tan');
  assert.equal(found.headline, 'Marketing Analyst | Digital Campaigns & Data');
  assert.equal(found.location, 'Kuala Lumpur, Malaysia');
  assert.equal(found.phone, '+60 12-345 6789');
  assert.deepEqual(jobs(found), [
    ['Marketing Analyst', 'Lazada Group', '2023-01', 'now'],
    ['Marketing Intern', 'Grab Holdings', '2022-06', '2022-12'],
  ]);
  assert.equal(found.education[0].school, 'Universiti Malaya');
  assert.deepEqual(found.projects.map((p) => [p.name, p.link, p.end]), [
    ['Campaign ROI Calculator', 'github.com/jordantan/roi-calc', ''],
    ['Customer Segmentation Study', '', '2022-12'],
  ]);
  assert.deepEqual(found.certifications.map((c) => [c.name, c.issuer, c.issued]), [
    ['Google Data Analytics Professional Certificate', 'Coursera', '2023-01'],
    ['HubSpot Inbound Marketing', 'HubSpot', '2022-03'],
  ]);
});

test('LinkedIn PDF: several roles at one company', async () => {
  const found = await readProfile('linkedin.pdf');
  assert.equal(found.headline, 'Senior Data Analyst at Contoso Retail');
  assert.equal(found.location, 'Sydney, New South Wales, Australia');
  assert.deepEqual(jobs(found), [
    ['Senior Data Analyst', 'Contoso Retail', '2022-03', 'now'],
    ['Data Analyst', 'Contoso Retail', '2020-11', '2022-02'],
    ['Data Analyst', 'Fabrikam Bank', '2019-01', '2020-10'],
  ]);
  assert.deepEqual(found.skills, ['SQL', 'Power BI', 'Python']);
  assert.deepEqual(found.certifications.map((c) => [c.name, c.issuer]), [['Google Data Analytics Professional Certificate', 'Google']]);
});

test('Word CV: contact details from the header and skills from a table', async () => {
  const found = await readProfile('cv.docx');
  assert.equal(`${found.firstName} ${found.lastName}`, 'Sam Rivera');
  assert.equal(found.email, 'sam.rivera@example.com');
  assert.equal(found.phone, '+44 7700 900123');
  assert.equal(found.summary, 'Customer success lead with 6 years in SaaS. I help teams keep customers happy & growing.');
  assert.deepEqual(found.skills, ['Salesforce', 'Gainsight', 'Negotiation', 'SQL']);
  assert.deepEqual(jobs(found), [
    ['Customer Success Lead', 'Litware Inc', '2021-06', 'now'],
    ['Account Manager', 'Adventure Works', '2018-02', '2021-05'],
  ]);
  assert.deepEqual(found.education.map((e) => [e.qualification, e.school]), [['Bachelor of Arts', 'Monash University']]);
});

test('two-column CV with no email still gives the name, phone and jobs', async () => {
  const found = await readProfile('cv-weak.pdf');
  assert.equal(`${found.firstName} ${found.lastName}`, 'Jamie Lee');
  assert.equal(found.email, '');
  assert.equal(found.phone, '0400 111 222');
  assert.deepEqual(found.experience.map((job) => job.title), ['Office Assistant', 'Operations Coordinator']);
});

test('merging keeps what you typed and only adds what is missing', async () => {
  const found = await readProfile('cv-good.pdf');
  const current = normalizeProfile({
    firstName: 'Alexandra',
    phone: '0400 000 000',
    skills: ['sql', 'Leadership'],
    experience: [{ id: 'mine', title: 'Senior Data Analyst', company: 'Contoso Retail Pty Ltd', start: '2022-03', current: true, description: 'My own words' }],
  });

  const { profile, filled } = mergeIntoProfile(current, found);

  assert.equal(profile.firstName, 'Alexandra', 'your first name stays');
  assert.equal(profile.phone, '0400 000 000', 'your phone number stays');
  assert.equal(profile.lastName, 'Morgan', 'an empty field is filled in');
  assert.ok(filled.fields.includes('lastName') && !filled.fields.includes('firstName'));

  assert.equal(profile.experience.length, 2, 'the job you already have is not added twice');
  assert.equal(profile.experience[0].description, 'My own words');
  assert.equal(profile.experience[1].company, 'Fabrikam Bank');
  assert.ok(filled.items.has(profile.experience[1].id), 'the added job is marked as from the CV');

  assert.deepEqual(profile.skills.slice(0, 3), ['sql', 'Leadership', 'Python'], 'skills are not repeated in a different case');
  assert.ok(!filled.skills.includes('SQL'));
});
