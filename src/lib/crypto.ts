"use client";

// This file uses the Web Crypto API, which is only available in browser environments.
// Ensure it's only called from client-side components.

const SECRET = process.env.NEXT_PUBLIC_ENCRYPTION_SECRET || "default-super-secret-key-that-is-long";
const SALT = new TextEncoder().encode('cipher-chat-salt');

// Function to derive a key from the secret using PBKDF2
async function getDerivedKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: SALT,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

// Helper to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper to convert Base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Encrypt a message
export async function encryptMessage(text: string): Promise<{ iv: string, encrypted: string }> {
  const key = await getDerivedKey(SECRET);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  const encodedText = new TextEncoder().encode(text);

  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    encodedText
  );

  return {
    iv: arrayBufferToBase64(iv),
    encrypted: arrayBufferToBase64(encrypted),
  };
}

// Decrypt a message
export async function decryptMessage(encrypted: string, iv: string): Promise<string> {
  const key = await getDerivedKey(SECRET);
  const ivBuffer = base64ToArrayBuffer(iv);
  const encryptedBuffer = base64ToArrayBuffer(encrypted);

  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: ivBuffer,
      },
      key,
      encryptedBuffer
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("Decryption failed:", e);
    return "Failed to decrypt message.";
  }
}
