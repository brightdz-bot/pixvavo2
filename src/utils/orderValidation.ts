// Shared anti-fake-order & data integrity validation for Algerian COD storefront,
// Google Sheet sync, and Express server endpoints.

const ARABIC_INDIC_DIGITS: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9'
};

export function toAsciiDigits(raw: string): string {
  return String(raw || '').replace(/[٠-٩۰-۹]/g, ch => ARABIC_INDIC_DIGITS[ch] || ch);
}

/**
 * Normalizes an Algerian mobile phone number to local 10-digit format (05/06/07 + 8 digits)
 * when possible, returning digits only.
 */
export function normalizeAlgerianMobile(raw: string): string {
  const ascii = toAsciiDigits(raw);
  const digits = ascii.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('00213') && digits.length >= 13) {
    return '0' + digits.slice(5);
  }
  if (digits.startsWith('213') && digits.length >= 11) {
    return '0' + digits.slice(3);
  }
  if (digits.length === 9 && (digits.startsWith('5') || digits.startsWith('6') || digits.startsWith('7'))) {
    return '0' + digits;
  }
  return digits;
}

const KNOWN_SEQUENTIAL_PATTERNS = new Set([
  '01234567',
  '12345678',
  '23456789',
  '34567890',
  '98765432',
  '87654321',
  '76543210',
  '65432109',
  '12341234',
  '00001111',
  '11110000',
  '11112222',
  '22223333',
  '01020304',
  '10203040',
  '00112233',
  '11223344',
  '55667788',
  '66778899'
]);

export interface PhoneValidationResult {
  valid: boolean;
  normalized: string;
  code?: 'empty' | 'invalid_format' | 'fake_pattern';
  error?: string;
}

/**
 * Strict validation for Algerian mobile numbers (Mobilis 06, Djezzy 07, Ooredoo 05).
 * Blocks invalid prefixes (01/02/03/04/08/09/00), wrong lengths, repeated digits,
 * alternating spam patterns, and sequential fake numbers.
 */
export function validateAlgerianPhone(rawPhone: string): PhoneValidationResult {
  const normalized = normalizeAlgerianMobile(rawPhone);
  if (!normalized) {
    return {
      valid: false,
      normalized: '',
      code: 'empty',
      error: 'يرجى إدخال رقم هاتف جزائري صحيح (10 أرقام يبدأ بـ 05 أو 06 أو 07)'
    };
  }

  if (!/^0[567][0-9]{8}$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      code: 'invalid_format',
      error: 'يرجى إدخال رقم هاتف جزائري حقيقي (10 أرقام يبدأ بـ 05 أو 06 أو 07)'
    };
  }

  const subscriber = normalized.slice(2); // 8 digits after 05/06/07

  // Reject all identical digits (e.g. 0500000000, 0655555555, 0777777777)
  if (/^(\d)\1{7}$/.test(subscriber)) {
    return {
      valid: false,
      normalized,
      code: 'fake_pattern',
      error: 'رقم الهاتف المدخل غير حقيقي، يرجى إدخال رقم هاتفك الفعلي لتأكيد الطلب'
    };
  }

  // Reject 6 or more consecutive identical digits (e.g. 0555555512, 0600000011)
  if (/(\d)\1{5,}/.test(subscriber)) {
    return {
      valid: false,
      normalized,
      code: 'fake_pattern',
      error: 'رقم الهاتف المدخل يبدو غير صحيح، يرجى التحقق وإدخال رقمك الفعلي'
    };
  }

  // Reject repeating 2-digit spam pattern (e.g. 0512121212, 0606060606, 0701010101)
  if (/^(\d\d)\1{3}$/.test(subscriber) || /^(\d\d)\1{4}$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      code: 'fake_pattern',
      error: 'رقم الهاتف المدخل يبدو غير صحيح، يرجى إدخال رقمك الفعلي'
    };
  }

  // Reject known sequential / dummy subscriber patterns (e.g. 0512345678, 0687654321)
  if (
    KNOWN_SEQUENTIAL_PATTERNS.has(subscriber) ||
    '01234567890'.includes(subscriber) ||
    '98765432109'.includes(subscriber)
  ) {
    return {
      valid: false,
      normalized,
      code: 'fake_pattern',
      error: 'رقم الهاتف المدخل غير حقيقي، يرجى إدخال رقم هاتفك الفعلي لتأكيد الطلب'
    };
  }

  return { valid: true, normalized };
}

const JUNK_NAMES = new Set([
  'asdf',
  'asdfg',
  'asdfgh',
  'qwerty',
  'azerty',
  'zxcvb',
  'qwert',
  'azert',
  'fake',
  'spam',
  'bot',
  'null',
  'undefined',
  'none',
  'n/a',
  'na',
  'xxx',
  'xxxx',
  'zzz',
  'aaa',
  'bbb',
  'ccc',
  'وهمي',
  'طلب وهمي',
  'بلا اسم',
  'بدون اسم',
  'غير معروف',
  'لا يوجد',
  'زبون google sheet'
]);

export interface NameValidationResult {
  valid: boolean;
  cleaned: string;
  code?: 'empty' | 'too_short' | 'invalid_chars' | 'fake_pattern';
  error?: string;
}

/**
 * Validates customer full name to block blank entries, numeric/symbol-only inputs,
 * URL spam, repeated characters (e.g. "aaaa", "ههههه"), and obvious keyboard mash.
 */
export function validateCustomerName(rawName: string): NameValidationResult {
  const cleaned = String(rawName || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return {
      valid: false,
      cleaned: '',
      code: 'empty',
      error: 'يرجى إدخال الاسم الكامل بشكل صحيح'
    };
  }

  if (cleaned.length < 2 || cleaned.length > 80) {
    return {
      valid: false,
      cleaned,
      code: 'too_short',
      error: 'يرجى إدخال الاسم الكامل بشكل صحيح (حرفين على الأقل)'
    };
  }

  // Block URLs / links / emails pasted by spam bots
  if (/(https?:\/\/|www\.|\.(com|net|org|ru|xyz|info|io)\b|@)/i.test(cleaned)) {
    return {
      valid: false,
      cleaned,
      code: 'fake_pattern',
      error: 'يرجى إدخال اسم حقيقي بدون روابط أو رموز'
    };
  }

  // Must contain at least 2 real Arabic or Latin letters
  const letters = cleaned.match(/[\u0621-\u064A\u0671-\u06D3a-zA-Z]/g) || [];
  if (letters.length < 2) {
    return {
      valid: false,
      cleaned,
      code: 'invalid_chars',
      error: 'يرجى إدخال الاسم بالحروف (وليس أرقاماً أو رموزاً فقط)'
    };
  }

  // Reject if digits make up half or more of the name
  const digitCount = (toAsciiDigits(cleaned).match(/\d/g) || []).length;
  if (digitCount > 0 && digitCount >= letters.length) {
    return {
      valid: false,
      cleaned,
      code: 'invalid_chars',
      error: 'يرجى إدخال الاسم الكامل بشكل صحيح بدون أرقام'
    };
  }

  // Reject single character repeated (e.g. "aaaa", "ممممم", "ههههه")
  const normalizedLetters = letters.join('').toLowerCase();
  if (/(.)\1{3,}/.test(normalizedLetters)) {
    return {
      valid: false,
      cleaned,
      code: 'fake_pattern',
      error: 'يرجى إدخال اسمك الحقيقي بشكل صحيح'
    };
  }
  if (normalizedLetters.length >= 3 && new Set(normalizedLetters.split('')).size < 2) {
    return {
      valid: false,
      cleaned,
      code: 'fake_pattern',
      error: 'يرجى إدخال اسمك الحقيقي بشكل صحيح'
    };
  }

  if (JUNK_NAMES.has(cleaned.toLowerCase())) {
    return {
      valid: false,
      cleaned,
      code: 'fake_pattern',
      error: 'يرجى إدخال الاسم الكامل الحقيقي لإتمام الطلب'
    };
  }

  return { valid: true, cleaned };
}

/**
 * Determines whether a Google Sheet row represents a real order rather than
 * a phantom/blank row (such as rows containing only date + order number).
 */
export function isRealSheetOrderRow(row: {
  fullName?: string;
  phone?: string;
  wilaya?: string;
  orderName?: string;
  total?: number;
}): boolean {
  const name = String(row.fullName || '').trim();
  const phoneDigits = normalizeAlgerianMobile(String(row.phone || ''));
  const wilaya = String(row.wilaya || '').trim();
  const orderName = String(row.orderName || '').trim();

  const hasValidPhone =
    phoneDigits.length >= 8 &&
    !/^0+$/.test(phoneDigits) &&
    !/^(\d)\1+$/.test(phoneDigits);
  const nameLetters = (name.match(/[\u0621-\u064A\u0671-\u06D3a-zA-Z]/g) || []).length;
  const hasRealName = nameLetters >= 2 && name.toLowerCase() !== 'زبون google sheet';

  // Phantom rows with ONLY date + order number have neither a real name nor a real phone
  if (!hasRealName && !hasValidPhone) {
    return false;
  }

  // If phone is completely missing/zeros AND there is neither wilaya nor product, treat as phantom row
  if (!hasValidPhone && !wilaya && !orderName) {
    return false;
  }

  return true;
}
