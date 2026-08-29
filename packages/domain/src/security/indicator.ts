import type { SecurityIndicatorType } from '@airdrop/contracts';

// The explicit characters are part of the PostgreSQL-compatible whitespace contract.
// eslint-disable-next-line no-control-regex
const indicatorWhitespace = /[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/gu;
// C0 and C1 controls that remain after whitespace normalization are not safe indicator text.
// eslint-disable-next-line no-control-regex
const remainingControlCharacter = /[\u0000-\u0008\u000E-\u001F\u007F-\u0084\u0086-\u009F]/u;

export interface SecurityIndicatorLexicalInput {
  readonly type: SecurityIndicatorType;
  readonly value: string;
  readonly evidenceText: string;
}

export function normalizeSecurityIndicatorValueV1(value: string): string {
  return value.replace(indicatorWhitespace, ' ').replace(/^ +| +$/g, '');
}

export function isSecurityIndicatorLexicallyValid(input: SecurityIndicatorLexicalInput): boolean {
  const value = normalizeSecurityIndicatorValueV1(input.value);
  if (!isWellFormedUnicode(value) || remainingControlCharacter.test(value)) {
    return false;
  }

  const characterCount = [...value].length;
  if (characterCount < 1 || characterCount > 500) {
    return false;
  }

  if (input.type === 'domain' && (!isDomainValue(value) || characterCount > 253)) {
    return false;
  }
  if (input.type === 'url' && !isHttpUrl(value)) {
    return false;
  }

  const normalizedEvidence = normalizeSecurityIndicatorValueV1(input.evidenceText);
  return isWellFormedUnicode(normalizedEvidence) && normalizedEvidence.includes(value);
}

function isDomainValue(value: string): boolean {
  return !value.includes(' ') && !remainingControlCharacter.test(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (Number.isNaN(next) || next < 0xDC00 || next > 0xDFFF) {
        return false;
      }
      index += 1;
    } else if (codeUnit >= 0xDC00 && codeUnit <= 0xDFFF) {
      return false;
    }
  }
  return true;
}
