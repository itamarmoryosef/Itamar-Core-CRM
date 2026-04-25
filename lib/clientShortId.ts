/** Lowercase alnum, 6 chars; avoids ambiguous 0/O/1/l. */
const SHORT_ID_LENGTH = 6;
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

export function generateClientShortId(): string {
  const bytes = new Uint8Array(SHORT_ID_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < SHORT_ID_LENGTH; i++) {
    s += ALPHABET[bytes[i]! % ALPHABET.length]!;
  }
  return s;
}

export function isPostgresUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

/** UUID string with dashes (any version). */
const UUID_WITH_DASHES_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isClientUuidParam(value: string): boolean {
  return UUID_WITH_DASHES_RE.test(value.trim());
}

export function isValidShortIdParam(value: string): boolean {
  return /^[a-z0-9]{6}$/.test(value.trim().toLowerCase());
}
