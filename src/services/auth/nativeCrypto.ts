import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';

// Supabase's PKCE verifier and S256 challenge need secure randomness + SHA-256.
// This supplies those two native primitives, not a complete WebCrypto API.
// Account identity is verified remotely with getUser(), never local getClaims().
if (Platform.OS !== 'web') {
  if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
  if (typeof globalThis.crypto.getRandomValues !== 'function') {
    Object.defineProperty(globalThis.crypto, 'getRandomValues', { value: Crypto.getRandomValues });
  }
  if (!globalThis.crypto.subtle) {
    Object.defineProperty(globalThis.crypto, 'subtle', { value: { digest: (algorithm: AlgorithmIdentifier, data: BufferSource) => {
      if ((typeof algorithm === 'string' ? algorithm : algorithm.name) !== 'SHA-256') return Promise.reject(new Error('Unsupported account digest.'));
      return Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data);
    } } });
  }
}
