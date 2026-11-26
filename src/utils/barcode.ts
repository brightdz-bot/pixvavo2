/**
 * Pure ISO/IEC 15417 Code 128 (Code Set B) barcode encoder.
 * Zero external dependencies — outputs exact bar positions & widths for crisp SVG rendering
 * on both A4 paper and 10x15cm thermal courier labels.
 */

// Official 107-entry Code 128 pattern table (bar/space widths, each symbol sums to 11 modules; Stop [106] sums to 13)
const CODE128_PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112'
];

const START_CODE_B = 104;
const STOP_CODE = 106;
const QUIET_ZONE_MODULES = 10;

export interface BarcodeBar {
  x: number;
  width: number;
}

export interface EncodedCode128 {
  text: string;
  bars: BarcodeBar[];
  totalWidth: number;
  checksum: number;
}

/**
 * Sanitizes text to printable ASCII characters supported by Code 128B (char codes 32..126).
 */
export function sanitizeCode128Text(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^\x20-\x7E]/g, '');
  return cleaned.slice(0, 48) || 'DZ-ORDER';
}

/**
 * Encodes an order number or courier tracking code into Code 128B bar coordinates.
 */
export function encodeCode128B(rawValue: string): EncodedCode128 {
  const text = sanitizeCode128Text(rawValue);
  const codes: number[] = [START_CODE_B];
  let checksumSum = START_CODE_B;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32;
    const safeCode = code >= 0 && code <= 94 ? code : 0;
    codes.push(safeCode);
    checksumSum += safeCode * (i + 1);
  }

  const checksum = checksumSum % 103;
  codes.push(checksum);
  codes.push(STOP_CODE);

  const bars: BarcodeBar[] = [];
  let cursor = QUIET_ZONE_MODULES;

  for (const sym of codes) {
    const pattern = CODE128_PATTERNS[sym];
    if (!pattern) continue;
    for (let j = 0; j < pattern.length; j++) {
      const w = Number(pattern[j]);
      if (j % 2 === 0) {
        bars.push({ x: cursor, width: w });
      }
      cursor += w;
    }
  }

  const totalWidth = cursor + QUIET_ZONE_MODULES;
  return { text, bars, totalWidth, checksum };
}
