/**
 * ChronoVault - Crypto Utilities v2.1
 * 
 * REAL CRYPTOGRAPHIC TIMELOCK using drand tlock-js
 * 
 * This implementation uses Identity-Based Encryption (IBE) with pairing-based
 * cryptography. The symmetric key is encrypted to a future drand round number
 * as the "identity". Until drand publishes that round's beacon signature,
 * NO ONE can decrypt - it's cryptographically impossible.
 * 
 * Previous vulnerability: timelockSecret was stored in vault file, timelock
 * was enforced only by checking currentRound < targetRound (bypassable).
 * 
 * New approach: Uses tlock-js which implements the tlock paper
 * (https://eprint.iacr.org/2023/189)
 */

const CryptoUtils = (function() {
    // ============================================
    // DEBUG FLAG - Set to false for production
    // ============================================
    const DEBUG_FLAG = false;

    // Debug logging helper
    function debugLog(category, message, data = null) {
        if (!DEBUG_FLAG) return;
        const timestamp = new Date().toISOString().substr(11, 12);
        const prefix = `[ChronoVault ${timestamp}] [${category}]`;
        if (data !== null) {
            console.log(`${prefix} ${message}`, data);
        } else {
            console.log(`${prefix} ${message}`);
        }
    }

    function debugGroup(title) {
        if (!DEBUG_FLAG) return;
        console.group(`🔐 ChronoVault: ${title}`);
    }

    function debugGroupEnd() {
        if (!DEBUG_FLAG) return;
        console.groupEnd();
    }

    function debugTable(data) {
        if (!DEBUG_FLAG) return;
        console.table(data);
    }

    // ============================================
    // DRAND NETWORK CONFIGURATION - QUICKNET
    // ============================================
    const DRAND_NETWORKS = {
        quicknet: {
            name: 'quicknet',
            host: 'https://api.drand.sh',
            chainHash: '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971',
            publicKey: '83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a',
            period: 3, // seconds per round
            genesis: 1692803367, // Unix timestamp
            schemeID: 'bls-unchained-g1-rfc9380'
        }
    };

    // Current network configuration
    const NETWORK = DRAND_NETWORKS.quicknet;

    // Log configuration on load
    if (DEBUG_FLAG) {
        console.log('%c🔐 ChronoVault Crypto Utils v2.1 Loaded (REAL TIMELOCK)', 
            'color: #00f0ff; font-weight: bold; font-size: 14px;');
        console.log('%c⚡ Using tlock-js with IBE cryptographic timelock', 
            'color: #ffaa00; font-weight: bold;');
        debugTable({
            'Network': NETWORK.name,
            'Host': NETWORK.host,
            'Chain Hash': NETWORK.chainHash.substring(0, 16) + '...',
            'Public Key': NETWORK.publicKey.substring(0, 32) + '...',
            'Round Period': `${NETWORK.period} seconds`,
            'Genesis Time': `${NETWORK.genesis} (${new Date(NETWORK.genesis * 1000).toISOString()})`,
            'Scheme': NETWORK.schemeID,
            'Debug Mode': 'ENABLED'
        });
    }

    // ============================================
    // TLOCK-JS INTEGRATION
    // ============================================
    
    // We'll dynamically import tlock-js
    let tlockModule = null;
    let drandClientModule = null;
    
    /**
     * Initialize tlock-js library
     * Must be called before encrypt/decrypt operations
     */
    async function initTlock() {
        if (tlockModule && drandClientModule) {
            debugLog('INIT', 'Using cached tlock modules');
            return { tlock: tlockModule, drandClient: drandClientModule };
        }
        
        debugLog('INIT', 'Loading tlock-js library...');
        
        // Try multiple CDN strategies
        const cdnStrategies = [
            {
                name: 'esm.sh (bundled)',
                tlock: 'https://esm.sh/tlock-js@0.9.0?bundle',
                drand: 'https://esm.sh/drand-client@1.2.6?bundle'
            },
            {
                name: 'esm.sh (default)',
                tlock: 'https://esm.sh/tlock-js@0.9.0',
                drand: 'https://esm.sh/drand-client@1.2.6'
            },
            {
                name: 'skypack',
                tlock: 'https://cdn.skypack.dev/tlock-js@0.9.0',
                drand: 'https://cdn.skypack.dev/drand-client@1.2.6'
            }
        ];
        
        for (const strategy of cdnStrategies) {
            debugLog('INIT', `Trying CDN strategy: ${strategy.name}...`);
            try {
                debugLog('INIT', `Loading tlock-js from ${strategy.tlock}`);
                tlockModule = await import(strategy.tlock);
                debugLog('INIT', '✅ tlock-js loaded');
                
                debugLog('INIT', `Loading drand-client from ${strategy.drand}`);
                drandClientModule = await import(strategy.drand);
                debugLog('INIT', '✅ drand-client loaded');
                
                // Log available exports for debugging
                debugLog('INIT', 'tlock-js exports:', Object.keys(tlockModule));
                debugLog('INIT', 'drand-client exports:', Object.keys(drandClientModule));
                
                // Verify critical functions exist
                if (typeof tlockModule.timelockEncrypt !== 'function') {
                    debugLog('INIT', '⚠️ timelockEncrypt not found, checking default export...');
                    if (tlockModule.default && typeof tlockModule.default.timelockEncrypt === 'function') {
                        tlockModule = tlockModule.default;
                        debugLog('INIT', '✅ Using default export');
                    }
                }
                
                debugLog('INIT', `✅ All libraries loaded successfully via ${strategy.name}`);
                return { tlock: tlockModule, drandClient: drandClientModule };
                
            } catch (error) {
                debugLog('INIT', `❌ ${strategy.name} failed: ${error.message}`);
                tlockModule = null;
                drandClientModule = null;
                continue;
            }
        }
        
        // All strategies failed
        throw new Error(
            'Failed to load tlock-js from any CDN. ' +
            'This may be due to network issues or browser compatibility. ' +
            'Try refreshing the page or using a different browser.'
        );
    }

    /**
     * Create a drand HTTP client for the quicknet network
     */
    async function createDrandClient() {
        const { drandClient } = await initTlock();
        
        debugLog('DRAND', 'Creating drand HTTP client...');
        
        const client = await drandClient.HttpChainClient.create(
            drandClient.HttpCachingChain.fromInfo(
                {
                    hash: NETWORK.chainHash,
                    public_key: NETWORK.publicKey,
                    period: NETWORK.period,
                    genesis_time: NETWORK.genesis,
                    schemeID: NETWORK.schemeID
                },
                { baseUrl: NETWORK.host }
            )
        );
        
        debugLog('DRAND', '✅ drand client created');
        return client;
    }

    /**
     * Get network info for round calculations
     */
    function getNetworkInfo() {
        return {
            hash: NETWORK.chainHash,
            public_key: NETWORK.publicKey,
            period: NETWORK.period,
            genesis_time: NETWORK.genesis,
            schemeID: NETWORK.schemeID
        };
    }

    // ============================================
    // HELPER FUNCTIONS
    // ============================================

    /**
     * Generate a cryptographically secure random bytes
     */
    function generateRandomBytes(length) {
        return crypto.getRandomValues(new Uint8Array(length));
    }

    /**
     * Convert ArrayBuffer to Base64
     */
    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        bytes.forEach(byte => binary += String.fromCharCode(byte));
        return btoa(binary);
    }

    /**
     * Convert Base64 to ArrayBuffer
     */
    function base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Convert Uint8Array to Base64 (safe for JSON)
     */
    function uint8ArrayToBase64(arr) {
        // Chunked conversion avoids call stack limits
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < arr.length; i += chunkSize) {
            binary += String.fromCharCode(...arr.subarray(i, i + chunkSize));
        }
        return btoa(binary);
    }

    /**
     * Convert Base64 to Uint8Array
     */
    function base64ToUint8Array(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    /**
     * Serialize timelock ciphertext into a JSON-safe structure.
     * tlock-js may return a string (armored) or bytes.
     */
    function serializeTimelockCiphertext(ciphertext) {
        if (ciphertext == null) {
            throw new Error('Missing timelockCiphertext');
        }
        // Common case: armored string
        if (typeof ciphertext === 'string') {
            return { encoding: 'utf8', data: ciphertext };
        }
        // Bytes: Uint8Array / ArrayBuffer / TypedArray view
        if (ciphertext instanceof Uint8Array) {
            return { encoding: 'base64', data: uint8ArrayToBase64(ciphertext) };
        }
        if (ciphertext instanceof ArrayBuffer) {
            return { encoding: 'base64', data: arrayBufferToBase64(ciphertext) };
        }
        if (ArrayBuffer.isView(ciphertext) && ciphertext.buffer instanceof ArrayBuffer) {
            const view = new Uint8Array(ciphertext.buffer, ciphertext.byteOffset, ciphertext.byteLength);
            return { encoding: 'base64', data: uint8ArrayToBase64(view) };
        }

        // Fallback: JSON-stringify and base64 it (best effort)
        try {
            const json = JSON.stringify(ciphertext);
            const utf8 = new TextEncoder().encode(json);
            return { encoding: 'json-base64', data: uint8ArrayToBase64(utf8) };
        } catch {
            throw new Error('Unsupported timelockCiphertext type (cannot serialize)');
        }
    }

    /**
     * Deserialize stored timelock ciphertext back into the form expected by tlock-js.
     * Supports:
     * - v2.0: string/bytes stored directly
     * - v2.1+: {encoding,data}
     */
    function deserializeTimelockCiphertext(stored) {
        if (stored == null) {
            throw new Error('Missing timelockCiphertext in vault');
        }
        // Back-compat: stored directly as string or bytes
        if (typeof stored === 'string' || stored instanceof Uint8Array || stored instanceof ArrayBuffer) {
            return stored;
        }
        if (typeof stored === 'object' && typeof stored.encoding === 'string' && typeof stored.data === 'string') {
            if (stored.encoding === 'utf8') {
                return stored.data;
            }
            if (stored.encoding === 'base64') {
                return base64ToUint8Array(stored.data);
            }
            if (stored.encoding === 'json-base64') {
                const bytes = base64ToUint8Array(stored.data);
                const json = new TextDecoder().decode(bytes);
                return JSON.parse(json);
            }
        }
        // Last resort: pass through
        return stored;
    }

    /**
     * Convert Uint8Array to hex string
     */
    function uint8ArrayToHex(arr) {
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Convert hex string to Uint8Array
     */
    function hexToUint8Array(hex) {
        const arr = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            arr[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return arr;
    }

    // ============================================
    // DRAND API FUNCTIONS  
    // ============================================

    /**
     * Fetch drand chain info
     */
    async function getDrandInfo() {
        debugLog('DRAND', 'Fetching drand chain info...');
        
        try {
            const response = await fetch(`${NETWORK.host}/${NETWORK.chainHash}/info`);
            if (!response.ok) throw new Error('Failed to fetch drand info');
            const info = await response.json();
            debugLog('DRAND', 'Fetched drand info successfully', info);
            return info;
        } catch (error) {
            debugLog('DRAND', 'ERROR fetching drand info', error.message);
            throw new Error('Could not connect to drand network');
        }
    }

    /**
     * Get current drand round
     */
    async function getCurrentRound() {
        debugLog('DRAND', 'Fetching current round from quicknet...');
        try {
            const response = await fetch(`${NETWORK.host}/${NETWORK.chainHash}/public/latest`);
            if (!response.ok) throw new Error('Failed to fetch current round');
            const data = await response.json();
            debugLog('DRAND', `Current round: ${data.round}`, {
                round: data.round,
                randomness: data.randomness ? data.randomness.substring(0, 16) + '...' : 'N/A',
                signature: data.signature ? data.signature.substring(0, 16) + '...' : 'N/A'
            });
            return data.round;
        } catch (error) {
            debugLog('DRAND', 'ERROR fetching current round', error.message);
            throw new Error('Could not fetch current drand round');
        }
    }

    /**
     * Calculate round number for a given future timestamp
     */
    function calculateRoundForTime(targetTime) {
        const targetTimestamp = Math.floor(targetTime.getTime() / 1000);
        const elapsedSeconds = targetTimestamp - NETWORK.genesis;
        const roundNumber = Math.ceil(elapsedSeconds / NETWORK.period);
        const result = Math.max(1, roundNumber);
        
        debugLog('CALC', 'Calculating round for target time', {
            targetTime: targetTime.toISOString(),
            targetTimestamp: targetTimestamp,
            genesisTime: NETWORK.genesis,
            elapsedSeconds: elapsedSeconds,
            roundPeriod: NETWORK.period,
            calculatedRound: result
        });
        
        return result;
    }

    /**
     * Calculate unlock time from round number
     */
    function calculateTimeFromRound(round) {
        const unlockTimestamp = NETWORK.genesis + (round * NETWORK.period);
        const unlockDate = new Date(unlockTimestamp * 1000);
        
        debugLog('CALC', 'Calculating time from round', {
            round: round,
            unlockTimestamp: unlockTimestamp,
            unlockTime: unlockDate.toISOString()
        });
        
        return unlockDate;
    }

    /**
     * Fetch drand beacon for a specific round
     */
    async function fetchBeacon(round) {
        debugLog('DRAND', `Fetching beacon for round ${round}...`);
        try {
            const response = await fetch(`${NETWORK.host}/${NETWORK.chainHash}/public/${round}`);
            if (!response.ok) {
                if (response.status === 404) {
                    debugLog('DRAND', `Round ${round} not yet available (404)`);
                    return null;
                }
                throw new Error('Failed to fetch beacon');
            }
            const beacon = await response.json();
            debugLog('DRAND', `Fetched beacon for round ${round}`, {
                round: beacon.round,
                signature: beacon.signature ? beacon.signature.substring(0, 32) + '...' : 'N/A'
            });
            return beacon;
        } catch (error) {
            debugLog('DRAND', 'ERROR fetching beacon', error.message);
            return null;
        }
    }

    // ============================================
    // PASSWORD-BASED ENCRYPTION LAYER
    // ============================================

    /**
     * Derive encryption key from password and salt
     */
    async function deriveKey(password, salt) {
        debugLog('CRYPTO', 'Deriving key from password...', {
            passwordLength: password.length,
            saltLength: salt.length
        });
        
        const encoder = new TextEncoder();
        const passwordData = encoder.encode(password);
        
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            passwordData,
            'PBKDF2',
            false,
            ['deriveKey']
        );

        const key = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            true, // extractable for verification (legacy); not used as passwordHash anymore
            ['encrypt', 'decrypt']
        );

        debugLog('CRYPTO', 'AES-256-GCM key derived successfully');
        return key;
    }

    /**
     * Create a SLOW password verifier using PBKDF2-derived key + HMAC
     * 
     * This provides brute-force resistance by using:
     * 1. PBKDF2 with high iteration count (200,000) to derive a verifier key
     * 2. HMAC-SHA256 over a constant to produce the final verifier
     * 
     * @param {string} password - User password
     * @param {Uint8Array} salt - Random salt (should be separate from encryption salt)
     * @returns {Promise<string>} Base64-encoded verifier
     */
    async function createPasswordVerifier(password, salt) {
        debugLog('CRYPTO', 'Creating slow password verifier (PBKDF2 + HMAC)...');
        const encoder = new TextEncoder();
        const passwordData = encoder.encode(password);
        
        // Import password for PBKDF2
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            passwordData,
            'PBKDF2',
            false,
            ['deriveKey']
        );
        
        // Derive a verifier key using PBKDF2 with HIGH iteration count
        // 200,000 iterations provides significant brute-force resistance
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
        
        // HMAC over a constant to produce the verifier
        // This constant ties the verifier to ChronoVault specifically
        const constant = encoder.encode('chronovault-password-verification-v2.1');
        const verifier = await crypto.subtle.sign('HMAC', verifierKey, constant);
        
        debugLog('CRYPTO', 'Password verifier created (200k PBKDF2 iterations)');
        return arrayBufferToBase64(verifier);
    }

    /**
     * Verify password using the slow PBKDF2+HMAC verifier
     * 
     * @param {string} password - Password to verify
     * @param {Uint8Array} salt - The verifier salt
     * @param {string} storedVerifier - Base64-encoded stored verifier
     * @returns {Promise<boolean>} True if password is correct
     */
    async function verifyPasswordSlow(password, salt, storedVerifier) {
        debugLog('CRYPTO', 'Verifying password (slow method)...');
        try {
            const computedVerifier = await createPasswordVerifier(password, salt);
            // Constant-time comparison would be ideal, but in JS we rely on
            // the slowness of PBKDF2 to make timing attacks impractical
            const isValid = computedVerifier === storedVerifier;
            debugLog('CRYPTO', `Password verification result: ${isValid ? 'VALID' : 'INVALID'}`);
            return isValid;
        } catch (error) {
            debugLog('CRYPTO', 'Password verification error:', error.message);
            return false;
        }
    }

    /**
     * Verify password against stored hash (LEGACY ONLY - v1 vaults)
     * Uses simple SHA-256 comparison - NOT brute-force resistant.
     * Hash logic is inlined here since createPasswordHash() no longer
     * exists as a standalone function (removed to stop it being used
     * for new vaults) - this is only reachable from decryptLegacy() for v1 vaults.
     */
    async function verifyPasswordLegacy(password, salt, storedHash) {
        debugLog('CRYPTO', 'Verifying password (legacy SHA-256 method)...');
        const encoder = new TextEncoder();
        const saltBase64 = salt instanceof Uint8Array ? arrayBufferToBase64(salt) : salt;
        const data = encoder.encode(password + saltBase64);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hash = arrayBufferToBase64(hashBuffer);
        return hash === storedHash;
    }

    /**
     * Encrypt data with AES-GCM
     */
    async function encryptAES(data, key, iv) {
        const encoded = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
        return await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encoded
        );
    }

    /**
     * Decrypt data with AES-GCM
     */
    async function decryptAES(encryptedData, key, iv) {
        try {
            return await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encryptedData
            );
        } catch (error) {
            throw new Error('Decryption failed - wrong password or corrupted data');
        }
    }

    // ============================================
    // MAIN ENCRYPTION FUNCTION (REAL TIMELOCK)
    // ============================================

    /**
     * Main encryption function using REAL cryptographic timelock
     * 
     * Architecture:
     * 1. Generate random symmetric key for data encryption
     * 2. Encrypt data with password (AES-GCM) -> Layer 1
     * 3. Encrypt Layer 1 with symmetric key (AES-GCM) -> Layer 2  
     * 4. Use tlock IBE to encrypt symmetric key to future round -> Layer 3
     * 
     * The symmetric key is cryptographically bound to the future drand round.
     * Until drand publishes that round's beacon, NO ONE can recover the key.
     */
    async function encrypt(data, password, unlockTime, dataType) {
        debugGroup('ENCRYPTION PROCESS (REAL TIMELOCK)');
        debugLog('ENCRYPT', '🚀 Starting encryption with cryptographic timelock...', {
            dataType: dataType,
            dataSize: typeof data === 'string' ? data.length + ' chars' : data.length + ' bytes',
            unlockTime: unlockTime.toISOString()
        });

        try {
            // Initialize tlock
            const { tlock, drandClient: drandClientModule } = await initTlock();
            
            // Generate cryptographic materials
            const salt = generateRandomBytes(32);
            const verifierSalt = generateRandomBytes(32); // Separate salt for password verifier
            const iv = generateRandomBytes(12);
            const dataIv = generateRandomBytes(12);
            
            debugLog('ENCRYPT', 'Generated cryptographic materials (including verifier salt)');

            // Calculate target drand round
            const targetRound = calculateRoundForTime(unlockTime);
            const currentRound = await getCurrentRound();
            
            debugLog('ENCRYPT', 'Round calculation', {
                currentRound: currentRound,
                targetRound: targetRound,
                roundDifference: targetRound - currentRound,
                estimatedWaitSeconds: (targetRound - currentRound) * NETWORK.period
            });

            if (targetRound <= currentRound) {
                throw new Error('Unlock time must be in the future');
            }

            // Derive password key
            const passwordKey = await deriveKey(password, salt);

            // Convert data to bytes if needed
            const dataBytes = typeof data === 'string' 
                ? new TextEncoder().encode(data) 
                : new Uint8Array(data);

            // Layer 1: Encrypt data with password
            debugLog('ENCRYPT', 'Layer 1: Encrypting data with password key (AES-256-GCM)...');
            const passwordEncrypted = await encryptAES(dataBytes, passwordKey, iv);
            debugLog('ENCRYPT', 'Layer 1 complete', { size: passwordEncrypted.byteLength });

            // Generate a random symmetric key for the timelock layer
            const timelockSymmetricKey = generateRandomBytes(32);
            const timelockKey = await crypto.subtle.importKey(
                'raw',
                timelockSymmetricKey,
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );

            // Layer 2: Encrypt password-encrypted data with timelock symmetric key
            debugLog('ENCRYPT', 'Layer 2: Encrypting with timelock symmetric key (AES-256-GCM)...');
            const fullyEncrypted = await encryptAES(
                new Uint8Array(passwordEncrypted),
                timelockKey,
                dataIv
            );
            debugLog('ENCRYPT', 'Layer 2 complete', { size: fullyEncrypted.byteLength });

            // Layer 3: Timelock-encrypt the symmetric key using IBE
            debugLog('ENCRYPT', 'Layer 3: Timelock-encrypting symmetric key with IBE...');
            debugLog('ENCRYPT', 'Using drand public key for round-based IBE encryption');
            debugLog('ENCRYPT', 'Symmetric key to encrypt (length):', timelockSymmetricKey.length);
            
            // Note: tlock-js expects a drand client object, not just network info
            let timelockCiphertext;
            try {
                // Check what function is available
                if (typeof tlock.timelockEncrypt !== 'function') {
                    debugLog('ENCRYPT', 'Available tlock functions:', Object.keys(tlock));
                    throw new Error('timelockEncrypt function not found in tlock module');
                }
                
                // Create a proper drand client that tlock-js expects
                debugLog('ENCRYPT', 'Creating drand client for tlock...');
                debugLog('ENCRYPT', 'drand-client exports:', Object.keys(drandClientModule));
                
                const { HttpCachingChain, HttpChainClient } = drandClientModule;
                
                const options = {
                    disableBeaconVerification: false,
                    noCache: false,
                    chainVerificationParams: {
                        chainHash: NETWORK.chainHash,
                        publicKey: NETWORK.publicKey
                    }
                };
                
                debugLog('ENCRYPT', 'Client options:', options);
                
                const chainUrl = `${NETWORK.host}/${NETWORK.chainHash}`;
                debugLog('ENCRYPT', 'Chain URL:', chainUrl);
                
                const chain = new HttpCachingChain(chainUrl, options);
                const client = new HttpChainClient(chain, options);
                
                debugLog('ENCRYPT', 'Drand client created, calling timelockEncrypt...');
                debugLog('ENCRYPT', 'Client type:', typeof client);
                debugLog('ENCRYPT', 'Client has chain?:', typeof client.chain);
                
                timelockCiphertext = await tlock.timelockEncrypt(
                    targetRound,
                    timelockSymmetricKey,
                    client
                );
                debugLog('ENCRYPT', 'Timelock ciphertext type:', typeof timelockCiphertext);
                debugLog('ENCRYPT', 'Timelock ciphertext length:', timelockCiphertext?.length || 'N/A');
            } catch (tlockErr) {
                debugLog('ENCRYPT', '❌ tlock.timelockEncrypt failed:', tlockErr.message);
                debugLog('ENCRYPT', 'Error details:', tlockErr);
                throw new Error('Timelock encryption failed: ' + tlockErr.message);
            }
            
            debugLog('ENCRYPT', 'Layer 3 complete - symmetric key is now cryptographically timelocked');
            debugLog('ENCRYPT', 'Timelock ciphertext (armored PEM format created)');

            // Create password verifier for early verification (SLOW - brute-force resistant)
            debugLog('ENCRYPT', 'Creating slow password verifier (PBKDF2 + HMAC)...');
            const passwordVerifier = await createPasswordVerifier(password, verifierSalt);
            debugLog('ENCRYPT', 'Password verifier created');

            // Create vault structure
            const vault = {
                version: '2.2', // Real timelock + JSON-safe ciphertext + slow password verifier only (no fast passwordHash)
                type: dataType,
                created: new Date().toISOString(),
                security: {
                    method: 'tlock-ibe',
                    description: 'Cryptographic timelock using drand IBE - cannot be bypassed'
                },
                timelock: {
                    targetRound: targetRound,
                    unlockTime: unlockTime.toISOString(),
                    chainHash: NETWORK.chainHash,
                    publicKey: NETWORK.publicKey,
                    genesisTime: NETWORK.genesis,
                    roundPeriod: NETWORK.period,
                    schemeID: NETWORK.schemeID,
                    // JSON-safe, portable ciphertext wrapper
                    timelockCiphertext: serializeTimelockCiphertext(timelockCiphertext)
                },
                crypto: {
                    algorithm: 'AES-256-GCM',
                    kdf: 'PBKDF2',
                    iterations: 100000,
                    salt: arrayBufferToBase64(salt),
                    iv: arrayBufferToBase64(iv),
                    dataIv: arrayBufferToBase64(dataIv),
                    // Password verification (SLOW - 200k PBKDF2 iterations + HMAC)
                    verifierSalt: arrayBufferToBase64(verifierSalt),
                    passwordVerifier: passwordVerifier
                },
                data: arrayBufferToBase64(fullyEncrypted)
            };

            if (dataType === 'pdf' || dataType === 'file') {
                vault.originalFilename = data.name || 'encrypted-file';
            }

            debugLog('ENCRYPT', '✅ Vault created with REAL cryptographic timelock!');
            debugLog('ENCRYPT', '⚠️  The timelock CANNOT be bypassed - symmetric key is IBE-encrypted');
            debugTable({
                'Version': vault.version,
                'Type': vault.type,
                'Security Method': vault.security.method,
                'Target Round': vault.timelock.targetRound,
                'Unlock Time': vault.timelock.unlockTime,
                'Chain Hash': vault.timelock.chainHash.substring(0, 16) + '...',
                'Data Size': vault.data.length + ' chars (base64)'
            });
            debugGroupEnd();

            return vault;

        } catch (error) {
            debugLog('ENCRYPT', '❌ Encryption failed', error.message);
            debugGroupEnd();
            throw error;
        }
    }

    // ============================================
    // MAIN DECRYPTION FUNCTION (REAL TIMELOCK)
    // ============================================

    /**
     * Main decryption function for REAL cryptographic timelock
     * 
     * This will cryptographically FAIL if the drand round hasn't been published.
     * There is no code-level bypass - the IBE decryption requires the beacon.
     */
    async function decrypt(vault, password) {
        debugGroup('DECRYPTION PROCESS (REAL TIMELOCK)');
        debugLog('DECRYPT', '🔓 Starting decryption...');

        try {
            // Validate vault structure
            if (!vault || !vault.version || !vault.timelock || !vault.crypto || !vault.data) {
                throw new Error('Invalid vault file format');
            }

            // Check vault version
            const isV2 = (typeof vault.version === 'string' && vault.version.startsWith('2.')) || vault.security?.method === 'tlock-ibe';
            
            if (!isV2) {
                debugLog('DECRYPT', '⚠️  Warning: This is a v1.0 vault without real timelock');
                debugLog('DECRYPT', 'Attempting legacy decryption (vulnerable to bypass)...');
                return await decryptLegacy(vault, password);
            }

            debugLog('DECRYPT', 'Vault version 2.x detected - using real timelock');

            // Initialize tlock
            const { tlock, drandClient: drandClientModule } = await initTlock();

            const salt = new Uint8Array(base64ToArrayBuffer(vault.crypto.salt));
            const iv = new Uint8Array(base64ToArrayBuffer(vault.crypto.iv));
            const dataIv = new Uint8Array(base64ToArrayBuffer(vault.crypto.dataIv));

            // EARLY PASSWORD VERIFICATION using slow PBKDF2+HMAC verifier
            // This allows us to reject wrong passwords BEFORE waiting for the timelock
            if (vault.crypto.verifierSalt && vault.crypto.passwordVerifier) {
                debugLog('DECRYPT', 'Performing early password verification (slow PBKDF2+HMAC)...');
                const verifierSalt = new Uint8Array(base64ToArrayBuffer(vault.crypto.verifierSalt));
                const passwordValid = await verifyPasswordSlow(password, verifierSalt, vault.crypto.passwordVerifier);
                
                if (!passwordValid) {
                    debugLog('DECRYPT', '❌ Password verification FAILED');
                    debugGroupEnd();
                    return {
                        success: false,
                        error: 'password_wrong',
                        unlockTime: new Date(vault.timelock.unlockTime),
                        message: 'Incorrect password'
                    };
                }
                debugLog('DECRYPT', '✅ Password verified successfully');
            } else {
                // Fallback for vaults without verifier (will verify during AES-GCM decryption)
                debugLog('DECRYPT', 'No password verifier stored; will validate during AES-GCM decryption.');
            }

            // Check current round status
            const currentRound = await getCurrentRound();
            const targetRound = vault.timelock.targetRound;
            
            debugLog('DECRYPT', 'Timelock status', {
                currentRound: currentRound,
                targetRound: targetRound,
                roundsRemaining: targetRound - currentRound,
                isUnlocked: currentRound >= targetRound
            });

            // Attempt to decrypt the timelocked symmetric key using IBE
            debugLog('DECRYPT', 'Attempting IBE timelock decryption...');
            debugLog('DECRYPT', 'Fetching drand beacon for round', targetRound);

            let timelockSymmetricKey;
            try {
                // Fetch the beacon - this contains the signature needed for decryption
                const beacon = await fetchBeacon(targetRound);
                
                if (!beacon) {
                    const unlockTime = new Date(vault.timelock.unlockTime);
                    const secondsRemaining = (targetRound - currentRound) * NETWORK.period;
                    debugLog('DECRYPT', '⏳ Beacon not yet available - timelock still active');
                    debugGroupEnd();
                    return {
                        success: false,
                        error: 'time_locked',
                        unlockTime: unlockTime,
                        currentRound: currentRound,
                        targetRound: targetRound,
                        secondsRemaining: secondsRemaining,
                        message: `Vault unlocks at ${formatDateTime(unlockTime)}`
                    };
                }

                // Use tlock to decrypt the symmetric key
                debugLog('DECRYPT', 'Calling tlock.timelockDecrypt...');
                if (typeof tlock.timelockDecrypt !== 'function') {
                    debugLog('DECRYPT', 'Available tlock functions:', Object.keys(tlock));
                    throw new Error('timelockDecrypt function not found');
                }
                
                // Create a proper drand client for decryption
                const { HttpCachingChain, HttpChainClient } = drandClientModule;
                
                const options = {
                    disableBeaconVerification: false,
                    noCache: false,
                    chainVerificationParams: {
                        chainHash: vault.timelock.chainHash,
                        publicKey: vault.timelock.publicKey
                    }
                };
                
                const chainUrl = `https://api.drand.sh/${vault.timelock.chainHash}`;
                const chain = new HttpCachingChain(chainUrl, options);
                const client = new HttpChainClient(chain, options);
                
                const tlCiphertext = deserializeTimelockCiphertext(vault.timelock.timelockCiphertext);

                timelockSymmetricKey = await tlock.timelockDecrypt(
                    tlCiphertext,
                    client
                );
                
                if (!(timelockSymmetricKey instanceof Uint8Array)) {
                    timelockSymmetricKey = new Uint8Array(timelockSymmetricKey);
                }
                
                debugLog('DECRYPT', '✅ Timelock decryption successful - symmetric key recovered');
                debugLog('DECRYPT', 'Recovered key length:', timelockSymmetricKey.length);

            } catch (tlockError) {
                debugLog('DECRYPT', '⏳ Timelock decryption failed', tlockError.message);
                
                if (tlockError.message.includes('too early') || 
                    tlockError.message.includes('not yet') ||
                    currentRound < targetRound) {
                    const unlockTime = new Date(vault.timelock.unlockTime);
                    debugGroupEnd();
                    return {
                        success: false,
                        error: 'time_locked',
                        unlockTime: unlockTime,
                        currentRound: currentRound,
                        targetRound: targetRound,
                        message: `Vault unlocks at ${formatDateTime(unlockTime)}`
                    };
                }
                throw tlockError;
            }

            // Import the recovered symmetric key
            const timelockKey = await crypto.subtle.importKey(
                'raw',
                timelockSymmetricKey,
                { name: 'AES-GCM', length: 256 },
                false,
                ['decrypt']
            );

            // Layer 2: Decrypt with timelock symmetric key
            debugLog('DECRYPT', 'Layer 2: Decrypting with recovered timelock key...');
            const encryptedData = base64ToArrayBuffer(vault.data);
            const passwordEncrypted = await decryptAES(encryptedData, timelockKey, dataIv);
            debugLog('DECRYPT', 'Layer 2 complete');

            // Layer 1: Decrypt with password
            debugLog('DECRYPT', 'Layer 1: Decrypting with password key...');
            let decryptedData;
            try {
                const passwordKey = await deriveKey(password, salt);
                decryptedData = await decryptAES(passwordEncrypted, passwordKey, iv);
            } catch (e) {
                // AES-GCM authentication failed: wrong password OR corrupted vault data.
                const unlockTime = new Date(vault.timelock.unlockTime);
                debugLog('DECRYPT', '❌ Password decryption failed (AES-GCM auth error)');
                debugGroupEnd();
                return {
                    success: false,
                    error: 'password_wrong',
                    unlockTime: unlockTime,
                    currentRound: currentRound,
                    targetRound: targetRound,
                    message: 'Decryption failed. Password is wrong or vault data is corrupted.'
                };
            }
            debugLog('DECRYPT', 'Layer 1 complete');

            // Convert to appropriate format
            if (vault.type === 'text') {
                const text = new TextDecoder().decode(decryptedData);
                debugLog('DECRYPT', '✅ SUCCESS - Text decrypted', {
                    length: text.length
                });
                debugGroupEnd();
                return {
                    success: true,
                    type: 'text',
                    data: text
                };
            } else {
                debugLog('DECRYPT', '✅ SUCCESS - File decrypted', {
                    size: decryptedData.byteLength
                });
                debugGroupEnd();
                return {
                    success: true,
                    type: vault.type,
                    data: new Uint8Array(decryptedData),
                    filename: vault.originalFilename || 'decrypted-file'
                };
            }

        } catch (error) {
            debugLog('DECRYPT', '❌ Decryption FAILED', error.message);
            debugGroupEnd();
            throw new Error('Decryption failed: ' + error.message);
        }
    }

    /**
     * Legacy decryption for v1.0 vaults (with bypass vulnerability)
     * Kept for backwards compatibility but marked as insecure
     */
    async function decryptLegacy(vault, password) {
        debugLog('DECRYPT', '⚠️  LEGACY MODE - This vault uses bypassable timelock');
        
        const salt = new Uint8Array(base64ToArrayBuffer(vault.crypto.salt));
        const iv = new Uint8Array(base64ToArrayBuffer(vault.crypto.iv));
        const timelockIv = new Uint8Array(base64ToArrayBuffer(vault.crypto.timelockIv));

        // Verify password
        const passwordValid = await verifyPasswordLegacy(password, salt, vault.crypto.passwordHash);
        if (!passwordValid) {
            return {
                success: false,
                error: 'password_wrong',
                unlockTime: new Date(vault.timelock.unlockTime),
                message: 'Password incorrect'
            };
        }

        // Check round (THIS CAN BE BYPASSED IN V1)
        const currentRound = await getCurrentRound();
        const targetRound = vault.timelock.targetRound;

        if (currentRound < targetRound) {
            return {
                success: false,
                error: 'time_locked',
                unlockTime: new Date(vault.timelock.unlockTime),
                currentRound: currentRound,
                targetRound: targetRound,
                message: 'Vault is still timelocked (v1 - bypassable)'
            };
        }

        // Decrypt using stored secret (THE VULNERABILITY)
        const timelockSecret = vault.crypto.timelockSecret;
        const encoder = new TextEncoder();
        const combined = encoder.encode(`${timelockSecret}-timelock-${targetRound}`);
        
        const keyMaterial = await crypto.subtle.importKey(
            'raw', combined, 'PBKDF2', false, ['deriveKey']
        );
        
        const timelockSalt = encoder.encode(`timelock-salt-${targetRound}`);
        const timelockKey = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: timelockSalt, iterations: 50000, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );

        const encryptedData = base64ToArrayBuffer(vault.data);
        const passwordEncrypted = await decryptAES(encryptedData, timelockKey, timelockIv);
        
        const passwordKey = await deriveKey(password, salt);
        const decryptedData = await decryptAES(passwordEncrypted, passwordKey, iv);

        if (vault.type === 'text') {
            return {
                success: true,
                type: 'text',
                data: new TextDecoder().decode(decryptedData),
                warning: 'This vault used legacy v1 timelock (bypassable)'
            };
        } else {
            return {
                success: true,
                type: vault.type,
                data: new Uint8Array(decryptedData),
                filename: vault.originalFilename || 'decrypted-file',
                warning: 'This vault used legacy v1 timelock (bypassable)'
            };
        }
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

    /**
     * Format date/time for display
     */
    function formatDateTime(date) {
        return date.toLocaleString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    /**
     * Parse vault file
     */
    function parseVaultFile(content) {
        try {
            return JSON.parse(content);
        } catch (error) {
            throw new Error('Invalid vault file - could not parse');
        }
    }

    /**
     * Create downloadable vault file
     */
    function createVaultFile(vault) {
        const content = JSON.stringify(vault, null, 2);
        return new Blob([content], { type: 'application/json' });
    }

    /**
     * Calculate time remaining until unlock
     */
    function getTimeRemaining(unlockTime) {
        const now = new Date();
        const diff = unlockTime - now;

        if (diff <= 0) return null;

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        let str = '';
        if (days > 0) str += `${days}d `;
        if (hours > 0 || days > 0) str += `${hours}h `;
        if (minutes > 0 || hours > 0 || days > 0) str += `${minutes}m `;
        str += `${seconds}s`;

        return str.trim();
    }

    /**
     * Get vault metadata
     */
    function getVaultMetadata(vault) {
        return {
            version: vault.version,
            type: vault.type,
            created: new Date(vault.created),
            unlockTime: new Date(vault.timelock.unlockTime),
            targetRound: vault.timelock.targetRound,
            securityMethod: vault.security?.method || 'legacy-bypassable',
            isRealTimelock: (typeof vault.version === 'string' && vault.version.startsWith('2.')) || vault.security?.method === 'tlock-ibe'
        };
    }

    /**
     * Check if vault uses real cryptographic timelock
     */
    function isSecureVault(vault) {
        return (typeof vault.version === 'string' && vault.version.startsWith('2.')) || vault.security?.method === 'tlock-ibe';
    }

    // ============================================
    // PUBLIC API
    // ============================================

    return {
        // Initialization
        initTlock,
        
        // Drand functions
        getDrandInfo,
        getCurrentRound,
        calculateRoundForTime,
        calculateTimeFromRound,
        fetchBeacon,
        
        // Main encryption/decryption
        encrypt,
        decrypt,
        
        // Vault utilities
        parseVaultFile,
        createVaultFile,
        getVaultMetadata,
        isSecureVault,
        
        // Display utilities
        formatDateTime,
        getTimeRemaining,
        
        // Network info
        getNetworkInfo,
        
        // Constants
        ROUND_PERIOD: NETWORK.period,
        GENESIS_TIME: NETWORK.genesis,
        CHAIN_HASH: NETWORK.chainHash
    };
})();

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CryptoUtils;
}