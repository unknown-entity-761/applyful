// Shared helpers for the tests: loading the sample CVs, and building a small Word CV.

import { readFile } from 'node:fs/promises';
import { deflateRawSync, crc32 } from 'node:zlib';

const FIXTURES = new URL('./fixtures/', import.meta.url);

/** A sample file from tests/fixtures, as the ArrayBuffer the app's reader expects. */
export async function loadFixture(name) {
  const bytes = await readFile(new URL(name, FIXTURES));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

/** Bytes as an ArrayBuffer. */
export const toArrayBuffer = (bytes) => new Uint8Array(bytes).buffer;

// ---- A Word CV, built here so its content is easy to read and change ----
// It has bullet points, a table of skills, and the contact details in the page
// header, which is what the CV check looks for.

/** A minimal .zip (a .docx is a zip of XML files). */
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const raw = Buffer.from(text);
    const data = deflateRawSync(raw);
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
  const count = Object.keys(files).length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const p = (text, { style, bullet } = {}) =>
  `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${bullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ''}<w:tabs><w:tab w:val="right" w:pos="9000"/></w:tabs></w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const jobLine = (left, right) => `<w:p><w:r><w:t>${left}</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>${right}</w:t></w:r></w:p>`;

const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${p('Sam Rivera', { style: 'Title' })}
${p('Professional Summary', { style: 'Heading1' })}
${p('Customer success lead with 6 years in SaaS. I help teams keep customers happy &amp; growing.')}
${p('Work Experience', { style: 'Heading1' })}
${jobLine('Customer Success Lead, Litware Inc', 'Jun 2021 – Present')}
${p('Grew net revenue retention from 96% to 112% across 80 enterprise accounts.', { bullet: true })}
${p('Responsible for quarterly business reviews with key clients.', { bullet: true })}
${p('Built an onboarding playbook that cut time-to-value from 45 to 21 days.', { bullet: true })}
${jobLine('Account Manager, Adventure Works', 'Feb 2018 – May 2021')}
${p('Managed a book of 120 small business customers worth $1.8m a year.', { bullet: true })}
${p('Helped with renewals and upsell campaigns for the sales team.', { bullet: true })}
${p('Education', { style: 'Heading1' })}
${p('Bachelor of Arts, Monash University, 2014 – 2017')}
${p('Skills', { style: 'Heading1' })}
<w:tbl><w:tblPr/><w:tblGrid/><w:tr><w:tc><w:p><w:r><w:t>Salesforce</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Gainsight</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Negotiation</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>SQL</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:sectPr><w:cols w:space="720"/></w:sectPr>
</w:body></w:document>`;

const HEADER = `<?xml version="1.0"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${p('sam.rivera@example.com | +44 7700 900123')}</w:hdr>`;

export function wordCv() {
  return toArrayBuffer(zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'word/document.xml': DOCUMENT,
    'word/header1.xml': HEADER,
    'docProps/app.xml': '<?xml version="1.0"?><Properties><Pages>1</Pages></Properties>',
  }));
}

// ---- A profile like one someone typed in, for the checks that compare against it ----

export const TYPED_PROFILE = {
  targetRoles: 'Senior data analyst, Analytics lead',
  skills: ['SQL', 'Python', 'Power BI', 'dbt', 'Looker'],
  experience: [
    { title: 'Senior Data Analyst', company: 'Contoso Retail Pty Ltd' },
    { title: 'Data Analyst', company: 'Fabrikam Bank' },
  ],
};
