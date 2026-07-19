# ChronoVault Password Verification - Technical Documentation

## Overview

ChronoVault v2.1 implements a slow password verifier to address a critical bug where wrong passwords would not be detected until after the timelock expired. The new system provides:

1. **Early password rejection** - Wrong passwords are detected immediately
2. **Brute-force resistance** - 200,000 PBKDF2 iterations make offline attacks expensive
3. **Cryptographic separation** - Dedicated salt for the verifier prevents cross-attack vectors

## The Bug (v2.0 and earlier)

In previous versions, v2.x vaults stored no password verification data:

```javascript
// v2.0 vault.crypto structure
{
  salt: "...",
  iv: "...",
  dataIv: "..."
  // NO password hash or verifier!
}
```

Password correctness was only determined during AES-GCM decryption **after** the timelock expired. This meant:
- Users couldn't know if their password was correct until the vault unlocked
- The UI would show "PASSWORD CORRECT" regardless of actual password validity (until decryption failed)

## The Solution (v2.1)

### Password Hash Formula

```
passwordHash = SHA-256(password + base64(salt))
```

This simple hash is stored for reference but **not used for verification** (too fast, vulnerable to brute-force).

### Slow Password Verifier

```
verifierKey = PBKDF2(password, verifierSalt, iterations=200000, hash=SHA-256)
passwordVerifier = HMAC-SHA256(verifierKey, "chronovault-password-verification-v2.1")
```

The verifier uses:
- **Separate salt** (`verifierSalt`) - 256-bit random, independent from encryption salt
- **High iteration count** - 200,000 iterations (2x the encryption key derivation)
- **Domain separation** - HMAC over a fixed constant ties the verifier to ChronoVault

### Implementation

#### Creating the Verifier (Encryption Time)

```javascript
async function createPasswordVerifier(password, salt) {
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);
    
    // Import password for PBKDF2
    const keyMaterial = await crypto.subtle.importKey(
        'raw', passwordData, 'PBKDF2', false, ['deriveKey']
    );
    
    // Derive verifier key with HIGH iteration count (200,000)
    const verifierKey = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 200000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'HMAC', hash: 'SHA-256', length: 256 },
        false,
        ['sign']
    );
    
    // HMAC over constant produces the verifier
    const constant = encoder.encode('chronovault-password-verification-v2.1');
    const verifier = await crypto.subtle.sign('HMAC', verifierKey, constant);
    
    return arrayBufferToBase64(verifier);
}
```

#### Verifying the Password (Decryption Time)

```javascript
async function verifyPasswordSlow(password, salt, storedVerifier) {
    const computedVerifier = await createPasswordVerifier(password, salt);
    return computedVerifier === storedVerifier;
}
```

### Vault File Format (v2.2)

```json
{
  "version": "2.2",
  "type": "text|pdf|file",
  "created": "2025-12-22T10:30:00.000Z",
  "security": {
    "method": "tlock-ibe",
    "description": "Cryptographic timelock using drand IBE"
  },
  "timelock": {
    "targetRound": 28234567,
    "unlockTime": "2025-12-25T00:00:00.000Z",
    "chainHash": "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
    "publicKey": "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c...",
    "genesisTime": 1692803367,
    "roundPeriod": 3,
    "schemeID": "bls-unchained-g1-rfc9380",
    "timelockCiphertext": { "encoding": "utf8", "data": "-----BEGIN..." }
  },
  "crypto": {
    "algorithm": "AES-256-GCM",
    "kdf": "PBKDF2",
    "iterations": 100000,
    "salt": "base64-encoded-32-bytes",
    "iv": "base64-encoded-12-bytes",
    "dataIv": "base64-encoded-12-bytes",
    "verifierSalt": "base64-encoded-32-bytes",      // NEW in v2.1
    "passwordVerifier": "base64-encoded-32-bytes"   // NEW in v2.1
  },
  "data": "base64-encoded-encrypted-data"
}
```

## Decryption Flow (v2.1)

```
┌─────────────────────────────────────────────────────────────────┐
│                     DECRYPT VAULT (v2.1)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Parse vault file                                            │
│     └─ Extract verifierSalt, passwordVerifier                   │
│                                                                 │
│  2. EARLY PASSWORD VERIFICATION (NEW!)                          │
│     ├─ Compute: HMAC(PBKDF2(password, verifierSalt, 200k), C)   │
│     ├─ Compare with stored passwordVerifier                     │
│     └─ If mismatch → REJECT IMMEDIATELY                         │
│                     (no need to wait for timelock)              │
│                                                                 │
│  3. Check timelock status                                       │
│     ├─ Fetch current drand round                                │
│     └─ If currentRound < targetRound → "Vault still locked"     │
│                                                                 │
│  4. Decrypt timelocked symmetric key (IBE)                      │
│     └─ Requires drand beacon for targetRound                    │
│                                                                 │
│  5. Layer 2: Decrypt with timelock key (AES-GCM)                │
│                                                                 │
│  6. Layer 1: Decrypt with password key (AES-GCM)                │
│     └─ Additional auth check (GCM tag verification)             │
│                                                                 │
│  7. Return decrypted data                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Security Considerations

### Why 200,000 Iterations?

| Iterations | Time (typical browser) | Brute-force cost |
|------------|------------------------|------------------|
| 10,000     | ~10ms                  | Low              |
| 100,000    | ~100ms                 | Medium           |
| **200,000**| **~200ms**             | **High**         |
| 600,000    | ~600ms                 | Very High        |

200,000 iterations provides a good balance:
- Perceptible but acceptable delay for legitimate users (~200ms)
- Makes dictionary attacks ~2000x slower than single SHA-256
- Aligns with OWASP recommendations for PBKDF2-SHA256

### Why Separate Salt?

Using a dedicated `verifierSalt` separate from the encryption `salt` provides:

1. **Attack isolation** - Compromising the verifier doesn't help crack the encryption key
2. **No information leakage** - Same password with different salts produces different verifiers
3. **Forward compatibility** - Can change verifier parameters without affecting encryption

### Constant-Time Comparison

The current implementation uses JavaScript string comparison, which is not constant-time. However, timing attacks are impractical because:

1. The 200,000 PBKDF2 iterations dominate the timing (~200ms)
2. Network latency introduces far more variance
3. Web Crypto API operations add their own timing noise

For maximum security in future versions, a constant-time comparison could be implemented:

```javascript
function constantTimeCompare(a, b) {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
}
```

## Backward Compatibility

### v2.1 Vaults on Older Code

Older code (v2.0) that lacks the `verifyPasswordSlow` function will:
- Skip early verification (no `verifierSalt`/`passwordVerifier` fields recognized)
- Fall back to AES-GCM authentication failure for wrong passwords
- Still work correctly, just without early password feedback

### v2.0 Vaults on v2.1 Code

v2.1 code handles vaults without verifier fields:

```javascript
if (vault.crypto.verifierSalt && vault.crypto.passwordVerifier) {
    // Early verification (v2.1+)
    const passwordValid = await verifyPasswordSlow(...);
    if (!passwordValid) return { error: 'password_wrong' };
} else {
    // Fallback for older vaults
    debugLog('No verifier stored; will validate during AES-GCM decryption');
}
```

## Testing

### Unit Tests

```javascript
// Test verifier creation
const salt = generateRandomBytes(32);
const verifier1 = await createPasswordVerifier("correct-password", salt);
const verifier2 = await createPasswordVerifier("correct-password", salt);
const verifier3 = await createPasswordVerifier("wrong-password", salt);

assert(verifier1 === verifier2);  // Same password → same verifier
assert(verifier1 !== verifier3);  // Different password → different verifier

// Test verification
assert(await verifyPasswordSlow("correct", salt, verifier1) === true);
assert(await verifyPasswordSlow("wrong", salt, verifier1) === false);
```

### Integration Tests

1. Create vault with password "test123"
2. Attempt decrypt with "wrong" → Should fail immediately with "Incorrect password"
3. Attempt decrypt with "test123" before timelock → Should say "Vault still locked"
4. Attempt decrypt with "test123" after timelock → Should succeed

## Changelog

### v2.2 – Removed passwordHash from vault format (offline brute-force vector); password verification now relies solely on the slow PBKDF2+HMAC verifier.

### v2.1 (December 2025)
- Added `verifierSalt` field (256-bit, base64)
- Added `passwordVerifier` field (HMAC output, base64)
- Added `passwordHash` field (SHA-256 reference hash)
- Implemented `createPasswordVerifier()` with 200k PBKDF2 iterations
- Implemented `verifyPasswordSlow()` for early password validation
- Updated decrypt flow to verify password before checking timelock

### v2.0
- Initial tlock-IBE implementation
- No password verification (detected only at AES-GCM decryption)
