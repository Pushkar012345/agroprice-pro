// Turn a markdown knowledge file into retrieval-sized chunks.
//
// Strategy: heading-aware + paragraph-packed.
//   1. Split the file into sections at markdown headings.
//   2. Pack whole paragraphs into a chunk up to maxChars (never cut mid-paragraph
//      unless one paragraph alone is too long, then split on sentences).
//   3. Prefix every chunk with its heading so a chunk is understandable on its own.
// Chunks never cross a heading, so one chunk = one topic.

const DEFAULT_MAX_CHARS = 900;

// "# Title" (first heading) and an optional "Source: <url>" line are metadata, not body.
function parseDoc(filename, raw) {
  const source = filename.replace(/\.md$/i, '');
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  let title = source;
  let url;
  const body = [];
  let titleTaken = false;
  for (const line of lines) {
    if (!titleTaken && /^#\s+/.test(line)) {
      title = line.replace(/^#\s+/, '').trim();
      titleTaken = true;
      continue;
    }
    const m = line.match(/^Source:\s*(\S+)\s*$/i);
    if (m && !url) { url = m[1]; continue; }
    body.push(line);
  }
  return { source, title, url, body: body.join('\n').trim() };
}

function splitLongParagraph(text, maxChars) {
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];
  const out = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur + s).length > maxChars) { out.push(cur.trim()); cur = ''; }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  // Last resort for a single huge "sentence": hard slice.
  return out.flatMap((p) => (p.length <= maxChars ? [p] : p.match(new RegExp(`[\\s\\S]{1,${maxChars}}`, 'g'))));
}

function chunkDoc(doc, { maxChars = DEFAULT_MAX_CHARS } = {}) {
  const sections = [];
  let heading = '';
  let buf = [];
  const flush = () => {
    const text = buf.join('\n').trim();
    if (text) sections.push({ heading, text });
    buf = [];
  };
  for (const line of doc.body.split('\n')) {
    if (/^#{1,6}\s+/.test(line)) { flush(); heading = line.replace(/^#{1,6}\s+/, '').trim(); }
    else buf.push(line);
  }
  flush();

  const chunks = [];
  for (const { heading: h, text } of sections) {
    const prefix = h ? `${h}\n` : '';
    const budget = Math.max(200, maxChars - prefix.length);
    const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
      .flatMap((p) => (p.length > budget ? splitLongParagraph(p, budget) : [p]));
    let cur = '';
    for (const p of paragraphs) {
      if (cur && (cur + '\n\n' + p).length > budget) { chunks.push(prefix + cur); cur = p; }
      else cur = cur ? cur + '\n\n' + p : p;
    }
    if (cur) chunks.push(prefix + cur);
  }
  return chunks.map((content, chunkIndex) => ({ chunkIndex, content }));
}

module.exports = { parseDoc, chunkDoc, DEFAULT_MAX_CHARS };