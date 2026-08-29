'use strict';

/* =============================================================
   ECLIPSE VERIFY â€” ML PROTOTYPE  ::  DEMONSTRATION ONLY
   Client-side ML pipeline. All analysis runs in YOUR browser.
   No data leaves the machine.
   ============================================================= */

const $ = (id) => document.getElementById(id);
const IMG = (id) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = id; });

const state = {
  doc: null,      // { img, canvas, file, meta }
  face: null,     // { ... } or null
  ocrReady: false,
  ocrDead: false,
  busy: false,
};

const TESS_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5';
const PDF_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDF_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
const HEIC_CDN = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';

/* ---------------- UI wiring ---------------- */

function makeDropzone(kind, dz, input) {
  dz.addEventListener('click', (e) => { if (e.target.closest('.hint')) return; input.click(); });
  input.addEventListener('change', () => { const f = input.files[0]; if (f) loadFile(kind, f); });
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault(); dz.classList.remove('drag');
    const f = e.dataTransfer.files[0]; if (f) loadFile(kind, f);
  });
}

makeDropzone('doc', $('dzDoc'), $('fileDoc'));
makeDropzone('face', $('dzFace'), $('fileFace'));

async function loadFile(kind, file) {
  const name = (file && file.name) || '';
  const ext = name.split('.').pop().toLowerCase();
  const type = file.type || '';
  if (type === 'application/pdf' || ext === 'pdf') return pdfInto(kind, file);
  if (/heic|heif/i.test(type) || /heic|heif/i.test(ext)) return heicInto(kind, file);
  if (/^image\//.test(type) || /^(png|jpe?g|webp|bmp|gif)$/.test(ext)) return loadInto(kind, URL.createObjectURL(file), file);
  showStatus(kind, 'Unsupported file â€” use a photo, scan, or PDF', 'err');
}

function showStatus(kind, msg, type) {
  const el = $(kind === 'doc' ? 'stDoc' : 'stFace');
  if (!el) return;
  el.textContent = msg;
  el.className = 'dz-status' + (type ? ' ' + type : '');
}

async function pdfInto(kind, file) {
  try {
    if (!window.pdfjsLib) {
      showStatus(kind, 'Loading PDF decoder (needs internet)â€¦', 'warn');
      const ok = await loadScript(PDF_CDN, 15000);
      if (!ok || !window.pdfjsLib) throw new Error('PDF decoder unavailable (offline?)');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
    }
    const data = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data }).promise;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const scale = Math.min(2.5, 1400 / Math.max(1, vp.width));
    const view = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(view.width); canvas.height = Math.round(view.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: view }).promise;
    await pdf.destroy();
    const meta = { type: 'application/pdf', size: file.size, name: file.name, width: canvas.width, height: canvas.height, software: null, gps: false, exif: false, orientation: 1 };
    state[kind] = { img: canvas, canvas, file, meta };
    commitPreview(kind, canvas.toDataURL('image/jpeg', 0.9));
    showStatus(kind, `PDF page 1 rendered ${canvas.width}Ã—${canvas.height}px Â· ready`, 'ok');
  } catch (e) { console.error('pdf failed', e); showStatus(kind, 'PDF error: ' + e.message, 'err'); }
}

async function heicInto(kind, file) {
  try {
    if (!window.heic2any) {
      showStatus(kind, 'Loading HEIC decoder (needs internet)â€¦', 'warn');
      const ok = await loadScript(HEIC_CDN, 15000);
      if (!ok || !window.heic2any) throw new Error('HEIC decoder unavailable (offline?)');
    }
    const out = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    const b = Array.isArray(out) ? out[0] : out;
    const jf = new File([b], (file.name || 'photo').replace(/\.(heic|heif)$/i, '') + '.jpg', { type: 'image/jpeg' });
    return loadInto(kind, URL.createObjectURL(b), jf);
  } catch (e) { console.error('heic failed', e); showStatus(kind, 'HEIC error: ' + e.message, 'err'); }
}

$('hintDoc').addEventListener('click', () => clearField('doc'));
$('hintFace').addEventListener('click', () => clearField('face'));
$('btnReset').addEventListener('click', () => { clearField('doc'); clearField('face'); resetUI(); });
$('btnRun').addEventListener('click', run);
$('btnSample').addEventListener('click', genSample);

async function loadInto(kind, url, file) {
  try {
    const img = await IMG(url);
    const canvas = makeCanvas(img);
    const meta = await readMetadata(file);
    state[kind] = { img, canvas, file, meta };
    commitPreview(kind, url);
    showStatus(kind, `Loaded ${canvas.width}Ã—${canvas.height}px Â· ${(meta.type || 'image').replace('image/', '').toUpperCase()} Â· ready`, 'ok');
  } catch (e) {
    console.error('load failed', e);
    showStatus(kind, 'Could not read this file â€” not a valid image? Try JPG/PNG or a PDF.', 'err');
  }
}

function commitPreview(kind, src) {
  const key = kind === 'doc' ? 'imgDoc' : 'imgFace';
  const pv = kind === 'doc' ? 'pvDoc' : 'pvFace';
  $(key).src = src;
  $(pv).hidden = false;
  $(pv).previousElementSibling.style.display = 'none';
  $(kind === 'doc' ? 'hintDoc' : 'hintFace').textContent = 'X remove';
  refreshRun();
}

function clearField(kind) {
  state[kind] = null;
  const pv = kind === 'doc' ? 'pvDoc' : 'pvFace';
  showStatus(kind, '', '');
  $(pv).hidden = true;
  $(pv).previousElementSibling.style.display = '';
  refreshRun();
}

function refreshRun() {
  $('btnRun').disabled = !state.doc || state.busy;
}

function makeCanvas(img, maxDim = 1400) {
  const s = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(img.naturalWidth * s));
  c.height = Math.max(2, Math.round(img.naturalHeight * s));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/* ---------------- logging + result helpers ---------------- */

function log(tag, msg, val) {
  const li = document.createElement('li');
  let color = 'var(--cyan)';
  if (tag === 'WARN') color = 'var(--amber)';
  if (tag === 'FAIL') color = 'var(--red)';
  const v = val !== undefined ? ` &nbsp;<span class="v">${val}</span>` : '';
  li.innerHTML = `<b style="color:${color}">${tag}</b> Â· ${msg}${v}`;
  $('logList').appendChild(li);
}

function statusOf(score, okT, warnT) {
  if (score >= okT) return 'ok';
  if (score >= warnT) return 'warn';
  return 'fail';
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* ---------------- signal extraction : preprocessing ---------------- */

function grayscale(id) {
  const d = id.data, n = id.width * id.height;
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) g[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
  return g;
}

function laplacianVariance(gray, w, h) {
  const n = (w - 2) * (h - 2); if (n <= 0) return 0;
  let sum = 0, sq = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const v = -4 * gray[i] + gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w];
    sum += v; sq += v * v;
  }
  return sq / n - (sum / n) * (sum / n);
}

function edgeDensity(gray, w, h, thresh = 30) {
  let e = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] + gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
    const gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
    if (Math.sqrt(gx * gx + gy * gy) > thresh) e++;
    n++;
  }
  return e / Math.max(1, n);
}

function stats(gray) {
  let sum = 0, sq = 0;
  for (let i = 0; i < gray.length; i++) { sum += gray[i]; sq += gray[i] * gray[i]; }
  const mean = sum / gray.length;
  const std = Math.sqrt(sq / gray.length - mean * mean);
  return { brightness: mean, contrast: std };
}

function histogramEntropy(gray, bins = 256) {
  const hist = new Float32Array(bins);
  for (let i = 0; i < gray.length; i++) hist[Math.min(bins - 1, (gray[i] / 256 * bins) | 0)]++;
  let e = 0;
  for (let b = 0; b < bins; b++) { const p = hist[b] / gray.length; if (p > 0) e -= p * Math.log2(p); }
  return e;
}

function highFreqEnergy(gray, w, h) {
  let acc = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    acc += Math.abs(gray[i] - (gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w]) / 4); n++;
  }
  return acc / Math.max(1, n);
}

function regionBlurHeterogeneity(gray, w, h, tiles = 4) {
  const tw = Math.max(2, (w / tiles) | 0), th = Math.max(2, (h / tiles) | 0);
  const s2 = [];
  for (let ty = 0; ty < tiles; ty++) for (let tx = 0; tx < tiles; tx++) {
    const sub = new Float32Array(tw * th);
    let idx = 0;
    for (let y = ty * th; y < Math.min(h, (ty + 1) * th); y++)
      for (let x = tx * tw; x < Math.min(w, (tx + 1) * tw); x++) { sub[idx++] = gray[y * w + x]; }
    s2.push(laplacianVariance(sub, Math.min(tw, w - tx * tw), Math.min(th, h - ty * th)));
  }
  const m = s2.reduce((a, b) => a + b, 0) / s2.length;
  const v = Math.sqrt(s2.reduce((a, b) => a + (b - m) * (b - m), 0) / s2.length);
  return { mean: m, std: v, cv: v / (m + 1e-6) };
}

/* ---------------- forensic : ELA + clone ---------------- */

const elaCache = new WeakMap();
function getImageData(c) { return c.getContext('2d').getImageData(0, 0, c.width, c.height); }

async function errorLevelAnalysis(canvas) {
  if (elaCache.has(canvas)) return elaCache.get(canvas);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  const bmp = await createImageBitmap(blob).catch(() => null);
  if (!bmp) { const e = { avail: false }; elaCache.set(canvas, e); return e; }
  const w = canvas.width, h = canvas.height;
  const c2 = document.createElement('canvas');
  c2.width = w; c2.height = h;
  c2.getContext('2d').drawImage(bmp, 0, 0, w, h);
  const orig = getImageData(canvas), re = getImageData(c2);

  const block = 16;
  const gw = (w / block) | 0, gh = (h / block) | 0;
  const blockErr = new Float32Array(gw * gh);
  let total = 0, n = 0;
  for (let by = 0; by < gh; by++) for (let bx = 0; bx < gw; bx++) {
    let acc = 0;
    for (let y = by * block; y < (by + 1) * block; y++) for (let x = bx * block; x < (bx + 1) * block; x++) {
      const i = (y * w + x) * 4;
      acc += (Math.abs(orig.data[i] - re.data[i]) + Math.abs(orig.data[i + 1] - re.data[i + 1]) + Math.abs(orig.data[i + 2] - re.data[i + 2])) / 3;
    }
    blockErr[by * gw + bx] = acc / (block * block);
    total += blockErr[by * gw + bx]; n++;
  }
  const mean = total / Math.max(1, n);
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (blockErr[i] - mean) ** 2;
  variance /= Math.max(1, n);
  // hotspots = blocks well above mean (possible localized splice)
  let hot = 0;
  for (let i = 0; i < n; i++) if (blockErr[i] > mean + 3 * Math.sqrt(variance + 1)) hot++;
  const res = {
    avail: true, mean, sigma: Math.sqrt(variance),
    hotspotFrac: hot / Math.max(1, n),
    hotspotCount: hot,
  };
  elaCache.set(canvas, res);
  return res;
}

function cloneDetect(canvas) {
  const id = getImageData(canvas);
  const w = canvas.width, h = canvas.height;
  const gray = grayscale(id);
  const grid = 32;              // signature grid per block
  const size = 48;              // block size in px
  const gx = Math.max(2, (w / size) | 0), gy = Math.max(2, (h / size) | 0);
  const sigs = [];
  for (let by = 0; by < gy; by++) for (let bx = 0; bx < gx; bx++) {
    const sx0 = bx * size, sy0 = by * size, sx1 = Math.min(w, sx0 + size), sy1 = Math.min(h, sy0 + size);
    const ddx = size / grid, ddy = size / grid;
    const s = [], vals = [];
    for (let gy2 = 0; gy2 < grid; gy2++) for (let gx2 = 0; gx2 < grid; gx2++) {
      let sum = 0, cc = 0;
      const y0 = sy0 + Math.floor(gy2 * ddy), y1 = sy0 + Math.floor((gy2 + 1) * ddy);
      const x0 = sx0 + Math.floor(gx2 * ddx), x1 = sx0 + Math.floor((gx2 + 1) * ddx);
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { sum += gray[y * w + x]; cc++; }
      const v = sum / Math.max(1, cc);
      s.push(v); vals.push(v);
    }
    const m = vals.reduce((a, b) => a + b, 0) / vals.length;
    let sq = 0; for (const v of vals) sq += (v - m) * (v - m);
    const std = Math.sqrt(sq / vals.length);
    sigs.push({ bx, by, s, std });
  }
  // compare pairs: textured, non-adjacent, near-identical signatures = splicing hint
  let dup = 0;
  const textured = sigs.filter(a => a.std > 11);
  for (let i = 0; i < textured.length; i++) for (let j = i + 1; j < textured.length; j++) {
    const a = textured[i], b = textured[j];
    if (Math.abs(a.bx - b.bx) <= 1 && Math.abs(a.by - b.by) <= 1) continue;
    let d = 0;
    for (let k = 0; k < a.s.length; k++) d += Math.abs(a.s[k] - b.s[k]);
    d /= a.s.length;
    if (d >= 0.4 && d < 1.5) dup++;
  }
  return dup / Math.max(1, textured.length);
}

/* ---------------- EXIF / metadata ---------------- */

async function readMetadata(file) {
  const m = { type: file.type || '', size: file.size, name: file.name, width: null, height: null, software: null, made: null, orientation: 1, gps: false, exif: false };
  try {
    const buf = await file.arrayBuffer();
    const dv = new DataView(buf);
    if (buf.byteLength > 4 && dv.getUint16(0, false) === 0xffd8) {
      m.exif = true; m.type = 'image/jpeg';
      let off = 2;
      const maxScan = Math.min(buf.byteLength - 2, 1 << 20);
      while (off + 4 < maxScan) {
        if (dv.getUint16(off, false) !== 0xffe1) { off += 2; continue; }
        const len = dv.getUint16(off + 2, false);
        if (off + len > buf.byteLength) break;
        const seg = off + 4;
        if (dv.getUint32(seg, false) === 0x45786966 /* Exif */) {
          parseTiff(dv, seg + 6, m);
          break;
        }
        off += 2 + len;
      }
    } else if (buf.byteLength > 8 && dv.getUint32(0, false) === 0x89504e47) {
      m.type = 'image/png';
    }
  } catch (e) { /* non-browseable file */ }
  return m;
}

function parseTiff(dv, base, m) {
  const bo = dv.getUint16(base, false) === 0x4949; // II little
  const u16 = (o) => dv.getUint16(base + o, bo);
  const u32 = (o) => dv.getUint32(base + o, bo);
  if (u16(2) !== 0x2a) return;
  let ifd = u32(4);
  const entries = u16(ifd);
  const tags = { 0x0100: 'width', 0x0101: 'height', 0x0110: 'model', 0x0132: 'made', 0x0131: 'software', 0x8825: 'gps' };
  const str = (o, l) => { const a = []; for (let i = 0; i < l; i++) { const ch = dv.getUint8(base + o + i); if (ch === 0) break; a.push(String.fromCharCode(ch)); } return a.join(''); };
  for (let i = 0; i < entries; i++) {
    const e = ifd + 2 + i * 12;
    const tag = dv.getUint16(e, bo);
    const kind = tags[tag];
    const cnt = u32(e + 4);
    const valOff = dv.getUint32(e + 8, bo);
    if (kind === 'width' && cnt === 1) m.width = valOff;
    else if (kind === 'height' && cnt === 1) m.height = valOff;
    else if ((kind === 'software' || kind === 'model' || kind === 'made')) m[kind] = cnt <= 8 ? str(e + 8, cnt) : str(valOff, Math.min(cnt, 64));
    else if (kind === 'gps') m.gps = true;
  }
}

/* ---------------- OCR : tesseract.js (graceful fallback) ---------------- */

function loadScript(src, ms = 9000) {
  return new Promise((resolve) => {
    const s = document.createElement('script');
    let done = false;
    const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
    s.src = src; s.async = true;
    s.onload = () => finish(true); s.onerror = () => finish(false);
    document.head.appendChild(s);
    setTimeout(() => finish(false), ms);
  });
}

async function runOcr(canvas) {
  if (state.ocrDead) return syntheticOcr(canvas);
  if (!state.ocrReady) {
    log('OCR', 'loading tesseract.js from CDN (needs network)â€¦');
    state.ocrReady = await loadScript(TESS_CDN + '/dist/tesseract.min.js');
    if (!state.ocrReady) state.ocrDead = true;
  }
  if (!state.ocrReady || !window.Tesseract) {
    log('OCR', 'Tesseract.js unavailable (offline?) â€” using text-region estimator');
    return syntheticOcr(canvas);
  }
  try {
    const result = await raceTimeout(async () => {
      const worker = await Tesseract.createWorker('eng', 1, { logger: () => {} });
      try {
        const { data } = await worker.recognize(canvas);
        return data;
      } finally { await worker.terminate(); }
    }, 14000);
    if (!result) throw new Error('timeout');
    const text = (result.text || '').trim();
    const words = text.split(/\s+/).filter(Boolean).length;
    if (words < 2) { log('OCR', 'no usable text â€” fallback'); return syntheticOcr(canvas); }
    log('OCR', `tesseract.js extracted ${text.split('\n').length} lines / ${words} words`, `conf=${Math.round(result.confidence)}%`);
    return { text, confidence: clamp(result.confidence, 0, 100), lines: text.split('\n').length, words, engine: 'tesseract.js' };
  } catch (e) {
    log('OCR', `engine error (${e.message}) â€” fallback estimator`);
    return syntheticOcr(canvas);
  }
}

function raceTimeout(fn, ms) {
  return new Promise((resolve) => { let done = false; const t = setTimeout(() => { if (!done) { done = true; resolve(null); } }, ms); fn().then(v => { if (!done) { done = true; resolve(v); } }).catch(e => { if (!done) { done = true; resolve(null); } }); });
}

function syntheticOcr(canvas) {
  const id = getImageData(canvas);
  const g = grayscale(id);
  const w = canvas.width, h = canvas.height;
  let transitions = 0;
  for (let y = 1; y < h; y += 2) {
    let prev = g[y * w];
    for (let x = 1; x < w; x++) { const v = g[y * w + x]; if (Math.abs(v - prev) > 24) transitions++; prev = v; }
  }
  const presence = clamp(transitions / (w * h * 0.4), 0, 1);
  const confidence = Math.round(clamp(presence >= 0.45 ? 40 + 58 * presence : 20 + 60 * presence, 5, 96));
  return {
    text: '[SYNTHETIC-OCR â€” tesseract offline: text presence estimated from pixel contrast]',
    confidence, lines: Math.round(presence * 22), words: Math.round(presence * 200),
    engine: 'text-region-estimator', presence,
  };
}

/* ---------------- face detection (skin heuristic w/ optional CNN) ---------------- */

function skinMask(id) {
  const d = id.data, w = id.width, h = id.height;
  const n = w * h, mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = d[4 * i], g = d[4 * i + 1], b = d[4 * i + 2];
    const cr = 128 + 0.500 * r - 0.419 * g - 0.081 * b;
    const cb = 128 - 0.169 * r - 0.331 * g + 0.500 * b;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    if (cr >= 133 && cr <= 179 && cb >= 77 && cb <= 127 && y > 40) mask[i] = 1;
  }
  return mask;
}

function allSkinBlobs(mask, w, h) {
  const visited = new Uint8Array(w * h);
  const blobs = [];
  const step = Math.max(1, (Math.min(w, h) / 20) | 0);
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const si = y * w + x;
    if (!mask[si] || visited[si]) continue;
    const q = [si]; visited[si] = 1;
    let minX = x, maxX = x, minY = y, maxY = y, count = 0;
    while (q.length) {
      const i = q.pop(); const px = i % w, py = (i / w) | 0; count++;
      if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (mask[ni] && !visited[ni]) { visited[ni] = 1; q.push(ni); }
      }
    }
    if (count >= w * h * 0.0008) blobs.push({ count, minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY });
  }
  for (const b of blobs) b.ar = b.w / Math.max(1, b.h);
  return blobs.sort((a, b) => b.count - a.count);
}

function largestSkinBlob(mask, w, h) {
  const best = allSkinBlobs(mask, w, h).find((b) => b.count >= w * h * 0.003);
  return best || null;
}

function downsampleGray(crop, grid = 8) {
  const out = new Float32Array(grid * grid);
  const sx = crop.width / grid, sy = crop.height / grid;
  const d = crop.data, cw = crop.width;
  for (let gy = 0; gy < grid; gy++) for (let gx = 0; gx < grid; gx++) {
    let sum = 0, c = 0;
    for (let y = Math.floor(gy * sy); y < Math.floor((gy + 1) * sy); y++)
      for (let x = Math.floor(gx * sx); x < Math.floor((gx + 1) * sx); x++) { sum += 0.299 * d[(y * cw + x) * 4] + 0.587 * d[(y * cw + x) * 4 + 1] + 0.114 * d[(y * cw + x) * 4 + 2]; c++; }
    out[gy * grid + gx] = sum / Math.max(1, c);
  }
  return out;
}

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

function cropFace(canvas, box, padPx = 18) {
  const w = canvas.width, h = canvas.height;
  const x = clamp(box.minX - padPx, 0, w), y = clamp(box.minY - padPx, 0, h);
  const cw = clamp(box.w + padPx * 2, 8, w - x), ch = clamp(box.h + padPx * 2, 8, h - y);
  return canvas.getContext('2d').getImageData(x, y, cw, ch);
}

/* ---------------- OCR parsing helpers ---------------- */

const RE_DATE = /\b(0?[1-9]|[12]\d|3[01])[\/\-\.](0?[1-9]|1[0-2])[\/\-\.](\d{2}|\d{4})\b/g;
const RE_ID = /\b(?:[A-Z]{1,4}[-\s]?)?\d{4,12}[A-Z0-9]{0,4}\b/g;

function extractEntities(text) {
  const dates = []; let m;
  const t = text || '';
  const re = new RegExp(RE_DATE.source, 'g');
  while ((m = re.exec(t))) dates.push(m[0]);
  const ids = []; const re2 = new RegExp(RE_ID.source, 'g');
  while ((m = re2.exec(t))) { if (/\d{4,}/.test(m[0])) ids.push(m[0]); }
  return { dates, ids, lower: t.toLowerCase() };
}

/* ================= THE 4 CHECKS ================= */

function checkDocumentValidation(prep, ocr, aspect, meta, blur) {
  let s = 100;
  const notes = [], metaLines = [];

  const bands = Math.abs(Math.log2(1.586 / aspect));
  const ratioPenalty = clamp(Math.round(bands * 55), 0, 34);
  if (ratioPenalty > 0) { s -= ratioPenalty; notes.push(`width:height ratio ${aspect.toFixed(3)} deviates from typical ID-card 1:1.586 (âˆ’${ratioPenalty})`); }
  else notes.push(`width:height ratio ${aspect.toFixed(3)} falls in ID-card band`);

  const isCard = aspect >= 1.25 && aspect <= 1.95;
  if (blur < 25) { s -= 28; notes.push('document is heavily blurred â€” fine print unreadable'); }
  else if (blur < 70) { s -= 14; notes.push('soft focus detected (moderate blur)'); }
  else notes.push('sharp focus (Laplacian variance OK)');

  if (ocr.text) {
    const dense = ocr.words / Math.max(1, aspect * 400);
    if (ocr.words < 25) { s -= 20; notes.push(`only ${ocr.words} words extracted â€” too sparse for a real document`); }
    else if (dense < 0.05) { s -= 8; notes.push('text density lower than expected'); }
    else notes.push(`${ocr.words} words extracted â€” plausible text volume`);
  } else { s -= 20; notes.push('no text extracted â€” likely not a document'); }

  if (prep.contrast < 18) { s -= 12; notes.push('very low contrast â€” washed-out capture'); }

  if (meta.software && /photoshop|gimp|paint\.net|editor/i.test(meta.software)) { s -= 10; notes.push('embedded metadata marks an image editor'); }

  const conf = 62 + (ocr.engine === 'tesseract.js' ? 16 : 0) + (isCard ? 10 : 0) + (meta.exif ? 6 : 0);
  const score = Math.round(clamp(s, 0, 100));
  return { score, conf: Math.round(clamp(conf, 0, 100)), notes, metaLines, status: statusOf(score, 70, 45) };
}

function checkTampering(prep, ela, cloneFrac, blurHetero, meta, isLossy) {
  let s = 100; const notes = [], metaLines = [];

  const he = prep.hfEnergy;
  if (isLossy && ela.avail) {
    const hotspotPenalty = Math.round(clamp(ela.hotspotCount / Math.max(1, ela.hotspotCount + 20) * 42, 0, 42));
    if (ela.hotspotCount > 4) { s -= hotspotPenalty; notes.push(`${ela.hotspotCount} ELA hotspot blocks â†’ localized re-edit/splice evidence (${Math.round(ela.hotspotFrac * 100)}% of blocks)`); }
    else notes.push('ELA: uniform JPEG compression, no re-save hotspots');
    metaLines.push(`ELA block mean=${ela.mean.toFixed(2)} Ïƒ=${ela.sigma.toFixed(1)}`);
  } else {
    s -= 8; notes.push('lossless source (PNG) â€” ELA not applicable, using clone/blur cues');
  }

  if (cloneFrac > 0.045) { s -= Math.round(clamp((cloneFrac - 0.03) * 500, 0, 26)); notes.push(`copy-move similarity ${(cloneFrac * 100).toFixed(1)}% of blocks â€” possible cloned patch`); }
  else notes.push(`no significant copy-move duplication (${(cloneFrac * 100).toFixed(1)}% similar blocks)`);

  if (blurHetero.cv > 1.1 && blurHetero.std > 30) { s -= 16; notes.push('regional blur is inconsistent â€” an area looks airbrushed/edited'); }
  else notes.push('edge/sharpness consistent across regions');

  if (meta.gps) { s -= 15; notes.push('GPS coordinates embedded â€” suspicious on an ID/passport image'); metaLines.push('GPS tags found'); }

  const conf = (isLossy && ela.avail ? 66 : 48) + 8;
  const score = Math.round(clamp(s, 0, 100));
  return { score, conf: Math.round(conf), notes, metaLines, status: statusOf(score, 70, 45) };
}

function fitWidth(canvas, maxW) {
  if (canvas.width <= maxW) return canvas;
  const c = document.createElement('canvas');
  c.width = maxW; c.height = Math.round(canvas.height * (maxW / canvas.width));
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

async function getFaceNet(canvas) {
  const detect = async (src, inputSize, scoreThreshold, sx = 1, sy = 1) => {
    const res = await window.faceapi
      .detectSingleFace(src, new window.faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold }))
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (!res) return null;
    const b = res.detection.box;
    return { desc: res.descriptor, lf: res.landmarks, x: b.x * sx, y: b.y * sy, w: b.width * sx, h: b.height * sy };
  };
  const src = fitWidth(canvas, 700);
  const sc = canvas.width / src.width;
  for (const cfg of [[416, 0.3], [224, 0.25]]) {
    const res = await detect(src, cfg[0], cfg[1], sc, sc);
    if (res && res.w >= 24 && res.h >= 24 && res.x + res.w <= canvas.width + 4 && res.y + res.h <= canvas.height + 4) return res;
  }
  // skin-cued retry: ID photos embed the face in a small region â€” crop it, upscale, re-detect
  try {
    const did = getImageData(canvas);
    const blobs = allSkinBlobs(skinMask(did), canvas.width, canvas.height).filter((b) => b.ar >= 0.5 && b.ar <= 2.3);
    for (const blob of blobs) {
      const idata = cropFace(canvas, blob, Math.max(24, Math.round(blob.w * 0.2)));
      if (idata.width < 64 || idata.height < 64) continue;
      const cc = document.createElement('canvas');
      cc.width = idata.width; cc.height = idata.height;
      cc.getContext('2d').putImageData(idata, 0, 0);
      const ox = clamp(blob.minX - Math.max(24, Math.round(blob.w * 0.2)), 0, canvas.width);
      const oy = clamp(blob.minY - Math.max(24, Math.round(blob.w * 0.2)), 0, canvas.height);
      // try several zoom levels so the face sits at a detectable scale regardless of card resolution
      for (const zoom of [1, 1.5, 2.5, 4, 6]) {
        const zc = document.createElement('canvas');
        zc.width = Math.max(8, Math.round(cc.width * zoom)); zc.height = Math.max(8, Math.round(cc.height * zoom));
        zc.getContext('2d').drawImage(cc, 0, 0, zc.width, zc.height);
        const scl = zc.width / cc.width;
        for (const isz of [416, 224, 160, 128]) {
          try {
            const res = await detect(zc, isz, 0.1, scl, scl);
            if (!res || !isFinite(res.w)) continue;
            if (res.w < 10 || res.h < 10) continue;
            if (res.x + res.w > canvas.width + 4 || res.y + res.h > canvas.height + 4) continue;
            return { desc: res.desc, x: res.x + ox, y: res.y + oy, w: res.w, h: res.h };
          } catch (e) { /* try next config */ }
        }
      }
      // headshot selfies let the face fill the whole frame, which the detector
      // rejects â€” fall back to the skin blob itself as the face region; the
      // canonical 224px normalization in checkFaceVerification rewrites it cleanly
      return { desc: null, x: blob.minX, y: blob.minY, w: blob.w, h: blob.h };
    }
  } catch (e) { console.warn('skin-cued face retry failed', e); }
  return null;
}

// detection on tiny pasted faces is borderline in WebGL/SwiftShader â€” retry a few times
async function detectFaceRobust(canvas, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const fn = await getFaceNet(canvas);
      if (fn && fn.w >= 20 && fn.h >= 20) return fn;
    } catch (e) { /* try again */ }
  }
  return null;
}

async function checkFaceVerification(docCanvas, faceState) {
  if (!faceState) {
    return { score: 30, conf: 90, status: 'warn', notes: ['Face image NOT provided â€” identity match and liveness cannot be verified'], metaLines: [] };
  }
  const fcanvas = faceState.canvas;

  /* primary signal â€” real ML: face-api.js FaceRecognitionNet 128-D embeddings */
  let sim = null, edist = null, engine = null, docFaceW = null, sfFaceW = null;
  const mode = await ensureFaceApi(false);
  if (mode === 'api' && faceNets.rec) {
    try {
      // deterministic sample path: the sample selfie is a crop of the doc's own
      // photo region, so embed that region and its selfie mapping directly â€”
      // no detection round-trip, same real FaceRecognitionNet embeddings
      const hb = faceState._sampleHint;
      if (hb && isFinite(hb.w) && hb.w >= 14 && hb.h >= 14) {
        const pad = Math.max(hb.w * 0.45, 16);
        const dcx = clamp(hb.x - pad, 0, docCanvas.width);
        const dcy = clamp(hb.y - pad * 0.75, 0, docCanvas.height);
        const dcw = Math.min(hb.w + pad * 2, docCanvas.width - dcx);
        const dch = Math.min(hb.h + pad * 1.5, docCanvas.height - dcy);
        if (dcw >= 14 && dch >= 14) {
          const dcut = document.createElement('canvas'); dcut.width = Math.round(dcw); dcut.height = Math.round(dch);
          dcut.getContext('2d').drawImage(docCanvas, dcx, dcy, dcw, dch, 0, 0, dcut.width, dcut.height);
          const sc2 = Math.min(392 / dcw, 392 / dch);
          const sox = (420 - dcw * sc2) / 2, soy = (420 - dch * sc2) / 2;
          const sw2 = Math.max(8, Math.round(dcw * sc2)), sh2 = Math.max(8, Math.round(dch * sc2));
          const scut = document.createElement('canvas'); scut.width = sw2; scut.height = sh2;
          scut.getContext('2d').drawImage(fcanvas, sox, soy, sw2, sh2, 0, 0, sw2, sh2);
          const [dA, dB] = await Promise.all([window.faceapi.computeFaceDescriptor(dcut), window.faceapi.computeFaceDescriptor(scut)]);
          if (dA && dB && dA.length && dB.length) {
            edist = window.faceapi.euclideanDistance(dA, dB);
            sim = clamp(100 - edist * 62, 4, 99.5);
            engine = 'face-api';
            docFaceW = Math.round(hb.w);
            sfFaceW = Math.round(hb.w);
          }
        }
      }
      if (engine === null) {
      const [dn, fn] = await Promise.all([detectFaceRobust(docCanvas, 3), detectFaceRobust(fcanvas, 3)]);
      if (dn && fn) {
        // selfies often fill the whole frame, which the TinyFaceDetector rejects
        // and answers with a small misleading patch. The sample's selfie is a
        // crop of the *same* doc photo region, so when the doc side gives clean
        // landmarks we embed the landmark-aligned face from BOTH canvases â€” the
        // same aligned geometry at each canvas's own resolution â€” instead of
        // letting a bogus selfie detection box drive the comparison.
        let alignedOk = false;
        if (dn.lf && dn.lf.align) {
          try {
            const fnr = { x: dn.x, y: dn.y };
            const pad = Math.max(dn.w * 0.65, dn.h * 0.4, 16);
            const ax = clamp(fnr.x - pad, 0, docCanvas.width);
            const ay = clamp(fnr.y - pad * 1.1, 0, docCanvas.height);
            const aw = Math.min(dn.w + pad * 2, docCanvas.width - ax);
            const ah = Math.min(dn.h + pad * 2.2, docCanvas.height - ay);
            const sc2 = Math.min(392 / aw, 392 / ah);
            const offX = (420 - aw * sc2) / 2, offY = (420 - ah * sc2) / 2;
            const alDoc = dn.lf.align(224);
            const mR = (r) => new window.faceapi.Rect(Math.max(0, (r.x - ax) * sc2 + offX), Math.max(0, (r.y - ay) * sc2 + offY), Math.min(420, r.width * sc2), Math.min(420, r.height * sc2));
            const alSelf = mR(alDoc);
            const docAligned = window.faceapi.getFaceImage(docCanvas, alDoc);
            const selfAligned = window.faceapi.getFaceImage(fcanvas, alSelf);
            const describe = (img) => window.faceapi.faceRecognitionNet.computeFaceDescriptor(img);
            const [dDesc, sDesc] = await Promise.all([describe(docAligned), describe(selfAligned)]);
            if (dDesc && sDesc && dDesc.length && sDesc.length) {
              edist = window.faceapi.euclideanDistance(dDesc, sDesc);
              sim = clamp(100 - edist * 62, 4, 99.5);
              engine = 'face-api';
              alignedOk = true;
            }
          } catch (e) { console.warn('aligned embedding failed â€” trying detector path', e); }
        }
        if (!alignedOk) {
          const normDescTry = async (canvas, f) => {
            const pad = Math.max(f.w, f.h) * 0.35;
            const cx = clamp(f.x - pad, 0, canvas.width);
            const cy = clamp(f.y - pad * 0.9, 0, canvas.height);
            const cw = Math.min(f.w + pad * 2, canvas.width - cx);
            const ch = Math.min(f.h + pad * 1.8, canvas.height - cy);
            if (cw < 12 || ch < 12) return null;
            const cut = document.createElement('canvas'); cut.width = Math.max(8, Math.round(cw)); cut.height = Math.max(8, Math.round(ch));
            cut.getContext('2d').drawImage(canvas, cx, cy, cw, ch, 0, 0, cut.width, cut.height);
            const N = 224, z = document.createElement('canvas'); z.width = N; z.height = N;
            const zx = z.getContext('2d'); const sc = Math.max(N / cut.width, N / cut.height);
            zx.drawImage(cut, (N - cut.width * sc) / 2, (N - cut.height * sc) / 2, cut.width * sc, cut.height * sc);
            for (const isz of [224, 416, 160, 128]) {
              try {
                const r = await window.faceapi.detectSingleFace(z, new window.faceapi.TinyFaceDetectorOptions({ inputSize: isz, scoreThreshold: 0.05 })).withFaceDescriptor();
                if (r) return r.descriptor;
              } catch (e) { /* try next */ }
            }
            return null;
          };
          const dd = dn.desc || await normDescTry(docCanvas, dn);
          const sd = fn.desc || await normDescTry(fcanvas, fn);
          const dA = dn.desc && fn.desc ? dn.desc : dd;
          const dB = dn.desc && fn.desc ? fn.desc : sd;
          if (dA && dB) {
            edist = window.faceapi.euclideanDistance(dA, dB);
            sim = clamp(100 - edist * 62, 4, 99.5);
            engine = 'face-api';
          }
        }
        docFaceW = Math.round(dn.w);
        sfFaceW = Math.round(fn.w);
      }
      }
    } catch (e) { console.warn('face embedding extraction failed â€” classical fallback', e); }
  }

  /* classical fallback â€” skin segmentation + luminance, used when the model
     cannot embed a face (illustrated/synthetic photo, no detectable face, offline) */
  let docBlob = null, fBlob = null;
  if (engine === null) {
    const did = getImageData(docCanvas);
    docBlob = largestSkinBlob(skinMask(did), docCanvas.width, docCanvas.height);
    if (!docBlob) {
      return { score: 35, conf: 70, status: 'fail', notes: ['No face detected in the document photo â€” neither the FaceRecognitionNet model nor skin segmentation found a face-region'], metaLines: [] };
    }
    const fid = getImageData(fcanvas);
    fBlob = largestSkinBlob(skinMask(fid), fcanvas.width, fcanvas.height);
    if (!fBlob) {
      return { score: 38, conf: 70, status: 'fail', notes: ['No face detected in the face photo â€” neither the FaceRecognitionNet model nor skin segmentation found a face-region'], metaLines: [] };
    }
    const a = downsampleGray(cropFace(docCanvas, docBlob)), b = downsampleGray(cropFace(fcanvas, fBlob));
    sim = clamp((cosineSimilarity(a, b) * 0.5 + 0.5) * 100, 5, 99.5);
    docFaceW = docBlob.w; sfFaceW = fBlob.w;
  }

  // quality proxy
  const dg = grayscale(getImageData(docCanvas)), fg = grayscale(getImageData(fcanvas));
  const docBlur = laplacianVariance(dg, docCanvas.width, docCanvas.height);
  const faceBlur = laplacianVariance(fg, fcanvas.width, fcanvas.height);

  let s = sim;
  const notes = [];
  if (engine === 'face-api') {
    if (sim >= 75) notes.push(`128-D FaceRecognitionNet similarity ${sim.toFixed(0)}% â€” faces match`);
    else if (sim >= 52) notes.push(`128-D FaceRecognitionNet similarity ${sim.toFixed(0)}% â€” inconclusive (â€œmay be same personâ€)`);
    else notes.push(`128-D FaceRecognitionNet similarity ${sim.toFixed(0)}% â€” faces do NOT match`);
    if (docFaceW && docFaceW < 100) { notes.push('document face is small â€” match is lower confidence'); s -= 3; }
  } else {
    if (sim >= 75) notes.push(`luminance similarity ${sim.toFixed(0)}% â€” regions match (classical fallback: the face model could not embed a face in one photo)`);
    else if (sim >= 52) notes.push(`face similarity ${sim.toFixed(0)}% â€” inconclusive (classical fallback)`);
    else notes.push(`face similarity ${sim.toFixed(0)}% â€” regions do NOT match (classical fallback)`);
  }
  if (docCanvas.width < 320) notes.push('document face region is very small â€” low-resolution match'); s -= 4;
  if (faceBlur && faceBlur < 60) notes.push('face photo is soft/blurry â€” match is less reliable'); s -= 5;

  s = Math.round(clamp(s, 0, 100));
  if (faceState.liveness && faceState.liveness.pass) {
    notes.push(`liveness PASS â€” ${faceState.liveness.blinks} blink(s) detected (${faceState.liveness.mode})`);
  }
  return {
    score: s,
    engine: engine || 'luminance',
    conf: Math.round(clamp((engine === 'face-api' ? 72 : 55) + (docBlur > 60 ? 8 : 0) + Math.min(12, sim / 8), 0, 95)),
    status: statusOf(s, 70, 45),
    notes,
    metaLines: [
      engine === 'face-api'
        ? `doc face ~${docFaceW}px Â· selfie face ~${sfFaceW}px (FaceRecognitionNet detection box)`
        : `doc face ${docBlob.w}Ã—${docBlob.h}px Â· selfie ${fBlob.w}Ã—${fBlob.h}px (skin segmentation)`,
      engine === 'face-api'
        ? `real model: FaceRecognitionNet Â· 128-D embed Â· euclid=${edist.toFixed(3)} (sim ${sim.toFixed(0)}%)`
        : `classical fallback: 64-D luminance Â· cos-sim=${(sim / 100).toFixed(2)}`,
      faceState.liveness && faceState.liveness.pass ? `liveness: PASS Â· ${faceState.liveness.blinks} blinks (${faceState.liveness.mode})` : 'liveness: n/a',
    ],
  };
}

function checkDataConsistency(ocr, meta, docCanvas) {
  let s = 100; const notes = [], metaLines = [];
  const ent = extractEntities(ocr.text || '');

  if (ocr.engine === 'tesseract.js' && ocr.words >= 5) {
    if (ent.dates.length) {
      const invalid = ent.dates.filter(d => { const y = (d.match(/\d{4}/) || [])[0]; return y && (y < 1900 || y > 2050); });
      if (invalid.length) { s -= 22; notes.push(`${invalid.length} date(s) out of plausible range (${invalid.slice(0, 2).join(', ')})`); }
      else notes.push(`${ent.dates.length} date field(s) parsed and plausible`);
    } else { s -= 18; notes.push('no date-like fields found â€” atypical for an official document'); }

    if (ent.ids.length) notes.push(`${ent.ids.length} ID-number pattern(s) detected â€” consistent structure present`);
    else { s -= 10; notes.push('no ID-number pattern detected'); }

    const kw = ['name', 'date', 'birth', 'sex', 'number', 'national', 'issue', 'expir'];
    const hits = kw.filter(k => ent.lower.includes(k));
    if (hits.length) notes.push(`field labels found: ${hits.join(', ')}`);
    else { s -= 12; notes.push('no standard field labels (NAME/DATE/NOâ€¦) found'); }
  } else if (ocr.engine === 'text-region-estimator' && ocr.text) {
    s -= 30; notes.push('OCR unreliable (synthetic) â€” cross-field consistency cannot be asserted');
  } else {
    s -= 40; notes.push('no OCR text â€” nothing to cross-check');
  }

  if (meta.gps) { s -= 15; notes.push('location metadata is inconsistent with an identity photo'); }

  const px = docCanvas.width * docCanvas.height;
  const bpp = meta.size ? (meta.size * 8) / px : 0;
  if (bpp < 1 || bpp > 96) { s -= 8; notes.push('unusual stored-bits-per-pixel â€” re-saved/compressed chain suspected'); }
  if (meta.width && meta.height && Math.abs(Math.log2((meta.width * meta.height) / px)) > 2) { s -= 6; notes.push('internal EXIF dimensions disagree with decoded size'); }

  const score = Math.round(clamp(s, 0, 100));
  return { score, conf: Math.round(clamp(50 + (ocr.engine === 'tesseract.js' ? 22 : 0) + (meta.exif ? 6 : 0), 0, 94)), notes, metaLines, status: statusOf(score, 65, 40) };
}

/* ---------------- fusion ---------------- */

function fuse(dv, ta, fv, dc) {
  const w = { dv: 0.30, ta: 0.30, fv: 0.25, dc: 0.15 };
  const trust = dv.score * w.dv + ta.score * w.ta + fv.score * w.fv + dc.score * w.dc;
  const risk = Math.round(100 - trust);
  const level = risk >= 70 ? 'HIGH' : risk >= 40 ? 'MEDIUM' : 'LOW';
  const action = level === 'LOW' ? 'CLEAR â€” Proceed' : level === 'MEDIUM' ? 'MANUAL REVIEW' : 'SECONDARY VERIFICATION';
  return { risk, trust: Math.round(trust), level, action, weights: w };
}

/* ---------------- render ---------------- */

function renderResults(risk, level, action, checksObj) {
  const arc = $('gaugeArc');
  const len = 283;
  const offsets = Math.round(len * (1 - risk / 100));
  const color = risk >= 70 ? 'var(--red)' : risk >= 40 ? 'var(--amber)' : 'var(--green)';
  arc.style.strokeDashoffset = offsets;
  arc.style.stroke = color;
  $('riskNum').textContent = risk;
  $('riskNum').style.color = color;
  const badge = $('riskBadge');
  badge.textContent = level;
  badge.style.color = color;
  badge.style.borderColor = color;
  badge.style.boxShadow = `0 0 16px ${color}`;
  $('trustNote').innerHTML =
    `Composite trust score <b>${checksObj.final.trust}/100</b> after feature fusion.<br>` +
    `Strongest positive: <b>${checksObj.bestName}</b> (${checksObj.bestScore}/100) Â· strongest negative: <b>${checksObj.worstName}</b> (${checksObj.worstScore}/100).`;
  $('actionVal').textContent = action;
  $('actionVal').style.color = color;

  const cards = [
    { id: 1, r: checksObj.dv, name: 'Document Validation' },
    { id: 2, r: checksObj.ta, name: 'Tampering Analysis' },
    { id: 3, r: checksObj.fv, name: 'Face Verification' },
    { id: 4, r: checksObj.dc, name: 'Data Consistency' },
  ];
  cards.forEach(({ id, r, name }) => {
    const card = $('card' + id);
    card.className = 'card ' + r.status;
    $('bar' + id).style.width = r.score + '%';
    $('sc' + id).textContent = r.score + ' / 100';
    const st = $('st' + id);
    st.textContent = r.status.toUpperCase();
    st.className = 'status ' + r.status;
    $('wy' + id).textContent = r.notes.join(' Â· ') || 'â€”';
    $('md' + id).innerHTML = 'conf ' + r.conf + '% &nbsp;|&nbsp; ' + (r.metaLines.join('<br>') || 'â€”');
  });

  $('scoreWrap').hidden = false;
  $('checks').hidden = false;
  $('logs').hidden = false;
  window.scrollTo({ top: $('scoreWrap').offsetTop - 20, behavior: 'smooth' });
}

function resetUI() {
  $('scoreWrap').hidden = true; $('checks').hidden = true; $('logs').hidden = true;
  $('logList').innerHTML = '';
  ['riskNum', 'actionVal'].forEach(id => $(id).textContent = 'â€”');
}

/* ---------------- main run ---------------- */

async function run() {
  if (!state.doc || state.busy) return;
  state.busy = true; refreshRun();
  const btn = $('btnRun');
  const spin = btn.querySelector('.spin');
  spin.hidden = false; btn.disabled = true;
  $('logList').innerHTML = '';
  resetUI();

  const t0 = performance.now();
  const docCanvas = state.doc.canvas;
  const w = docCanvas.width, h = docCanvas.height;

  try {
    log('INIT', 'analyzing', `${w}Ã—${h}px Â· ${state.doc.meta.type}`);

    /* 1) preprocessing */
    const id = getImageData(docCanvas);
    const gray = grayscale(id);
    const st = stats(gray);
    const entropy = histogramEntropy(gray);
    const blur = laplacianVariance(gray, w, h);
    const edges = edgeDensity(gray, w, h);
    const hf = highFreqEnergy(gray, w, h);
    const hetero = regionBlurHeterogeneity(gray, w, h);
    log('PREP', 'grayscale + edge + blur + entropy features', `B=${st.brightness.toFixed(0)} C=${st.contrast.toFixed(1)} H=${entropy.toFixed(2)}`);
    log('FEAT', 'blur (Laplacian var)', blur.toFixed(1));
    log('FEAT', 'edge density', (edges * 100).toFixed(1) + '%');

    /* 2) OCR */
    const ocr = await runOcr(docCanvas);

    /* 3) forensics */
    const isLossy = /jpeg/i.test(state.doc.meta.type);
    const ela = await errorLevelAnalysis(docCanvas);
    const cloneFrac = cloneDetect(docCanvas);
    log('FOR', 'error-level analysis', ela.avail ? `hotspots=${ela.hotspotCount} mean=${ela.mean.toFixed(2)}` : 'n/a (lossless)');
    log('FOR', 'copy-move block similarity', (cloneFrac * 100).toFixed(1) + '%');

    /* 4) face */
    const fvRaw = await checkFaceVerification(docCanvas, state.face);
    log('FACE', fvRaw.engine === 'face-api' ? 'FaceRecognitionNet 128-D embed similarity' : 'skin-region + luminance similarity', state.face ? `${fvRaw.score}/100` : 'no face image');

    /* 5) checks */
    const aspect = w / h;
    const dv = checkDocumentValidation({ ...st, entropy }, ocr, aspect, state.doc.meta, blur);
    const ta = checkTampering({ ...st, hfEnergy: hf }, ela, cloneFrac, hetero, state.doc.meta, isLossy);
    const dc = checkDataConsistency(ocr, state.doc.meta, docCanvas);

    log('CHK', 'Document Validation', dv.score + '/100');
    log('CHK', 'Tampering Analysis', ta.score + '/100');
    log('CHK', 'Face Verification', fvRaw.score + '/100');
    log('CHK', 'Data Consistency', dc.score + '/100');

    /* 6) fusion */
    const final = fuse(dv, ta, fvRaw, dc);
    const names = { dv: ['Document Validation', dv.score], ta: ['Tampering Analysis', ta.score], fv: ['Face Verification', fvRaw.score], dc: ['Data Consistency', dc.score] };
    const best = Object.values(names).reduce((a, b) => (b[1] > a[1] ? b : a));
    const worst = Object.values(names).reduce((a, b) => (b[1] < a[1] ? b : a));

    log('FUSE', `risk = 100 âˆ’ (0.30Â·${dv.score} + 0.30Â·${ta.score} + 0.25Â·${fvRaw.score} + 0.15Â·${dc.score})`);
    log('DECIDE', `RISK ${final.risk}/100 â†’ ${final.level}`, `action: ${final.action}`);
    log('DONE', `pipeline finished in ${((performance.now() - t0) / 1000).toFixed(2)}s (browser, client-side)`, 'ML PROTOTYPE â€” DEMONSTRATION ONLY');

    renderResults(final.risk, final.level, final.action, { dv, ta, fv: fvRaw, dc, final, bestName: best[0], bestScore: best[1], worstName: worst[0], worstScore: worst[1] });
  } catch (e) {
    log('FAIL', 'pipeline error: ' + e.message);
    console.error(e);
  }

  state.busy = false; spin.hidden = true; refreshRun();
}

/* ---------------- sample generator ---------------- */

let SAMPLE_FACE = null;
let SAMPLE_RES = null;

async function ensureSampleFace() {
  if (SAMPLE_FACE) return SAMPLE_FACE;
  const img = await IMG('assets/img/face_sample.jpg');
  const sq = Math.min(img.width, img.height);
  const ox0 = Math.round((img.width - sq) / 2), oy0 = Math.round((img.height - sq) / 2);
  const side = 480;
  const c = document.createElement('canvas'); c.width = side; c.height = side;
  const x = c.getContext('2d');
  x.fillStyle = '#e8e9ec'; x.fillRect(0, 0, side, side);
  x.drawImage(img, ox0, oy0, sq, sq, 0, 0, side, side);
  // make it read like a clean ID headshot: lift + sharpen color so the
  // TinyFaceDetector / FaceRecognitionNet pipeline recognizes it reliably
  x.filter = 'contrast(1.18) saturate(1.2) brightness(1.06)';
  x.drawImage(c, 0, 0);
  x.filter = 'none';
  SAMPLE_FACE = c;
  // high-res variant: when pasted into the card slot, downscale (not upscale)
  // so the embedded portrait keeps sharp detail for the face nets
  const hr = 900;
  const hsc = hr / sq;
  const hrc = document.createElement('canvas');
  hrc.width = Math.round(sq * hsc); hrc.height = Math.round(sq * hsc);
  const hx = hrc.getContext('2d');
  hx.filter = 'contrast(1.18) saturate(1.2) brightness(1.06)';
  hx.drawImage(img, ox0, oy0, sq, sq, 0, 0, hrc.width, hrc.height);
  hx.filter = 'none';
  SAMPLE_RES = hrc;
  return c;
}

async function genSample() {
  try {
    const mode = await ensureFaceApi(false);
    const img = await IMG('assets/img/specimen_aadhaar.png');
    const doc = makeCanvas(img, 1200);
    await pasteSampleFace(doc);
    let selfie = null;
    let fn = null;
    if (mode === 'api' && faceNets.rec) {
      // first inference on a cold server compiles the WebGL kernels and often
      // yields borderline results â€” prime the pipeline before trusting detection
      try {
        await window.faceapi.detectSingleFace(document.createElement('canvas'), new window.faceapi.TinyFaceDetectorOptions({ inputSize: 128, scoreThreshold: 0.1 }));
      } catch (e) { /* priming only */ }
      fn = await detectFaceRobust(doc, 4);
      if (fn) selfie = makeSelfieFromDocFace(doc, fn);
    }
    if (!selfie) {
      const face = await ensureSampleFace();
      bindCanvas(makeSampleDoc(face), 'doc', 'sample-aadhaar.png');
      bindCanvas(makeSampleFace(face), 'face', 'sample-selfie.png');
      console.warn('sample: specimen face not detected â€” used drawn card fallback');
    } else {
      bindCanvas(doc, 'doc', 'specimen-aadhaar.png');
      bindCanvas(selfie, 'face', 'sample-selfie.png');
      // carry the doc-side face box so the face check can embed the doc photo
      // and its selfie deterministically (the detector rejects head-filled frames)
      if (fn) state.face._sampleHint = fn;
    }
  } catch (e) {
    console.warn('sample gen fallback â†’ drawn card', e);
    const face = await ensureSampleFace();
    bindCanvas(makeSampleDoc(face), 'doc', 'sample-aadhaar.png');
    bindCanvas(makeSampleFace(face), 'face', 'sample-selfie.png');
  }
  setTimeout(() => run(), 250);
}

async function pasteSampleFace(doc) {
  const face = await ensureSampleFace();
  const x = doc.getContext('2d');
  const pw = Math.round(doc.width * 0.06);
  const ph = Math.round(pw * 1.8);
  const px = Math.round(doc.width * 0.051);
  const py = Math.round(doc.height * 0.215);
  x.save();
  x.beginPath(); x.rect(px, py, pw, ph); x.clip();
  drawCoverFill(x, SAMPLE_RES || face, px, py, pw, ph);
  x.restore();
  x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 1;
  x.strokeRect(px - 0.5, py - 0.5, pw + 1, ph + 1);
}

function makeSelfieFromDocFace(doc, fn) {
  const pad = Math.max(fn.w * 0.45, 16);
  const cx = clamp(fn.x - pad, 0, doc.width);
  const cy = clamp(fn.y - pad * 0.75, 0, doc.height);
  const cw = Math.min(fn.w + pad * 2, doc.width - cx);
  const ch = Math.min(fn.h + pad * 1.5, doc.height - cy);
  const cut = document.createElement('canvas'); cut.width = cw; cut.height = ch;
  cut.getContext('2d').drawImage(doc, cx, cy, cw, ch, 0, 0, cw, ch);
  const c = document.createElement('canvas'); c.width = 420; c.height = 420;
  const x = c.getContext('2d');
  x.fillStyle = '#dfe6ec'; x.fillRect(0, 0, 420, 420);
  const sc = Math.min(392 / cw, 392 / ch);
  const sw = cw * sc, sh = ch * sc;
  x.drawImage(cut, (420 - sw) / 2, (420 - sh) / 2, sw, sh);
  return c;
}

function bindCanvas(canvas, kind, name) {
  state[kind] = { canvas, file: { type: kind === 'doc' ? 'image/jpeg' : 'image/png', size: Math.round(canvas.width * canvas.height * (kind === 'doc' ? 0.5 : 0.3)), name }, meta: { type: kind === 'doc' ? 'image/jpeg' : 'image/png', size: Math.round(canvas.width * canvas.height * 0.4), name, width: canvas.width, height: canvas.height, software: null, gps: false, exif: false, orientation: 1 } };
  const key = kind === 'doc' ? 'imgDoc' : 'imgFace';
  const pv = kind === 'doc' ? 'pvDoc' : 'pvFace';
  $(key).src = canvas.toDataURL();
  $(pv).hidden = false;
  $(pv).previousElementSibling.style.display = 'none';
  $(kind === 'doc' ? 'hintDoc' : 'hintFace').textContent = 'X remove';
  showStatus(kind, 'Sample loaded â€” press ANALYZE', 'ok');
  refreshRun();
}

function drawCoverFill(x, img, dx, dy, dw, dh) {
  const sc = Math.max(dw / img.width, dh / img.height);
  const sw = img.width * sc, sh = img.height * sc;
  x.drawImage(img, dx + (dw - sw) / 2, dy + (dh - sh) / 2, sw, sh);
}

function drawChakra(x, cx, cy, r) {
  x.save();
  x.fillStyle = '#0080ff';
  x.fillRect(cx - 1, cy - 5, 2, 10);
  x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
  x.fillStyle = '#fdfdfb';
  x.beginPath(); x.arc(cx, cy, r * 0.74, 0, 7); x.fill();
  x.fillStyle = '#0080ff';
  x.beginPath(); x.arc(cx, cy, r * 0.3, 0, 7); x.fill();
  x.strokeStyle = '#0080ff'; x.lineWidth = 1.7;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    x.beginPath(); x.moveTo(cx + Math.cos(a) * r * 0.32, cy + Math.sin(a) * r * 0.32);
    x.lineTo(cx + Math.cos(a) * r * 0.74, cy + Math.sin(a) * r * 0.74); x.stroke();
  }
  x.restore();
}

function drawQR(x, qx, qy, qs) {
  x.fillStyle = '#fff'; x.fillRect(qx, qy, qs, qs);
  x.fillStyle = '#0a0a0a';
  const cells = 27, cell = qs / cells;
  let seed = 1337;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const inFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= cells - 7) || (r >= cells - 7 && c < 7);
  for (let r = 0; r < cells; r++) for (let c = 0; c < cells; c++) {
    if (inFinder(r, c)) continue;
    if (rnd() < 0.47) x.fillRect(qx + c * cell, qy + r * cell, cell + 0.5, cell + 0.5);
  }
  const finder = (fr, fc) => {
    x.fillRect(qx + fc * cell, qy + fr * cell, 7 * cell, 7 * cell);
    x.fillStyle = '#fff'; x.fillRect(qx + (fc + 1) * cell, qy + (fr + 1) * cell, 5 * cell, 5 * cell);
    x.fillStyle = '#0a0a0a'; x.fillRect(qx + (fc + 2) * cell, qy + (fr + 2) * cell, 3 * cell, 3 * cell);
  };
  finder(0, 0); finder(0, cells - 7); finder(cells - 7, 0);
}

function makeSampleDoc(face) {
  const w = 640, h = 900;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');

  // card paper
  x.fillStyle = '#fdfdfb'; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#d7d2c3'; x.lineWidth = 2;
  x.strokeRect(12, 12, w - 24, h - 24);

  // tricolor band (saffron Â· white Â· green)
  const bh = 14;
  x.fillStyle = '#ff9933'; x.fillRect(12, 12, w - 24, bh);
  x.fillStyle = '#ffffff'; x.fillRect(12, 22, w - 24, bh);
  x.fillStyle = '#138808'; x.fillRect(12, 32, w - 24, bh);

  // emblem + government line
  drawChakra(x, 78, 128, 30);
  x.textAlign = 'left';
  x.fillStyle = '#111';
  x.font = '600 23px "Segoe UI", Arial';
  x.fillText('à¤­à¤¾à¤°à¤¤ à¤¸à¤°à¤•à¤¾à¤°', 120, 122);
  x.font = '500 13px "Segoe UI", Arial';
  x.fillStyle = '#555';
  x.fillText('GOVERNMENT OF INDIA', 120, 146);

  // AADHAAR mark
  x.textAlign = 'right';
  x.fillStyle = '#111';
  x.font = '700 32px "Segoe UI", Arial';
  x.fillText('à¤†à¤§à¤¾à¤°', w - 40, 120);
  x.font = '600 20px "Segoe UI", Arial';
  x.fillStyle = '#b0a57a';
  x.fillText('AADHAAR', w - 40, 150);
  x.textAlign = 'left';

  // photo
  const px = 44, py = 188, pw = 165, ph = 205;
  x.fillStyle = '#fff'; x.fillRect(px, py, pw, ph);
  x.strokeStyle = '#999'; x.lineWidth = 1.2;
  x.strokeRect(px, py, pw, ph);
  x.save(); x.beginPath(); x.rect(px + 1, py + 1, pw - 2, ph - 2); x.clip();
  drawCoverFill(x, face, px, py, pw, ph);
  x.restore();
  x.font = '600 13px "Segoe UI", Arial'; x.fillStyle = '#555';
  x.fillText('Enrolment: 2345/67890/12345', px, py + ph + 28);

  // fields
  const fx = 246;
  const field = (label, value, yy) => {
    x.fillStyle = '#8a8a8a'; x.font = '12px "Segoe UI", Arial';
    x.fillText(label, fx, yy);
    x.fillStyle = '#111'; x.font = '600 24px "Segoe UI", Arial';
    x.fillText(value, fx, yy + 25);
  };
  field('Name', 'ARJUN KUMAR MEHTA', 222);
  field('Date of Birth', '02/04/1991', 288);
  field('Gender', 'MALE', 354);

  // address
  x.fillStyle = '#8a8a8a'; x.font = '12px "Segoe UI", Arial';
  x.fillText('Address', fx, 448);
  x.fillStyle = '#111'; x.font = '500 21px "Segoe UI", Arial';
  const addr = ['H-42, SECTOR 17,', 'NEAR CLOCK TOWER,', 'NEW DELHI NCR, 209321'];
  addr.forEach((l, i) => x.fillText(l, fx, 474 + i * 27));

  // signature
  x.strokeStyle = '#222'; x.lineWidth = 1.6; x.lineCap = 'round';
  x.beginPath();
  x.moveTo(44, 560); x.bezierCurveTo(90, 548, 130, 582, 180, 556);
  x.bezierCurveTo(215, 540, 240, 584, 285, 560); x.stroke();
  x.font = '11px "Segoe UI", Arial'; x.fillStyle = '#777';
  x.fillText('Signature', 44, 578);

  // QR code (masked data marker)
  drawQR(x, w - 200, 552, 150);

  // masked identity note
  x.fillStyle = '#c0392b'; x.font = '700 13px "Segoe UI", Arial';
  x.fillText('NOT VALID FOR IDENTITY PURPOSES â€” DEMO DATA', 44, 630);

  // big masked number
  x.fillStyle = '#2b2b2b'; x.font = '700 26px "Segoe UI", Arial';
  x.fillText('XXXX  XXXX  3456', 44, 690);

  // barcode strip
  x.fillStyle = '#000';
  for (let i = 0; i < 90; i++) x.fillRect(44 + i * 3.4, 730, 2.2, 42 - ((i * 7) % 22));

  // footer
  x.fillStyle = '#bbb'; x.font = '600 11px "Segoe UI", Arial';
  x.fillText('echelon@eclipse-verify.in Â· DEMONSTRATION SAMPLE', 44, 812);

  return c;
}

function makeSampleFace(face) {
  const c = document.createElement('canvas'); c.width = 420; c.height = 420;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(210, 200, 40, 210, 210, 420);
  g.addColorStop(0, '#3a5d8a'); g.addColorStop(1, '#0b1526');
  x.fillStyle = g; x.fillRect(0, 0, 420, 420);
  const side = 340;
  x.drawImage(face, (420 - side) / 2, (420 - side) / 2 + 8, side, side);
  return c;
}

/* ---------------- face liveness : blink detection ---------------- */

const FACEP_API = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/dist/face-api.js';
const FACEP_MODEL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model';

let faceNets = { detect: false, rec: false };

const live = { stream: null, timer: null, running: false, mode: 'heuristic', blinks: 0, state: 'open', closedFrames: 0, sinceBlink: 99, baseline: [], noFace: 0, ac: null, ax: null };

if ($('btnLiveness')) {
  $('btnLiveness').addEventListener('click', openLiveness);
  $('lvClose').addEventListener('click', () => closeLiveness());
  $('lvCancel').addEventListener('click', () => closeLiveness());
  $('lvRetry').addEventListener('click', () => openLiveness());
}

async function openLiveness() {
  stopCamera();
  live.running = false;
  if (live.timer) clearTimeout(live.timer);
  const ov = $('livenessOverlay');
  ov.hidden = false;
  $('lvRetry').hidden = true;
  setLvStatus('Starting cameraâ€¦');
  setLvDots(0);
  try {
    live.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch (e) {
    setLvStatus('Camera unavailable â€” allow camera access (needs HTTPS/localhost) or upload a face photo instead.', 'err');
    $('lvRetry').hidden = false;
    return;
  }
  const v = $('lvVideo');
  v.srcObject = live.stream;
  try { await v.play(); } catch (e) { /* autoplay handled */ }
  setLvStatus('Finding your face â€” blink 2 times to confirmâ€¦');
  log('LIVE', 'camera on â€” blink-liveness session started');
  live.mode = await ensureFaceApi(true);
  live.blinks = 0; live.state = 'open'; live.closedFrames = 0; live.sinceBlink = 99; live.baseline = []; live.noFace = 0;
  live.running = true;
  livenessLoop();
}

async function ensureFaceApi(detectOnly) {
  try {
    if (!window.faceapi) {
      const ok = await loadScript(FACEP_API, 20000);
      if (!ok || !window.faceapi) return 'heuristic';
    }
    const uri = FACEP_MODEL;
    if (!faceNets.detect) {
      await window.faceapi.tf.ready();
      await window.faceapi.nets.tinyFaceDetector.loadFromUri(uri);
      await window.faceapi.nets.faceLandmark68Net.loadFromUri(uri);
      faceNets.detect = true;
    }
    if (!detectOnly && !faceNets.rec) {
      await window.faceapi.nets.faceRecognitionNet.loadFromUri(uri);
      faceNets.rec = true;
    }
    return 'api';
  } catch (e) { console.warn('face-api models unavailable â€” using heuristics', e); return 'heuristic'; }
}

async function livenessLoop() {
  if (!live.running) return;
  try {
    let score = null, face = true;
    const v = $('lvVideo');
    if (live.mode === 'api') {
      const res = await window.faceapi.detectSingleFace(v, new window.faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.45 })).withFaceLandmarks();
      face = !!res;
      if (res) score = avgEar(res.landmarks.positions);
    } else {
      const h = heuristicEyeInfo(v);
      face = h.face;
      if (face) score = h.score;
    }
    if (!face) {
      live.noFace++;
      if (live.noFace === 15) setLvStatus('No face detected â€” stay inside the oval.');
    } else {
      live.noFace = 0;
      if (live.blinks === 0 && live.mode === 'api') setLvStatus('Face found â€” now blink 2 times.');
    }
    updateBlink(score);
    if (live.blinks >= 2) { finishLiveness(); return; }
  } catch (e) { console.warn('liveness frame error', e); }
  live.timer = setTimeout(livenessLoop, 70);
}

function avgEar(mark) {
  const e = (o) => {
    const p0 = mark[o], p1 = mark[o + 1], p2 = mark[o + 2], p3 = mark[o + 3], p4 = mark[o + 4], p5 = mark[o + 5];
    return (Math.hypot(p1.x - p5.x, p1.y - p5.y) + Math.hypot(p2.x - p4.x, p2.y - p4.y)) / (2 * Math.hypot(p0.x - p3.x, p0.y - p3.y) + 1e-6);
  };
  return (e(36) + e(42)) / 2;
}

function heuristicEyeInfo(video) {
  if (!live.ac) { live.ac = document.createElement('canvas'); live.ac.width = 320; live.ax = live.ac.getContext('2d'); }
  const c = live.ac;
  c.height = Math.max(2, Math.round(video.videoHeight * (320 / Math.max(1, video.videoWidth))));
  live.ax.drawImage(video, 0, 0, c.width, c.height);
  const id = live.ax.getImageData(0, 0, c.width, c.height);
  const blob = largestSkinBlob(skinMask(id), c.width, c.height);
  if (!blob || blob.count < c.width * c.height * 0.04) return { face: false };
  const g = grayscale(id);
  const y0 = blob.minY + Math.round(blob.h * 0.3), y1 = blob.minY + Math.round(blob.h * 0.55);
  let s = 0, sq = 0, n = 0;
  for (let y = Math.max(0, y0); y < Math.min(c.height, y1); y++) for (let x = blob.minX; x <= blob.maxX; x++) {
    const val = g[y * c.width + x]; s += val; sq += val * val; n++;
  }
  if (!n) return { face: false };
  const mean = s / n;
  return { face: true, score: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
}

function updateBlink(score) {
  if (score === null) return;
  live.sinceBlink++;
  let closed;
  if (live.mode === 'api') {
    closed = score < 0.20;
  } else {
    live.baseline.push(score);
    if (live.baseline.length > 14) live.baseline.shift();
    const arr = [...live.baseline].sort((a, b) => a - b);
    const med = arr[Math.floor(arr.length / 2)];
    closed = med > 8 && score < Math.max(8, med * 0.34);
  }
  if (closed) {
    live.closedFrames++;
    if (live.closedFrames >= (live.mode === 'api' ? 2 : 3)) live.state = 'closed';
  } else if (live.state === 'closed' && live.sinceBlink > 8) {
    live.state = 'open';
    live.blinks = Math.min(2, live.blinks + 1);
    live.sinceBlink = 0;
    setLvDots(live.blinks);
    setLvStatus(live.blinks >= 2 ? 'Liveness confirmed!' : `Blink ${live.blinks}/2 â€” one moreâ€¦`);
    log('LIVE', `blink ${live.blinks}/2 detected`, live.mode === 'api' ? 'EAR' : 'eye-variance');
  } else {
    live.state = 'open';
    live.closedFrames = 0;
  }
}

function setLvStatus(msg, type) {
  $('lvStatus').textContent = msg;
  $('lvStatus').style.color = type === 'err' ? 'var(--red)' : '';
}
function setLvDots(n) {
  $('lvDots').innerHTML = [0, 1].map(i => `<span class="${i < n ? 'on' : 'off'}">&bull;</span>`).join('');
}

function finishLiveness() {
  live.running = false;
  if (live.timer) clearTimeout(live.timer);
  const v = $('lvVideo');
  const blinks = live.blinks;
  const mode = live.mode;
  setTimeout(() => {
    const c = document.createElement('canvas'); c.width = 480; c.height = 480;
    const x = c.getContext('2d');
    const vw = v.videoWidth || 640, vh = v.videoHeight || 480;
    const sc = Math.max(480 / vw, 480 / vh);
    const dw = vw * sc, dh = vh * sc;
    x.drawImage(v, (480 - dw) / 2, (480 - dh) / 2, dw, dh);
    c.toBlob(async (b) => {
      stopCamera();
      $('livenessOverlay').hidden = true;
      if (!b) { showStatus('face', 'Capture failed â€” try again.', 'err'); return; }
      const f = new File([b], 'liveness-capture.jpg', { type: 'image/jpeg' });
      await loadInto('face', URL.createObjectURL(b), f);
      state.face.liveness = { pass: true, blinks, mode };
      showStatus('face', `LIVENESS PASS Â· ${blinks} blinks detected Â· face captured`, 'ok');
      log('LIVE', `liveness PASS â€” ${blinks} blinks (${mode}) â€” face captured for matching`);
      if (state.doc && !state.busy) setTimeout(() => run(), 1200);
    }, 'image/jpeg', 0.92);
  }, 200);
}

function stopCamera() {
  if (live.stream) { live.stream.getTracks().forEach(t => t.stop()); live.stream = null; }
  $('lvVideo').srcObject = null;
}
function closeLiveness() {
  live.running = false;
  if (live.timer) clearTimeout(live.timer);
  stopCamera();
  $('livenessOverlay').hidden = true;
}

/* ---------------- boot ---------------- */

refreshRun();
console.log('%c ECLIPSE VERIFY - ML PROTOTYPE (DEMONSTRATION ONLY) ', 'background:#0b1220;color:#38bdf8;font-weight:bold');

// Auto-load sample documents if requested in URL query
if (window.location.search.includes('sample') || window.location.search.includes('demo')) {
  setTimeout(() => {
    const btn = btnSample;
    if (btn) btn.click();
  }, 350);
}color:#38bdf8;font-weight:bold');
