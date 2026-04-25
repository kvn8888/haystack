import crypto from "node:crypto";
import { config } from "./config.js";

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

function fromB64url(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signatureFor(payload) {
  return crypto
    .createHmac("sha256", config.x402.receiptSecret)
    .update(payload)
    .digest("base64url");
}

export function createPaymentReceipt(tx) {
  const payload = b64url(
    JSON.stringify({
      v: 1,
      tx_id: tx.id,
      post_id: tx.post_id,
      amount_usdc: tx.amount_usdc,
      provider: tx.provider,
      provider_tx_id: tx.provider_tx_id,
      settlement_status: tx.settlement_status,
      iat: Math.floor(Date.now() / 1000),
    })
  );
  return `hsx402.${payload}.${signatureFor(payload)}`;
}

export function verifyPaymentReceipt(header, { postId } = {}) {
  if (!header) return { ok: false, code: "MISSING_PAYMENT" };
  const token = String(header).replace(/^Bearer\s+/i, "").trim();
  const [prefix, payload, sig] = token.split(".");
  if (prefix !== "hsx402" || !payload || !sig) {
    return { ok: false, code: "INVALID_PAYMENT_FORMAT" };
  }

  const expected = signatureFor(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, code: "INVALID_PAYMENT_SIGNATURE" };
  }

  try {
    const receipt = JSON.parse(fromB64url(payload));
    if (postId && receipt.post_id !== postId) {
      return { ok: false, code: "PAYMENT_POST_MISMATCH" };
    }
    return { ok: true, receipt };
  } catch {
    return { ok: false, code: "INVALID_PAYMENT_PAYLOAD" };
  }
}
