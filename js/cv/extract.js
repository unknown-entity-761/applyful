// Reads a CV file on this device: its text, line by line, and anything about its
// layout that job portals struggle with. Nothing is uploaded.
//   - PDF: read with pdf.js (app/vendor/pdfjs), loaded only when needed.
//   - Word .docx: unzipped with zip.js and read from its XML.
//   - Old Word .doc files can't be read; the person is asked to save as PDF or .docx.
//
// extractCv(arrayBuffer, { name }) returns:
//   {
//     format: 'pdf' | 'docx',
//     pages: number (0 if unknown),
//     lines: [{ text, page, bullet, marker, heading }]  in reading order
//     layout: { images, tables, textBoxes, columns, headerText }
//   }
// and throws a CvReadError when the file can't be read.

import { listZip, readZipText } from './zip.js';

const MAX_PAGES = 10;

export class CvReadError extends Error {
  /** code: 'old-word' | 'unsupported' | 'damaged' | 'locked' | 'reader' | 'old-browser' */
  constructor(code) {
    super(code);
    this.name = 'CvReadError';
    this.code = code;
  }
}

export async function extractCv(buffer, { name = '' } = {}) {
  const head = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
  const startsWith = (...bytes) => bytes.every((byte, i) => head[i] === byte);

  if (startsWith(0x25, 0x50, 0x44, 0x46)) return readPdf(buffer); // %PDF
  if (startsWith(0x50, 0x4b)) return readDocx(buffer); // PK (zip)
  if (startsWith(0xd0, 0xcf, 0x11, 0xe0) || /\.doc$/i.test(name)) throw new CvReadError('old-word');
  throw new CvReadError('unsupported');
}

// ---- Shared ----

// Bullet characters people use, including the private-use ones Word's Symbol font produces.
const BULLET = /^\s*([•●▪◦‣∙·■□▸►➢➤✓✔❖◆◇○\-–—*>-]|o(?=\s))\s*/;

function tidy(text) {
  return text.replace(/[​-‍﻿­]/g, '').replace(/\s+/g, ' ').trim();
}

function makeLine(rawText, page, heading = false, bullet = false) {
  let text = tidy(rawText);
  let marker = '';
  const match = BULLET.exec(text);
  // A dash followed by a date ("- 2021") or a lone symbol isn't a bullet point.
  if (match && text.length > match[0].length && !/^[-–—]\s*\d/.test(text)) {
    marker = match[1];
    text = text.slice(match[0].length);
  }
  return { text, page, bullet: bullet || Boolean(marker), marker, heading };
}

// ---- PDF ----

let pdfjsPromise = null;

function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('../../vendor/pdfjs/pdf.min.mjs')
      .then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
        return pdfjs;
      })
      .catch((error) => {
        pdfjsPromise = null; // try again next time, e.g. once back online
        console.warn('pdf.js did not load:', error);
        throw new CvReadError('reader');
      });
  }
  return pdfjsPromise;
}

async function readPdf(buffer) {
  const pdfjs = await loadPdfJs();
  // pdf.js takes ownership of the bytes it's given, so it gets a copy.
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer.slice(0)),
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
  });
  let pdf;
  try {
    pdf = await task.promise;
  } catch (error) {
    task.destroy();
    throw new CvReadError(error?.name === 'PasswordException' ? 'locked' : 'damaged');
  }

  const pageCount = pdf.numPages;
  const lines = [];
  let images = 0;
  let columns = false;
  const imageOps = new Set(
    ['paintImageXObject', 'paintInlineImageXObject', 'paintImageMaskXObject', 'paintImageXObjectRepeat', 'paintInlineImageXObjectGroup']
      .map((op) => pdfjs.OPS[op])
      .filter((op) => op !== undefined),
  );

  try {
    for (let number = 1; number <= Math.min(pageCount, MAX_PAGES); number += 1) {
      const page = await pdf.getPage(number);
      const { width } = page.getViewport({ scale: 1 });
      const { items } = await page.getTextContent();
      lines.push(...pdfLines(items, number));
      if (hasColumns(items, width)) columns = true;
      const { fnArray } = await page.getOperatorList();
      images += fnArray.filter((op) => imageOps.has(op)).length;
      page.cleanup();
    }
  } catch (error) {
    console.warn('Could not read the PDF:', error);
    throw new CvReadError('damaged');
  } finally {
    task.destroy();
  }

  return { format: 'pdf', pages: pageCount, lines, layout: { images, tables: 0, textBoxes: 0, columns, headerText: '' } };
}

/** Joins pdf.js text pieces into lines, in the order the file stores them. */
function pdfLines(items, page) {
  const lines = [];
  let text = '';
  let lastY = null;
  let lastEnd = null;
  let lastSize = 0;

  const flush = () => {
    if (tidy(text)) lines.push(makeLine(text, page));
    text = '';
    lastY = null;
    lastEnd = null;
  };

  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    const x = item.transform[4];
    const y = item.transform[5];
    const size = Math.abs(item.transform[3]) || item.height || 10;

    if (lastY !== null) {
      const newLine = Math.abs(y - lastY) > Math.max(size, lastSize) * 0.5 || x < lastEnd - size;
      if (newLine) flush();
      else if (x - lastEnd > size * 0.15 && !/\s$/.test(text) && !/^\s/.test(item.str)) text += ' ';
    }
    text += item.str;
    if (item.str) {
      lastY = y;
      lastEnd = x + (item.width || 0);
      lastSize = size;
    }
    if (item.hasEOL) flush();
  }
  flush();
  return lines;
}

/**
 * True when a page has side-by-side columns: an empty vertical strip in the
 * middle of the page with text on both sides of it, down much of the page.
 */
function hasColumns(items, pageWidth) {
  const BINS = 100;
  const rows = new Map();
  for (const item of items) {
    if (!item.str?.trim() || !item.width) continue;
    const key = Math.round(item.transform[5] / 3);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push([item.transform[4], item.transform[4] + item.width]);
  }
  if (rows.size < 12) return false;

  const cover = new Array(BINS).fill(0);
  for (const spans of rows.values()) {
    const hit = new Array(BINS).fill(false);
    for (const [x0, x1] of spans) {
      const from = Math.max(0, Math.floor((x0 / pageWidth) * BINS));
      const to = Math.min(BINS - 1, Math.floor((x1 / pageWidth) * BINS));
      for (let i = from; i <= to; i += 1) hit[i] = true;
    }
    hit.forEach((isHit, i) => {
      if (isHit) cover[i] += 1;
    });
  }

  const quiet = rows.size * 0.06;
  const busy = rows.size * 0.15;
  for (let i = 20; i < 79; i += 1) {
    if (cover[i] <= quiet && cover[i + 1] <= quiet) {
      const left = Math.max(...cover.slice(0, i));
      const right = Math.max(...cover.slice(i + 2));
      if (left >= busy && right >= busy) return true;
    }
  }
  return false;
}

// ---- Word .docx ----

async function readDocx(buffer) {
  let entries;
  try {
    entries = listZip(buffer);
  } catch {
    throw new CvReadError('damaged');
  }
  const main = entries.get('word/document.xml');
  if (!main) throw new CvReadError(entries.has('[Content_Types].xml') ? 'unsupported' : 'damaged');

  const unzip = async (entry) => {
    try {
      return await readZipText(buffer, entry);
    } catch (error) {
      throw new CvReadError(error.message === 'old-browser' ? 'old-browser' : 'damaged');
    }
  };

  const xml = await unzip(main);
  const lines = docxLines(xml);

  let headerText = '';
  for (const [name, entry] of entries) {
    if (/^word\/(header|footer)\d*\.xml$/.test(name)) {
      headerText += ` ${docxLines(await unzip(entry)).map((line) => line.text).join(' ')}`;
    }
  }

  // Word saves the page count it last showed, which is close enough.
  let pages = 0;
  const appInfo = entries.get('docProps/app.xml');
  if (appInfo) pages = Number(/<Pages>(\d+)<\/Pages>/.exec(await unzip(appInfo))?.[1] ?? 0);

  const count = (pattern) => (xml.match(pattern) ?? []).length;
  return {
    format: 'docx',
    pages,
    lines,
    layout: {
      images: count(/<pic:pic\b/g) + count(/<v:imagedata\b/g),
      tables: count(/<w:tbl[\s>]/g),
      textBoxes: count(/<w:txbxContent\b/g),
      columns: [...xml.matchAll(/<w:cols\b[^>]*\bw:num="(\d+)"/g)].some((match) => Number(match[1]) > 1),
      headerText: tidy(headerText),
    },
  };
}

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decodeXml(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const value = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(value) ? String.fromCodePoint(value) : whole;
    }
    return ENTITIES[code] ?? whole;
  });
}

/** Paragraphs from Word's XML, one line each, noting bullets and headings. */
function docxLines(xml) {
  const lines = [];
  const stack = []; // paragraphs can nest (a text box inside a paragraph)
  let inText = false;

  for (const match of xml.matchAll(/<(\/?)([\w:]+)([^>]*?)(\/?)>|([^<]+)/g)) {
    const [, closing, tag, attrs, selfClosing, textNode] = match;
    const paragraph = stack[stack.length - 1];

    if (textNode !== undefined) {
      if (inText && paragraph) paragraph.text += decodeXml(textNode);
    } else if (tag === 'w:p') {
      if (closing) {
        const done = stack.pop();
        if (done) {
          done.text.split('\n').forEach((part, i) => {
            if (tidy(part)) lines.push(makeLine(part, 0, done.heading, done.bullet && i === 0));
          });
        }
      } else if (!selfClosing) {
        stack.push({ text: '', bullet: false, heading: false });
      }
    } else if (tag === 'w:t') {
      inText = !closing && !selfClosing;
    } else if (paragraph && !closing) {
      if (tag === 'w:tab' && !attrs.trim()) paragraph.text += '\t';
      else if (tag === 'w:br' || tag === 'w:cr') paragraph.text += '\n';
      else if (tag === 'w:numPr') paragraph.bullet = true;
      else if (tag === 'w:pStyle') {
        const style = /w:val="([^"]*)"/.exec(attrs)?.[1] ?? '';
        if (/^(heading|title)/i.test(style)) paragraph.heading = true;
        if (/list|bullet/i.test(style)) paragraph.bullet = true;
      }
    }
  }
  return lines;
}
