
"use client";

// This file uses the Web Crypto API, which is only available in browser environments.
// Ensure it's only called from client-side components.

const SECRET = process.env.NEXT_PUBLIC_ENCRYPTION_SECRET || "default-super-secret-key-that-is-long";

// --- Key Derivation and Management ---

// Generic function to derive a key from a secret and a salt using PBKDF2.
async function deriveKey(secret: string, salt: ArrayBuffer): Promise<CryptoKey> {
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
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

// Derives a unique master key for a user, used to encrypt/decrypt chat-specific keys.
export async function getUserMasterKey(uid: string): Promise<CryptoKey> {
  const salt = new TextEncoder().encode(uid);
  return deriveKey(SECRET, salt);
}

// Generates a new, random, strong key for a single chat conversation.
export async function generateChatKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true, // exportable
        ["encrypt", "decrypt"]
    );
}

// --- Key Serialization ---

// Exports a CryptoKey to a Base64 string for storage.
export async function exportKeyToBase64(key: CryptoKey): Promise<string> {
    const rawKey = await crypto.subtle.exportKey("raw", key);
    return arrayBufferToBase64(rawKey);
}

// Imports a Base64 string back into a usable CryptoKey.
export async function importKeyFromBase64(keyB64: string): Promise<CryptoKey> {
    const rawKey = base64ToArrayBuffer(keyB64);
    return crypto.subtle.importKey(
        "raw",
        rawKey,
        { name: "AES-GCM" },
        true,
        ["encrypt", "decrypt"]
    );
}

// --- Data Encryption / Decryption ---

// Encrypts a string of data with a given CryptoKey.
export async function encryptMessage(text: string, key: CryptoKey): Promise<{ iv: string; encrypted: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV is standard for AES-GCM
  const encodedText = new TextEncoder().encode(text);

  const encryptedData = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodedText
  );

  return {
    iv: arrayBufferToBase64(iv),
    encrypted: arrayBufferToBase64(encryptedData),
  };
}

// Decrypts a string of data with a given CryptoKey.
export async function decryptMessage(encryptedB64: string, ivB64: string, key: CryptoKey): Promise<string> {
  const ivBuffer = base64ToArrayBuffer(ivB64);
  const encryptedBuffer = base64ToArrayBuffer(encryptedB64);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBuffer },
      key,
      encryptedBuffer
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("Decryption failed:", e);
    // Returning a specific string can help the UI show an "undecryptable" state.
    return "Could not decrypt message.";
  }
}


// --- Base64 Helpers ---

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
