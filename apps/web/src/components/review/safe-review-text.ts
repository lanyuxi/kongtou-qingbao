const hiddenReviewValue = '[内容已隐藏]';

const urlScheme = /(?:^|[^a-z0-9+.-])[a-z][a-z0-9+.-]*:/iu;
const sensitiveKeyword = /(?:api[_-]?key|authorization|bearer|credential|forbidden|key|mnemonic|password|private[ _-]?key|provider|raw|secret|seed(?:[ _-]?phrase)?|token|error[ _-]?detail|source[ _-]?body|output|usage)/iu;
const longOpaqueValue = /^[A-Za-z0-9+/_=-]{48,}$/u;
const jwtLikeValue = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/u;
const machineTokenCharacters = /^[A-Za-z0-9+/_=-]+$/u;

export function displayReviewValue(value: string): string {
  if (
    urlScheme.test(value)
    || value.includes('@')
    || sensitiveKeyword.test(value)
    || containsControlCharacter(value)
    || resemblesMachinePayload(value)
    || resemblesOpaqueCredential(value)
    || Array.from(value).length > 200
  ) return hiddenReviewValue;
  return value;
}

function resemblesOpaqueCredential(value: string): boolean {
  if (jwtLikeValue.test(value) || longOpaqueValue.test(value)) return true;

  const characters = Array.from(value);
  if (
    characters.length < 24
    || characters.length > 47
    || !machineTokenCharacters.test(value)
    || !/[A-Z]/u.test(value)
    || !/[a-z]/u.test(value)
    || !/[0-9]/u.test(value)
  ) return false;

  const alphabeticRuns = value.match(/[A-Za-z]+/gu) ?? [];
  const uniqueCharacterRatio = new Set(characters).size / characters.length;
  return alphabeticRuns.every((run) => run.length < 6) && uniqueCharacterRatio >= 0.7;
}

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
  });
}

function resemblesMachinePayload(value: string): boolean {
  const trimmed = value.trimStart();
  return trimmed.startsWith('{')
    || trimmed.startsWith('[')
    || trimmed.startsWith('<')
    || value.includes('{')
    || value.includes('}')
    || value.includes('[')
    || value.includes(']');
}
