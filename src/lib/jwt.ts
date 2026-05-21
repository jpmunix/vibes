import crypto from "node:crypto";

const JWT_SECRET = process.env.JWT_SECRET || "vibes-cloud-secret-key-fallback-38271829";

export function signJwt(payload: Record<string, any>): string {
  const header = { alg: "HS256", typ: "JWT" };
  const base64UrlHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const base64UrlPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${base64UrlHeader}.${base64UrlPayload}`)
    .digest("base64url");
    
  return `${base64UrlHeader}.${base64UrlPayload}.${signature}`;
}

export function verifyJwt(token: string): Record<string, any> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    
    const [headerB64, payloadB64, signature] = parts;
    
    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");
      
    if (signature !== expectedSignature) {
      return null;
    }
    
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    return payload;
  } catch {
    return null;
  }
}
