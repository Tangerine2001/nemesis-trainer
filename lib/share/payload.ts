import {DATA_VERSION, type SharePayload} from "@/lib/types";

export function encodeSharePayload(payload: Omit<SharePayload, "v">): string {
  const json = JSON.stringify({...payload, v: DATA_VERSION});
  return bytesToBase64Url(new TextEncoder().encode(json));
}

export function decodeSharePayload(code: string): SharePayload {
  const json = new TextDecoder().decode(base64UrlToBytes(code));
  const payload = JSON.parse(json) as SharePayload;
  if (!payload.rawTeam || !payload.seed || !payload.format) {
    throw new Error("Invalid share payload.");
  }
  return payload;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
