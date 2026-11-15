/**
 * Password storage: salted slow hashing (PBKDF2) + AES-GCM encryption for
 * the share-password display copy.
 *
 * Background: login passwords were stored as a bare unsalted SHA-256 hex in
 * the D1 `settings` table, and share passwords were stored as an unsalted
 * SHA-256 `passwordHash` PLUS a plaintext `password` copy in KV (the copy
 * exists so the admin share list can show the password behind the eye icon).
 * With unsalted SHA-256, every share using the same 6-digit code has the
 * identical hash, and all 1M possible 6-digit codes can be precomputed once
 * and matched against any dumped hash — the iteration count is not the main
 * defence for 6-digit codes (online guessing is already rate-limited, see
 * rate-limit.ts); the per-password random salt is.
 *
 * Formats:
 * - Password hash: `pbkdf2-sha256$<iterations>$<salt-b64url>$<key-b64url>`
 *   The iteration count travels with the hash, so raising it later does not
 *   invalidate existing hashes.
 * - Legacy password hash: a 64-char hex SHA-256 digest (pre-2026-11-15).
 *   Verification still accepts it, and a successful verification upgrades
 *   the stored hash in place (see checkPassword / verifySharePassword).
 * - Encrypted share-password display copy: `aesgcm$<iv-b64url>$<ct-b64url>`
 *   (AES-256-GCM, random 12-byte IV per encryption). The key comes from the
 *   `SHARE_PASSWORD_KEY` env secret (base64url of 16/24/32 random bytes).
 *   Without the key, new shares store no display copy (null) instead of
 *   silently falling back to plaintext; legacy plaintext copies are left
 *   untouched until the next successful verification/update re-encrypts
 *   them (when a key is configured).
 */

// PBKDF2-SHA256, 16-byte salt, 32-byte derived key.
//
// Iterations are deliberately modest: ~5 ms of CPU per verification.
// Share verification runs on every download attempt, and the free-tier
// CPU budget is 10 ms per request — a 100k-iteration hash (~110 ms) would
// break logins and downloads on the free tier. If the Worker runs on the
// paid plan, raise this; existing hashes keep working because the count
// is stored in the hash itself.
export const PBKDF2_ITERATIONS = 5000;
const PBKDF2_HASH_LEN = 32;
const PBKDF2_SALT_LEN = 16;
const HASH_PREFIX = "pbkdf2-sha256";
const LEGACY_SHA256_HEX = /^[0-9a-f]{64}$/;

const ENCRYPTED_PREFIX = "aesgcm";
const AES_IV_LEN = 12;

// ───── base64url helpers (btoa/atob exist in workerd and Node) ─────

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

// ───── SHA-256 (legacy hashes only) ─────

export async function sha256Hex(str: string): Promise<string> {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.subtle.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ───── PBKDF2 password hashing ─────

/** Hash a password with a fresh random salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_LEN));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  return `${HASH_PREFIX}$${PBKDF2_ITERATIONS}$${b64urlEncode(salt)}$${b64urlEncode(key)}`;
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    base,
    PBKDF2_HASH_LEN * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Verify a password against a stored hash.
 * Accepts both the PBKDF2 format and legacy bare SHA-256 hex; `legacy`
 * is true when the stored hash is the old format (the caller should
 * upgrade it to PBKDF2 on success).
 */
export async function verifyPasswordHash(
  stored: string | null | undefined,
  password: string,
): Promise<{ ok: boolean; legacy: boolean }> {
  if (!stored) return { ok: false, legacy: false };

  if (stored.startsWith(`${HASH_PREFIX}$`)) {
    const parts = stored.split("$");
    if (parts.length !== 4) return { ok: false, legacy: false };
    const iterations = Number(parts[1]);
    const salt = b64urlDecode(parts[2]);
    const expected = b64urlDecode(parts[3]);
    if (!Number.isInteger(iterations) || iterations <= 0 || !salt || !expected) {
      return { ok: false, legacy: false };
    }
    try {
      const derived = await deriveKey(password, salt, iterations);
      return { ok: timingSafeEqualBytes(derived, expected), legacy: false };
    } catch {
      return { ok: false, legacy: false };
    }
  }

  if (LEGACY_SHA256_HEX.test(stored)) {
    const hash = await sha256Hex(password);
    const ok = timingSafeEqualBytes(
      new TextEncoder().encode(hash),
      new TextEncoder().encode(stored),
    );
    return { ok, legacy: true };
  }

  return { ok: false, legacy: false };
}

// ───── AES-GCM encryption for the share-password display copy ─────

async function importAesKey(keyB64: string | undefined): Promise<CryptoKey | null> {
  if (!keyB64) return null;
  const raw = b64urlDecode(keyB64);
  if (!raw || ![16, 24, 32].includes(raw.length)) return null;
  try {
    return await crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
  } catch {
    return null;
  }
}

/**
 * Encrypt a share password for storage as the display copy.
 * Returns null when no usable key is configured (the caller stores null
 * instead of falling back to plaintext).
 */
export async function encryptSharePassword(
  keyB64: string | undefined,
  plaintext: string,
): Promise<string | null> {
  const key = await importAesKey(keyB64);
  if (!key) return null;
  try {
    const iv = crypto.getRandomValues(new Uint8Array(AES_IV_LEN));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      new TextEncoder().encode(plaintext),
    );
    return `${ENCRYPTED_PREFIX}$${b64urlEncode(iv)}$${b64urlEncode(new Uint8Array(ct))}`;
  } catch {
    return null;
  }
}

export function isEncryptedSharePassword(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith(`${ENCRYPTED_PREFIX}$`);
}

/**
 * Decrypt an encrypted display copy. Returns null for a missing key,
 * a wrong key, or corrupt data.
 */
export async function decryptSharePassword(
  keyB64: string | undefined,
  stored: string,
): Promise<string | null> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== ENCRYPTED_PREFIX) return null;
  const iv = b64urlDecode(parts[1]);
  const ct = b64urlDecode(parts[2]);
  if (!iv || !ct) return null;
  const key = await importAesKey(keyB64);
  if (!key) return null;
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ct as BufferSource,
    );
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

/**
 * Resolve a stored display copy to the plaintext password for the admin
 * eye-icon display: encrypted copies are decrypted, legacy plaintext
 * copies pass through unchanged, null stays null.
 */
export async function displaySharePassword(
  keyB64: string | undefined,
  stored: string | null | undefined,
): Promise<string | null> {
  if (!stored) return null;
  if (isEncryptedSharePassword(stored)) {
    return decryptSharePassword(keyB64, stored);
  }
  return stored;
}
