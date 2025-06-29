
"use client";

// This file uses the Web Crypto API, which is only available in browser environments.
// Ensure it's only called from client-side components.

// --- Key Pair Management (RSA-OAEP for Key Wrapping) ---

const getPrivateKeyLocalStorageKey = (uid: string) => `privox_privateKey_${uid}`;

// Generates a new RSA-OAEP key pair for a user.
export async function generateMasterKeyPair(): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256",
        },
        true, // exportable
        ["wrapKey", "unwrapKey"]
    );
}

// Stores a user's private key in their browser's local storage.
export async function storePrivateKey(uid: string, privateKey: CryptoKey): Promise<void> {
    const exportedKey = await crypto.subtle.exportKey("pkcs8", privateKey);
    localStorage.setItem(getPrivateKeyLocalStorageKey(uid), arrayBufferToBase64(exportedKey));
}

// Retrieves a user's private key from local storage.
export async function getStoredPrivateKey(uid: string): Promise<CryptoKey | null> {
    const keyB64 = localStorage.getItem(getPrivateKeyLocalStorageKey(uid));
    if (!keyB64) return null;

    const keyBuffer = base64ToArrayBuffer(keyB64);
    try {
        return await crypto.subtle.importKey(
            "pkcs8",
            keyBuffer,
            { name: "RSA-OAEP", hash: "SHA-256" },
            true,
            ["unwrapKey"]
        );
    } catch (error) {
        console.error("Failed to import stored private key:", error);
        // This might happen if the key is corrupted or format changed.
        // Clearing the invalid key.
        localStorage.removeItem(getPrivateKeyLocalStorageKey(uid));
        return null;
    }
}


// --- Chat Key Generation and Wrapping (AES-GCM for Messages) ---

// Generates a new, random, strong key for a single chat conversation.
export async function generateChatKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true, // exportable
        ["encrypt", "decrypt"]
    );
}

// Wraps (encrypts) a chat key using a user's public key.
export async function wrapChatKey(chatKey: CryptoKey, publicKey: CryptoKey): Promise<string> {
    const wrappedKey = await crypto.subtle.wrapKey("raw", chatKey, publicKey, { name: "RSA-OAEP" });
    return arrayBufferToBase64(wrappedKey);
}

// Unwraps (decrypts) a chat key using a user's private key.
export async function unwrapChatKey(wrappedKeyB64: string, privateKey: CryptoKey): Promise<CryptoKey> {
     const wrappedKeyBuffer = base64ToArrayBuffer(wrappedKeyB64);
     return crypto.subtle.unwrapKey(
        "raw",
        wrappedKeyBuffer,
        privateKey,
        { name: "RSA-OAEP" },
        { name: "AES-GCM" },
        true,
        ["encrypt", "decrypt"]
    );
}

// --- Key Serialization for Database Storage ---

// Exports a CryptoKey (typically a public key) to a Base64 string for storage.
export async function exportPublicKeyToBase64(key: CryptoKey): Promise<string> {
    const rawKey = await crypto.subtle.exportKey("spki", key);
    return arrayBufferToBase64(rawKey);
}

// Imports a Base64 string back into a usable Public CryptoKey.
export async function importPublicKeyFromBase64(keyB64: string): Promise<CryptoKey> {
    const rawKey = base64ToArrayBuffer(keyB64);
    return crypto.subtle.importKey(
        "spki",
        rawKey,
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["wrapKey"]
    );
}

// --- Data Encryption / Decryption (for messages) ---

// Encrypts a string of data with a given AES-GCM CryptoKey.
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

// Decrypts a string of data with a given AES-GCM CryptoKey.
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
