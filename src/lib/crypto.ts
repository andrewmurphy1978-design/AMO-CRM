// AES-256-GCM encryption for storing the systeme.io API key at rest, using
// the Web Crypto API (globalThis.crypto.subtle) rather than node:crypto so
// this works identically under plain Node.js and the Cloudflare Workers
// runtime without depending on nodejs_compat's crypto module coverage.
//
// ENCRYPTION_KEY is any string; PBKDF2 derives a 32-byte AES key from it so
// the raw env var doesn't need to be exactly 32 bytes.

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12; // bytes
const PBKDF2_ITERATIONS = 100_000;
const SALT = new TextEncoder().encode("amo-crm-salt");

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: SALT, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: ALGORITHM, length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptSecret(plainText: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  // Web Crypto's AES-GCM output is ciphertext with the auth tag already
  // appended, so there's nothing extra to track separately.
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plainText) as BufferSource
  );
  return [toBase64(iv), toBase64(new Uint8Array(encrypted))].join(".");
}

export async function decryptSecret(payload: string): Promise<string> {
  const key = await getKey();
  const [ivB64, dataB64] = payload.split(".");
  if (!ivB64 || !dataB64) {
    throw new Error("Malformed encrypted payload");
  }
  const iv = fromBase64(ivB64);
  const data = fromBase64(dataB64);
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: iv as BufferSource },
    key,
    data as BufferSource
  );
  return new TextDecoder().decode(decrypted);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
