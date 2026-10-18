// Barcode scanning with the phone camera (Chrome's built-in BarcodeDetector)
// and a lookup in Open Food Facts, a free public food database. Only the
// barcode number is sent.

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

export async function canScan() {
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    const f = await BarcodeDetector.getSupportedFormats();
    return FORMATS.some(x => f.includes(x));
  } catch {
    return false;
  }
}

export class Scanner {
  constructor(video, onCode) {
    this.video = video;
    this.onCode = onCode;
    this.running = false;
    this.last = null;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    const supported = await BarcodeDetector.getSupportedFormats();
    this.det = new BarcodeDetector({ formats: FORMATS.filter(f => supported.includes(f)) });
    this.running = true;
    this.loop();
  }

  async loop() {
    if (!this.running) return;
    try {
      if (this.video.readyState >= 2) {
        const codes = await this.det.detect(this.video);
        const c = codes.find(x => /^\d{8,14}$/.test(x.rawValue));
        // The same code twice in a row, so a blurry misread doesn't count.
        if (c && c.rawValue === this.last) {
          this.stop();
          this.onCode(c.rawValue);
          return;
        }
        this.last = c ? c.rawValue : null;
      }
    } catch {}
    if (this.running) this.timer = setTimeout(() => this.loop(), 120);
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
  }
}

export const cleanCode = s => String(s || '').replace(/\D/g, '');

// 12-digit UPC-A codes are usually stored as 13-digit EANs with a leading 0.
export async function lookup(code) {
  const c = cleanCode(code);
  const tries = c.length === 12 ? ['0' + c, c] : [c];
  for (const k of tries) {
    const r = await fetchProduct(k);
    if (r) return r;
  }
  return null;
}

async function fetchProduct(code) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_en,brands,serving_size,serving_quantity,nutriments`;
    const res = await fetch(url, { signal: ctl.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
    const d = await res.json();
    return d.status === 1 && d.product ? parse(code, d.product) : null;
  } finally {
    clearTimeout(timer);
  }
}

const num = v => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

function parse(code, p) {
  const n = p.nutriments || {};
  const kj = num(n['energy-kj_100g']) ?? num(n.energy_100g);
  const kcal100 = num(n['energy-kcal_100g']) ?? (kj !== null ? kj / 4.184 : null);
  const kcalS = num(n['energy-kcal_serving']);
  const sq = num(p.serving_quantity);
  return {
    code,
    name: (p.product_name_en || p.product_name || '').trim(),
    brand: (p.brands || '').split(',')[0].trim(),
    servingG: sq > 0 ? sq : null,
    servingLabel: (p.serving_size || '').trim(),
    per100: kcal100 !== null ? { kcal: kcal100, p: num(n.proteins_100g) ?? 0 } : null,
    perServing: kcalS !== null ? { kcal: kcalS, p: num(n.proteins_serving) ?? 0 } : null,
  };
}
