import { createHash, randomBytes } from "crypto";

export function createPortalToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPortalToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

