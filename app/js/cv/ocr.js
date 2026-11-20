// Reads scanned CVs: PDFs whose pages are pictures of text, so there's no text to
// copy. Each page is drawn as an image with pdf.js, then read with Tesseract OCR
// (optical character recognition), all on this device. Nothing is uploaded.
//
// Tesseract is large, so it's only downloaded the first time someone needs it, after
// they agree (about OCR_DOWNLOAD_MB). The browser keeps it for next time.
//
// ocrPdf(buffer, { onProgress }) returns the same shape as extractCv(), with ocr: true.

import { loadPdfJs, makeLine, CvReadError } from './extract.js';

export const OCR_DOWNLOAD_MB = 7;
const MAX_PAGES = 4;
const SCALE = 2.5; // draws an A4 page about 1,500 pixels wide, sharp enough to read

const BASE = new URL('../../vendor/tesseract/', import.meta.url).href;
let tesseractPromise = null;

function loadTesseract() {
  if (!tesseractPromise) {
    tesseractPromise = import('../../vendor/tesseract/tesseract.esm.min.js')
      .then((module) => module.default)
      .catch((error) => {
        tesseractPromise = null;
        console.warn('Tesseract did not load:', error);
        throw new CvReadError('reader');
      });
  }
  return tesseractPromise;
}

/** OCR often reads a bullet "•" as "e", "©", "«" or "»"; turn those back into bullets. */
const fixBullet = (text) => text.replace(/^\s*[eo•*·©®«»>+-]\s+(?=[A-Z0-9])/, '• ');

export async function ocrPdf(buffer, { onProgress = () => {} } = {}) {
  onProgress({ stage: 'loading', progress: 0 });
  const [Tesseract, pdfjs] = await Promise.all([loadTesseract(), loadPdfJs()]);

  let page = 0;
  let pages = 1;
  const worker = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
    workerPath: `${BASE}worker.min.js`,
    corePath: BASE, // a folder: the worker picks the fastest engine build this phone supports
    langPath: BASE,
    gzip: true,
    logger: (message) => {
      if (message.status === 'recognizing text') {
        onProgress({ stage: 'reading', page, pages, progress: ((page - 1) + message.progress) / pages });
      }
    },
  }).catch((error) => {
    console.warn('OCR could not start:', error);
    throw new CvReadError('reader');
  });

  const task = pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)), isEvalSupported: false, verbosity: 0 });
  const lines = [];
  try {
    const pdf = await task.promise;
    pages = Math.min(pdf.numPages, MAX_PAGES);
    for (page = 1; page <= pages; page += 1) {
      const pdfPage = await pdf.getPage(page);
      const viewport = pdfPage.getViewport({ scale: SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

      const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
      const found = (data.blocks ?? []).flatMap((block) => block.paragraphs ?? []).flatMap((paragraph) => paragraph.lines ?? []);
      if (found.length) {
        for (const line of found) {
          const height = line.bbox ? (line.bbox.y1 - line.bbox.y0) / SCALE : 0;
          lines.push(makeLine(fixBullet(line.text), page, false, false, Math.round(height * 10) / 10));
        }
      } else {
        for (const text of (data.text ?? '').split('\n')) if (text.trim()) lines.push(makeLine(fixBullet(text), page));
      }
      canvas.width = 0; // frees the image memory straight away on phones
      canvas.height = 0;
      pdfPage.cleanup();
    }
  } catch (error) {
    if (error instanceof CvReadError) throw error;
    console.warn('OCR failed:', error);
    throw new CvReadError('damaged');
  } finally {
    task.destroy();
    worker.terminate();
  }

  onProgress({ stage: 'done', progress: 1 });
  return { format: 'pdf', ocr: true, pages, lines, layout: { images: pages, tables: 0, textBoxes: 0, columns: false, headerText: '' } };
}
