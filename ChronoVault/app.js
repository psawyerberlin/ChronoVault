/**
 * ChronoVault - Main Application
 * Handles UI interactions and orchestrates encryption/decryption
 */

(function() {
    'use strict';

    // ============================================
    // DEBUG FLAG - Set to false for production
    // ============================================
    const DEBUG_FLAG = false;

    // Debug logging helper
    function debugLog(category, message, data = null) {
        if (!DEBUG_FLAG) return;
        const timestamp = new Date().toISOString().substr(11, 12);
        const prefix = `[ChronoVault UI ${timestamp}] [${category}]`;
        if (data !== null) {
            console.log(`${prefix} ${message}`, data);
        } else {
            console.log(`${prefix} ${message}`);
        }
    }

    // Log on load
    if (DEBUG_FLAG) {
        console.log('%c🖥️ ChronoVault UI Loaded (DEBUG MODE)', 'color: #ffb800; font-weight: bold; font-size: 14px;');
    }

    // ============================================
    // Mobile Detection & File Reading Helpers
    // ============================================

    /**
     * Detects if the current device is mobile
     * @returns {boolean} True if mobile device
     */
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
               || window.innerWidth <= 768;
    }

    /**
     * Reads file as ArrayBuffer with fallback for older browsers
     * @param {File} file - File to read
     * @returns {Promise<Uint8Array>} File contents as Uint8Array
     */
    function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(new Uint8Array(e.target.result));
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Reads file as text with fallback for older browsers
     * @param {File} file - File to read
     * @returns {Promise<string>} File contents as string
     */
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    // Log mobile device detection
    if (DEBUG_FLAG) {
        const mobile = isMobileDevice();
        debugLog('INIT', `Device type: ${mobile ? 'Mobile' : 'Desktop'}`, {
            userAgent: navigator.userAgent,
            screenWidth: window.innerWidth
        });
    }

    // ============================================
    // State Management
    // ============================================
    
    const state = {
        mode: 'encrypt', // 'encrypt' or 'decrypt'
        inputType: 'text', // 'text' or 'file'
        selectedFile: null,
        vaultFile: null,
        vaultData: null
    };

    // ============================================
    // DOM Elements
    // ============================================
    
    const elements = {
        // Mode switching
        encryptModeBtn: document.getElementById('encryptModeBtn'),
        decryptModeBtn: document.getElementById('decryptModeBtn'),
        encryptPanel: document.getElementById('encryptPanel'),
        decryptPanel: document.getElementById('decryptPanel'),

        // Input type tabs
        textTabBtn: document.getElementById('textTabBtn'),
        fileTabBtn: document.getElementById('fileTabBtn'),
        textInputArea: document.getElementById('textInputArea'),
        fileInputArea: document.getElementById('fileInputArea'),

        // Text input
        secretText: document.getElementById('secretText'),
        charCount: document.getElementById('charCount'),

        // File input
        fileDropZone: document.getElementById('fileDropZone'),
        fileInput: document.getElementById('fileInput'),
        selectedFile: document.getElementById('selectedFile'),
        fileName: document.getElementById('fileName'),
        fileSize: document.getElementById('fileSize'),
        removeFile: document.getElementById('removeFile'),

        // Encrypt form
        encryptPassword: document.getElementById('encryptPassword'),
        toggleEncryptPw: document.getElementById('toggleEncryptPw'),
        strengthFill: document.getElementById('strengthFill'),
        strengthLabel: document.getElementById('strengthLabel'),
        unlockDate: document.getElementById('unlockDate'),
        unlockTime: document.getElementById('unlockTime'),
        countdownPreview: document.getElementById('countdownPreview'),
        encryptBtn: document.getElementById('encryptBtn'),

        // Decrypt form
        vaultDropZone: document.getElementById('vaultDropZone'),
        vaultFileInput: document.getElementById('vaultFileInput'),
        vaultLoaded: document.getElementById('vaultLoaded'),
        vaultFileName: document.getElementById('vaultFileName'),
        vaultMeta: document.getElementById('vaultMeta'),
        removeVault: document.getElementById('removeVault'),
        decryptPasswordSection: document.getElementById('decryptPasswordSection'),
        decryptPassword: document.getElementById('decryptPassword'),
        toggleDecryptPw: document.getElementById('toggleDecryptPw'),
        decryptBtn: document.getElementById('decryptBtn'),

        // Results
        resultSection: document.getElementById('resultSection'),
        resultCard: document.getElementById('resultCard'),
        resultIcon: document.getElementById('resultIcon'),
        resultTitle: document.getElementById('resultTitle'),
        resultMessage: document.getElementById('resultMessage'),
        resultContent: document.getElementById('resultContent'),
        resultActions: document.getElementById('resultActions'),

        // Loading
        loadingOverlay: document.getElementById('loadingOverlay'),
        loadingText: document.getElementById('loadingText'),

        // Status
        currentRound: document.getElementById('currentRound'),
        particles: document.getElementById('particles')
    };

    // ============================================
    // Initialization
    // ============================================
    
    /**
     * Updates UI elements for mobile devices
     */
    function updateMobileUI() {
        if (!isMobileDevice()) return;

        debugLog('INIT', 'Applying mobile-specific UI updates');

        // Update PDF drop zone text
        const pdfDropText = elements.fileDropZone.querySelector('p');
        if (pdfDropText) {
            pdfDropText.innerHTML = window.I18N.t('mobile.file.tap');
        }

        // Update vault drop zone text
        const vaultDropText = elements.vaultDropZone.querySelector('p');
        const vaultDropHint = elements.vaultDropZone.querySelector('.file-hint');
        if (vaultDropText) {
            vaultDropText.innerHTML = `${window.I18N.t('mobile.vault.tap')} <span class="accent">${window.I18N.t('mobile.vault.file')}</span> ${window.I18N.t('mobile.vault.file2')}`;
        }
        if (vaultDropHint) {
            vaultDropHint.style.display = 'none'; // Hide "or click to browse" on mobile
        }
    }

    function init() {
        debugLog('INIT', 'Initializing ChronoVault application...');
        createParticles();
        setMinDateTime();
        setupEventListeners();
        updateMobileUI();
        updateDrandStatus();
        setInterval(updateDrandStatus, 10000);
        setInterval(updateCountdownPreview, 1000);
        debugLog('INIT', '✅ Initialization complete');
    }

    function createParticles() {
        const container = elements.particles;
        for (let i = 0; i < 30; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = `${Math.random() * 100}%`;
            particle.style.animationDelay = `${Math.random() * 20}s`;
            particle.style.animationDuration = `${15 + Math.random() * 10}s`;
            container.appendChild(particle);
        }
    }

    function setMinDateTime() {
        const now = new Date();
        
        // Set minimum date to today
        const todayStr = now.toISOString().split('T')[0];
        elements.unlockDate.min = todayStr;
        
        // Set default date to today
        elements.unlockDate.value = todayStr;
        
        // Set default time to 1 hour from now in 24h format with seconds
        const defaultTime = new Date(now.getTime() + 60 * 60 * 1000);
        const hours = String(defaultTime.getHours()).padStart(2, '0');
        const minutes = String(defaultTime.getMinutes()).padStart(2, '0');
        const seconds = String(defaultTime.getSeconds()).padStart(2, '0');
        elements.unlockTime.value = `${hours}:${minutes}:${seconds}`;
        
        debugLog('INIT', 'Set default unlock time', {
            date: elements.unlockDate.value,
            time: elements.unlockTime.value
        });
    }
    
    function handleTimeInput(e) {
        let value = e.target.value.replace(/[^\d:]/g, '');
        
        // Auto-insert colons
        if (value.length === 2 && !value.includes(':')) {
            value = value + ':';
        } else if (value.length === 5 && value.split(':').length === 2) {
            value = value + ':';
        }
        
        // Limit to HH:MM:SS format
        const parts = value.split(':');
        if (parts.length > 3) {
            value = parts.slice(0, 3).join(':');
        }
        
        // Limit each part
        if (parts[0] && parts[0].length > 2) parts[0] = parts[0].slice(0, 2);
        if (parts[1] && parts[1].length > 2) parts[1] = parts[1].slice(0, 2);
        if (parts[2] && parts[2].length > 2) parts[2] = parts[2].slice(0, 2);
        
        e.target.value = parts.join(':');
    }
    
    function validateTimeInput(e) {
        const value = e.target.value;
        const regex = /^([01]?[0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9])$/;
        
        if (value && !regex.test(value)) {
            // Try to fix common issues
            const parts = value.split(':');
            let hours = parseInt(parts[0]) || 0;
            let minutes = parseInt(parts[1]) || 0;
            let seconds = parseInt(parts[2]) || 0;
            
            hours = Math.min(23, Math.max(0, hours));
            minutes = Math.min(59, Math.max(0, minutes));
            seconds = Math.min(59, Math.max(0, seconds));
            
            e.target.value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        } else if (value) {
            // Normalize format (ensure leading zeros)
            const parts = value.split(':');
            e.target.value = `${String(parseInt(parts[0])).padStart(2, '0')}:${String(parseInt(parts[1])).padStart(2, '0')}:${String(parseInt(parts[2])).padStart(2, '0')}`;
        }
    }

    async function updateDrandStatus() {
        try {
            const round = await CryptoUtils.getCurrentRound();
            elements.currentRound.textContent = `Round: ${round.toLocaleString()}`;
        } catch (error) {
            elements.currentRound.textContent = 'Round: Error';
            console.error('Failed to fetch drand status:', error);
        }
    }

    // ============================================
    // Event Listeners
    // ============================================
    
    function setupEventListeners() {
        // Mode switching
        elements.encryptModeBtn.addEventListener('click', () => switchMode('encrypt'));
        elements.decryptModeBtn.addEventListener('click', () => switchMode('decrypt'));

        // Input type tabs
        elements.textTabBtn.addEventListener('click', () => switchInputType('text'));
        elements.fileTabBtn.addEventListener('click', () => switchInputType('file'));

        // Text input
        elements.secretText.addEventListener('input', updateCharCount);

        // File input (PDF)
        elements.fileDropZone.addEventListener('click', () => elements.fileInput.click());
        elements.fileInput.addEventListener('change', handleFileSelect);
        elements.fileDropZone.addEventListener('dragover', handleDragOver);
        elements.fileDropZone.addEventListener('dragleave', handleDragLeave);
        elements.fileDropZone.addEventListener('drop', handleDrop);
        elements.removeFile.addEventListener('click', clearSelectedFile);

        // Password visibility
        elements.toggleEncryptPw.addEventListener('click', () => togglePasswordVisibility(elements.encryptPassword));
        elements.toggleDecryptPw.addEventListener('click', () => togglePasswordVisibility(elements.decryptPassword));

        // Password strength
        elements.encryptPassword.addEventListener('input', updatePasswordStrength);

        // Time input formatting (24h)
        elements.unlockTime.addEventListener('input', handleTimeInput);
        elements.unlockTime.addEventListener('blur', validateTimeInput);

        // Encrypt
        elements.encryptBtn.addEventListener('click', handleEncrypt);

        // Vault file input
        elements.vaultDropZone.addEventListener('click', () => elements.vaultFileInput.click());
        elements.vaultFileInput.addEventListener('change', handleVaultSelect);
        elements.vaultDropZone.addEventListener('dragover', handleDragOver);
        elements.vaultDropZone.addEventListener('dragleave', handleDragLeave);
        elements.vaultDropZone.addEventListener('drop', handleVaultDrop);
        elements.removeVault.addEventListener('click', clearVaultFile);

        // Decrypt
        elements.decryptBtn.addEventListener('click', handleDecrypt);
    }

    // ============================================
    // Mode & Tab Switching
    // ============================================
    
    function switchMode(mode) {
        debugLog('UI', 'Switching mode', { from: state.mode, to: mode });
        state.mode = mode;
        hideResult();

        elements.encryptModeBtn.classList.toggle('active', mode === 'encrypt');
        elements.decryptModeBtn.classList.toggle('active', mode === 'decrypt');
        elements.encryptPanel.classList.toggle('active', mode === 'encrypt');
        elements.decryptPanel.classList.toggle('active', mode === 'decrypt');
    }

    function switchInputType(type) {
        debugLog('UI', 'Switching input type', { from: state.inputType, to: type });
        state.inputType = type;

        elements.textTabBtn.classList.toggle('active', type === 'text');
        elements.fileTabBtn.classList.toggle('active', type === 'file');
        elements.textInputArea.classList.toggle('active', type === 'text');
        elements.fileInputArea.classList.toggle('active', type === 'file');
    }

    // ============================================
    // Text Input
    // ============================================
    
    function updateCharCount() {
        const count = elements.secretText.value.length;
        elements.charCount.textContent = count.toLocaleString();
    }

    // ============================================
    // File Input (PDF)
    // ============================================
    
    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.add('dragover');
    }

    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.remove('dragover');
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.remove('dragover');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            processSelectedFile(files[0]);
        }
    }

    function handleFileSelect(e) {
        if (e.target.files.length > 0) {
            processSelectedFile(e.target.files[0]);
        }
    }

    function processSelectedFile(file) {
        // Validate file extension (more reliable on mobile)
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.pdf')) {
            debugLog('UI', '❌ Invalid file extension', { name: file.name, type: file.type });
            showResult('error', window.I18N.t('error.invalid.file'), window.I18N.t('error.select.pdf'));
            return;
        }

        // Log MIME type for debugging (mobile browsers often don't set this correctly)
        if (file.type && file.type !== 'application/pdf') {
            debugLog('UI', '⚠️ Non-standard MIME type (allowing anyway based on extension)', {
                name: file.name,
                type: file.type
            });
        }

        // Validate file size (10MB max)
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            showResult('error', window.I18N.t('error.file.toolarge'), window.I18N.t('error.file.maxsize'));
            return;
        }

        state.selectedFile = file;
        
        elements.fileName.textContent = file.name;
        elements.fileSize.textContent = formatFileSize(file.size);
        elements.fileDropZone.style.display = 'none';
        elements.selectedFile.style.display = 'flex';
    }

    function clearSelectedFile() {
        state.selectedFile = null;
        elements.fileInput.value = '';
        elements.fileDropZone.style.display = 'flex';
        elements.selectedFile.style.display = 'none';
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    // ============================================
    // Vault File Input
    // ============================================
    
    function handleVaultDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.remove('dragover');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            processVaultFile(files[0]);
        }
    }

    function handleVaultSelect(e) {
        if (e.target.files.length > 0) {
            processVaultFile(e.target.files[0]);
        }
    }

    async function processVaultFile(file) {
        debugLog('UI', 'Processing vault file...', {
            filename: file.name,
            size: file.size + ' bytes'
        });
        
        // Validate file extension (accept both .vault and .vault.json)
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.vault') && !fileName.endsWith('.vault.json')) {
            debugLog('UI', '❌ Invalid file extension', { name: file.name });
            showResult('error', window.I18N.t('error.invalid.file'), window.I18N.t('error.select.vault'));
            return;
        }

        try {
            // Read file with mobile-compatible fallback
            let content;
            try {
                content = await file.text();
            } catch (error) {
                debugLog('UI', '⚠️ file.text() failed, using FileReader fallback', { error: error.message });
                content = await readFileAsText(file);
            }
            debugLog('UI', 'File content loaded', {
                contentLength: content.length + ' chars'
            });

            const vaultData = CryptoUtils.parseVaultFile(content);
            const metadata = CryptoUtils.getVaultMetadata(vaultData);

            debugLog('UI', '✅ Vault file parsed successfully', {
                version: vaultData.version,
                type: metadata.type,
                created: metadata.created.toISOString(),
                unlockTime: metadata.unlockTime.toISOString(),
                targetRound: metadata.targetRound,
                algorithm: vaultData.crypto?.algorithm,
                kdf: vaultData.crypto?.kdf,
                iterations: vaultData.crypto?.iterations,
                dataSize: vaultData.data?.length + ' chars (base64)'
            });

            state.vaultFile = file;
            state.vaultData = vaultData;

            elements.vaultFileName.textContent = file.name;
            elements.vaultMeta.textContent = `${metadata.type.toUpperCase()} • ${window.I18N.t('vault.meta.unlocks')} ${CryptoUtils.formatDateTime(metadata.unlockTime)}`;

            elements.vaultDropZone.style.display = 'none';
            elements.vaultLoaded.style.display = 'block';
            elements.decryptPasswordSection.style.display = 'block';

        } catch (error) {
            debugLog('UI', '❌ Failed to parse vault file', { error: error.message });
            showResult('error', window.I18N.t('error.invalid.vault'), error.message);
        }
    }

    function clearVaultFile() {
        state.vaultFile = null;
        state.vaultData = null;
        elements.vaultFileInput.value = '';
        elements.vaultDropZone.style.display = 'flex';
        elements.vaultLoaded.style.display = 'none';
        elements.decryptPasswordSection.style.display = 'none';
        elements.decryptPassword.value = '';
        hideResult();
    }

    // ============================================
    // Password Handling
    // ============================================
    
    function togglePasswordVisibility(input) {
        input.type = input.type === 'password' ? 'text' : 'password';
    }

    function updatePasswordStrength() {
        const password = elements.encryptPassword.value;
        const strength = calculatePasswordStrength(password);

        elements.strengthFill.className = 'strength-fill';

        if (password.length === 0) {
            elements.strengthLabel.textContent = window.I18N.t('password.strength.enter');
            return;
        }

        if (strength < 25) {
            elements.strengthFill.classList.add('weak');
            elements.strengthLabel.textContent = window.I18N.t('password.strength.weak');
        } else if (strength < 50) {
            elements.strengthFill.classList.add('fair');
            elements.strengthLabel.textContent = window.I18N.t('password.strength.fair');
        } else if (strength < 75) {
            elements.strengthFill.classList.add('good');
            elements.strengthLabel.textContent = window.I18N.t('password.strength.good');
        } else {
            elements.strengthFill.classList.add('strong');
            elements.strengthLabel.textContent = window.I18N.t('password.strength.strong');
        }
    }

    function calculatePasswordStrength(password) {
        let score = 0;
        
        if (password.length >= 8) score += 20;
        if (password.length >= 12) score += 10;
        if (password.length >= 16) score += 10;
        if (/[a-z]/.test(password)) score += 15;
        if (/[A-Z]/.test(password)) score += 15;
        if (/[0-9]/.test(password)) score += 15;
        if (/[^a-zA-Z0-9]/.test(password)) score += 15;

        return Math.min(100, score);
    }

    // ============================================
    // Countdown Preview
    // ============================================
    
    function updateCountdownPreview() {
        const dateValue = elements.unlockDate.value;
        const timeValue = elements.unlockTime.value;
        
        if (!dateValue || !timeValue) {
            elements.countdownPreview.textContent = '--';
            return;
        }

        // Combine date and time into a Date object
        const unlockTime = new Date(`${dateValue}T${timeValue}`);

        if (isNaN(unlockTime.getTime())) {
            elements.countdownPreview.textContent = window.I18N.t('countdown.invalid');
            return;
        }

        const remaining = CryptoUtils.getTimeRemaining(unlockTime);

        if (remaining) {
            elements.countdownPreview.textContent = remaining;
        } else {
            elements.countdownPreview.textContent = window.I18N.t('countdown.past');
        }
    }

    // ============================================
    // Encryption
    // ============================================
    
    async function handleEncrypt() {
        debugLog('UI', '🔒 Encrypt button clicked');
        hideResult();

        // Validate input
        let data;
        let dataType;
        let originalFilename;

        if (state.inputType === 'text') {
            data = elements.secretText.value.trim();
            if (!data) {
                debugLog('UI', '❌ Validation failed: No text content');
                showResult('error', window.I18N.t('error.no.content'), window.I18N.t('error.enter.text'));
                return;
            }
            dataType = 'text';
            debugLog('UI', 'Input validated: Text mode', { 
                textLength: data.length 
            });
        } else {
            if (!state.selectedFile) {
                debugLog('UI', '❌ Validation failed: No file selected');
                showResult('error', window.I18N.t('error.no.file'), window.I18N.t('error.select.file.encrypt'));
                return;
            }
            // Read file with mobile-compatible fallback
            try {
                data = new Uint8Array(await state.selectedFile.arrayBuffer());
            } catch (error) {
                debugLog('UI', '⚠️ arrayBuffer() failed, using FileReader fallback', { error: error.message });
                data = await readFileAsArrayBuffer(state.selectedFile);
            }
            dataType = 'pdf';
            originalFilename = state.selectedFile.name;
            debugLog('UI', 'Input validated: File mode', {
                filename: originalFilename,
                fileSize: data.length + ' bytes'
            });
        }

        // Validate password
        const password = elements.encryptPassword.value;
        if (!password) {
            debugLog('UI', '❌ Validation failed: No password');
            showResult('error', window.I18N.t('error.no.password'), window.I18N.t('error.enter.password'));
            return;
        }

        if (password.length < 6) {
            debugLog('UI', '❌ Validation failed: Password too short', {
                length: password.length
            });
            showResult('error', window.I18N.t('error.weak.password'), window.I18N.t('error.password.minlength'));
            return;
        }
        
        debugLog('UI', 'Password validated', {
            length: password.length,
            strength: calculatePasswordStrength(password) + '%'
        });

        // Validate unlock time
        const unlockDateValue = elements.unlockDate.value;
        const unlockTimeValue = elements.unlockTime.value;

        if (!unlockDateValue || !unlockTimeValue) {
            debugLog('UI', '❌ Validation failed: No unlock date/time');
            showResult('error', window.I18N.t('error.no.unlock.time'), window.I18N.t('error.select.datetime'));
            return;
        }

        const unlockTime = new Date(`${unlockDateValue}T${unlockTimeValue}`);

        if (isNaN(unlockTime.getTime())) {
            debugLog('UI', '❌ Validation failed: Invalid date/time format');
            showResult('error', window.I18N.t('error.invalid.time'), window.I18N.t('error.invalid.datetime'));
            return;
        }

        if (unlockTime <= new Date()) {
            debugLog('UI', '❌ Validation failed: Unlock time in past', {
                unlockTime: unlockTime.toISOString(),
                now: new Date().toISOString()
            });
            showResult('error', window.I18N.t('error.invalid.time'), window.I18N.t('error.time.future'));
            return;
        }
        
        debugLog('UI', 'Unlock time validated', {
            date: unlockDateValue,
            time: unlockTimeValue,
            combined: unlockTime.toISOString(),
            timeUntilUnlock: CryptoUtils.getTimeRemaining(unlockTime)
        });

        // Show loading
        showLoading(window.I18N.t('loading.encrypting'));
        debugLog('UI', '⏳ Starting encryption via CryptoUtils...');

        try {
            // Perform encryption
            const vault = await CryptoUtils.encrypt(data, password, unlockTime, dataType);
            
            // Add original filename for PDFs
            if (originalFilename) {
                vault.originalFilename = originalFilename;
            }

            // Create vault file
            const blob = CryptoUtils.createVaultFile(vault);
            const filename = `chronovault_${Date.now()}.vault`;
            const url = URL.createObjectURL(blob);

            debugLog('UI', '✅ Encryption successful!', {
                filename: filename,
                blobSize: blob.size + ' bytes'
            });

            hideLoading();

            // Show success result
            showEncryptSuccess(url, filename, unlockTime);

        } catch (error) {
            debugLog('UI', '❌ Encryption failed', { error: error.message });
            hideLoading();
            showResult('error', window.I18N.t('error.encryption.failed'), error.message);
        }
    }

    function showEncryptSuccess(downloadUrl, filename, unlockTime) {
        // Clear the form data
        clearEncryptForm();
        
        elements.resultCard.className = 'result-card success';
        
        elements.resultIcon.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
        `;
        
        elements.resultTitle.textContent = window.I18N.t('result.vault.created');
        elements.resultMessage.innerHTML = `
            ${window.I18N.t('result.data.secured')}<br>
            <strong>${window.I18N.t('result.unlock.date')}</strong> ${CryptoUtils.formatDateTime(unlockTime)}
        `;

        elements.resultContent.innerHTML = '';

        elements.resultActions.innerHTML = `
            <a href="${downloadUrl}" download="${filename}" class="result-btn primary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                ${window.I18N.t('result.download.vault')}
            </a>
            <button class="result-btn secondary" onclick="resetEncryptForm()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="23 4 23 10 17 10"/>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                ${window.I18N.t('result.create.another')}
            </button>
        `;
        
        elements.resultSection.style.display = 'block';
        elements.resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    function clearEncryptForm() {
        debugLog('UI', 'Clearing encrypt form data');
        
        // Clear text input
        elements.secretText.value = '';
        elements.charCount.textContent = '0';
        
        // Clear file input
        clearSelectedFile();
        
        // Clear password
        elements.encryptPassword.value = '';
        elements.strengthFill.className = 'strength-fill';
        elements.strengthLabel.textContent = window.I18N.t('password.strength.enter');

        // Reset date/time to defaults
        setMinDateTime();
    }

    // ============================================
    // Decryption
    // ============================================
    
    async function handleDecrypt() {
        debugLog('UI', '🔓 Decrypt button clicked');
        hideResult();

        if (!state.vaultData) {
            debugLog('UI', '❌ Validation failed: No vault file loaded');
            showResult('error', window.I18N.t('error.no.vault'), window.I18N.t('error.upload.vault'));
            return;
        }
        
        debugLog('UI', 'Vault file loaded', {
            type: state.vaultData.type,
            version: state.vaultData.version,
            targetRound: state.vaultData.timelock?.targetRound,
            unlockTime: state.vaultData.timelock?.unlockTime
        });

        const password = elements.decryptPassword.value;
        if (!password) {
            debugLog('UI', '❌ Validation failed: No password entered');
            showResult('error', window.I18N.t('error.no.password'), window.I18N.t('error.enter.vault.password'));
            return;
        }
        
        debugLog('UI', 'Password entered', { length: password.length });

        showLoading(window.I18N.t('loading.decrypting'));
        debugLog('UI', '⏳ Starting decryption via CryptoUtils...');

        try {
            const result = await CryptoUtils.decrypt(state.vaultData, password);
            hideLoading();

            debugLog('UI', 'Decryption result received', {
                success: result.success,
                error: result.error || 'none',
                type: result.type || 'N/A'
            });

            if (result.success) {
                debugLog('UI', '✅ Decryption successful!');
                showDecryptSuccess(result);
            } else {
                debugLog('UI', '⚠️ Decryption blocked', {
                    reason: result.error,
                    passwordCorrect: result.passwordCorrect || false,
                    unlockTime: result.unlockTime?.toISOString()
                });
                showDecryptError(result);
            }

        } catch (error) {
            debugLog('UI', '❌ Decryption error', { error: error.message });
            hideLoading();
            showResult('error', window.I18N.t('error.decryption.failed'), error.message);
        }
    }

    function showDecryptSuccess(result) {
        elements.resultCard.className = 'result-card success';
        
        elements.resultIcon.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
            </svg>
        `;
        
        elements.resultTitle.textContent = window.I18N.t('result.vault.unlocked');
        elements.resultMessage.textContent = window.I18N.t('result.data.decrypted');

        if (result.type === 'text') {
            elements.resultContent.innerHTML = `<div class="decrypted-text">${escapeHtml(result.data)}</div>`;
            elements.resultActions.innerHTML = `
                <button class="result-btn primary" onclick="copyDecryptedText()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    ${window.I18N.t('result.copy.text')}
                </button>
                <button class="result-btn secondary" onclick="clearVaultFileGlobal()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 4 23 10 17 10"/>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                    ${window.I18N.t('result.decrypt.another')}
                </button>
            `;
            
            // Store for copy function
            window.decryptedTextContent = result.data;
            
        } else if (result.type === 'pdf') {
            const blob = new Blob([result.data], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            
            elements.resultContent.innerHTML = '';
            elements.resultActions.innerHTML = `
                <a href="${url}" download="${result.filename}" class="result-btn primary">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    ${window.I18N.t('result.download.pdf')}
                </a>
                <button class="result-btn secondary" onclick="clearVaultFileGlobal()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 4 23 10 17 10"/>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                    ${window.I18N.t('result.decrypt.another')}
                </button>
            `;
        }
        
        elements.resultSection.style.display = 'block';
        elements.resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function showDecryptError(result) {
        if (result.error === 'password_wrong') {
            elements.resultCard.className = 'result-card error';
            
            elements.resultIcon.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
            `;
            
            elements.resultTitle.textContent = window.I18N.t('result.password.incorrect');
            elements.resultMessage.innerHTML = `
                ${window.I18N.t('result.password.wrong')}<br>
                <strong>${window.I18N.t('result.cannot.reveal')}</strong> ${CryptoUtils.formatDateTime(result.unlockTime)}
            `;
            
        } else if (result.error === 'time_locked') {
            elements.resultCard.className = 'result-card pending';
            
            elements.resultIcon.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                </svg>
            `;
            
            elements.resultTitle.textContent = window.I18N.t('result.password.correct');
            elements.resultMessage.innerHTML = `
                ${window.I18N.t('result.password.correct.locked')}<br>
                <strong>${window.I18N.t('result.cannot.reveal')}</strong> ${CryptoUtils.formatDateTime(result.unlockTime)}
            `;
            
            const remaining = CryptoUtils.getTimeRemaining(result.unlockTime);
            if (remaining) {
                elements.resultContent.innerHTML = `
                    <div class="unlock-countdown">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <span id="liveCountdown">${remaining}</span>
                    </div>
                `;
                
                // Start live countdown
                startLiveCountdown(result.unlockTime);
            }
        }
        
        elements.resultActions.innerHTML = `
            <button class="result-btn secondary" onclick="hideResultGlobal()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="23 4 23 10 17 10"/>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                ${window.I18N.t('result.try.again')}
            </button>
        `;
        
        elements.resultSection.style.display = 'block';
        elements.resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    let countdownInterval;
    
    function startLiveCountdown(unlockTime) {
        if (countdownInterval) clearInterval(countdownInterval);
        
        countdownInterval = setInterval(() => {
            const remaining = CryptoUtils.getTimeRemaining(unlockTime);
            const elem = document.getElementById('liveCountdown');
            
            if (remaining && elem) {
                elem.textContent = remaining;
            } else {
                clearInterval(countdownInterval);
                if (elem) {
                    elem.textContent = window.I18N.t('countdown.ready');
                    elem.style.color = '#22c55e';
                }
            }
        }, 1000);
    }

    // ============================================
    // Result Display
    // ============================================
    
    function showResult(type, title, message) {
        elements.resultCard.className = `result-card ${type}`;
        
        const icons = {
            success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>`,
            error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>`,
            pending: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
            </svg>`,
            info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>`
        };
        
        elements.resultIcon.innerHTML = icons[type] || icons.info;
        elements.resultTitle.textContent = title;
        elements.resultMessage.textContent = message;
        elements.resultContent.innerHTML = '';
        elements.resultActions.innerHTML = '';
        
        elements.resultSection.style.display = 'block';
        elements.resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function hideResult() {
        elements.resultSection.style.display = 'none';
        if (countdownInterval) clearInterval(countdownInterval);
    }

    // ============================================
    // Loading
    // ============================================
    
    function showLoading(text) {
        elements.loadingText.textContent = text;
        elements.loadingOverlay.style.display = 'flex';
    }

    function hideLoading() {
        elements.loadingOverlay.style.display = 'none';
    }

    // ============================================
    // Utilities
    // ============================================
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============================================
    // Global Functions (for onclick handlers)
    // ============================================
    
    window.copyDecryptedText = function() {
        if (window.decryptedTextContent) {
            navigator.clipboard.writeText(window.decryptedTextContent).then(() => {
                // Show brief feedback
                const btn = document.querySelector('.result-btn.primary');
                if (btn) {
                    const originalText = btn.innerHTML;
                    btn.innerHTML = `
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        ${window.I18N.t('result.copied')}
                    `;
                    setTimeout(() => { btn.innerHTML = originalText; }, 2000);
                }
            });
        }
    };

    window.clearVaultFileGlobal = function() {
        clearVaultFile();
        hideResult();
    };

    window.hideResultGlobal = function() {
        hideResult();
    };
    
    window.resetEncryptForm = function() {
        hideResult();
        // Scroll back to top of form
        elements.encryptPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // ============================================
    // Start Application
    // ============================================
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();