// Reads files out of a .zip. A Word .docx file is a zip of XML files, so this is
// how the CV check gets at the text. It only does what the check needs, and uses
// the browser's built-in DecompressionStream, so nothing extra is downloaded.

const SIG_END = 0x06054b50; // end of central directory
const SIG_CENTRAL = 0x02014b50; // central directory entry
const SIG_LOCAL = 0x04034b50; // local file header
const MAX_UNPACKED = 20 * 1024 * 1024; // refuse anything suspiciously large

/** Lists the files in a zip: Map of name → { method, compressedSize, size, offset }. */
export function listZip(buffer) {
  const view = new DataView(buffer);
  const length = buffer.byteLength;
  if (length < 22) throw new Error('not-zip');

  // The directory's end record sits in the last 64 KB (plus its own 22 bytes).
  let end = -1;
  for (let i = length - 22; i >= Math.max(0, length - 65_557); i -= 1) {
    if (view.getUint32(i, true) === SIG_END) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('not-zip');

  const count = view.getUint16(end + 10, true);
  let pos = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map();

  for (let n = 0; n < count; n += 1) {
    if (pos + 46 > length || view.getUint32(pos, true) !== SIG_CENTRAL) throw new Error('bad-zip');
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    const name = decoder.decode(new Uint8Array(buffer, pos + 46, Math.min(nameLength, length - pos - 46)));
    entries.set(name, {
      method: view.getUint16(pos + 10, true),
      compressedSize: view.getUint32(pos + 20, true),
      size: view.getUint32(pos + 24, true),
      offset: view.getUint32(pos + 42, true),
    });
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Unpacks one file from the zip and returns it as text. */
export async function readZipText(buffer, entry) {
  const view = new DataView(buffer);
  if (entry.size > MAX_UNPACKED) throw new Error('too-big');
  if (entry.offset + 30 > buffer.byteLength || view.getUint32(entry.offset, true) !== SIG_LOCAL) throw new Error('bad-zip');

  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  if (start + entry.compressedSize > buffer.byteLength) throw new Error('bad-zip');
  const data = new Uint8Array(buffer, start, entry.compressedSize);

  let bytes;
  if (entry.method === 0) bytes = data; // stored as-is
  else if (entry.method === 8) bytes = await inflate(data); // the usual "deflate" compression
  else throw new Error('bad-zip');
  return new TextDecoder().decode(bytes);
}

async function inflate(data) {
  if (typeof DecompressionStream !== 'function') throw new Error('old-browser');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  if (bytes.byteLength > MAX_UNPACKED) throw new Error('too-big');
  return bytes;
}
