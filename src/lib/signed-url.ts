// Time-limited signed links, so a file can be fetched without logging in
// (e.g. by an AI assistant that was given an export). The signature is an
// HMAC-SHA256 over "<path>|<expiry>" keyed from ENCRYPTION_KEY; changing the
// path or expiry invalidates it.

async function hmac(message: string): Promise<string> {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error("ENCRYPTION_KEY environment variable is not set");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`signed-url:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signPath(path: string, ttlSeconds: number): Promise<{ exp: number; sig: string }> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return { exp, sig: await hmac(`${path}|${exp}`) };
}

export async function verifyPath(path: string, exp: string | null, sig: string | null): Promise<boolean> {
  const expiry = Number(exp);
  if (!sig || !Number.isFinite(expiry) || expiry < Date.now() / 1000) return false;
  const expected = await hmac(`${path}|${expiry}`);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
