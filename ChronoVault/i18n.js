/**
 * i18n.js - Internationalization loader for ChronoVault
 *
 * Language source priority:
 * 1. URL parameter (?lang=de|fr|es)
 * 2. localStorage
 * 3. Browser language
 * 4. Fallback to English (en)
 */

(function() {
    'use strict';

    const I18N = {
        currentLang: 'en',
        translations: {},
        supportedLanguages: ['en', 'de', 'fr', 'es'],

        /**
         * Get language from URL parameter
         */
        getLangFromURL() {
            const urlParams = new URLSearchParams(window.location.search);
            const lang = urlParams.get('lang');

            // Map 'spanish' to 'es' for convenience
            if (lang === 'spanish') return 'es';
            if (lang === 'german') return 'de';
            if (lang === 'french') return 'fr';
            if (lang === 'english') return 'en';

            return lang && this.supportedLanguages.includes(lang) ? lang : null;
        },

        /**
         * Get language from localStorage
         */
        getLangFromStorage() {
            const lang = localStorage.getItem('chronovault-lang');
            return lang && this.supportedLanguages.includes(lang) ? lang : null;
        },

        /**
         * Get language from browser settings
         */
        getLangFromBrowser() {
            const browserLang = navigator.language || navigator.userLanguage;
            const langCode = browserLang.split('-')[0]; // Extract 'de' from 'de-DE'
            return this.supportedLanguages.includes(langCode) ? langCode : null;
        },

        /**
         * Determine which language to use based on priority
         */
        detectLanguage() {
            return this.getLangFromURL() ||
                   this.getLangFromStorage() ||
                   this.getLangFromBrowser() ||
                   'en';
        },

        /**
         * Load JSON file
         */
        async loadJSON(path) {
            try {
                const response = await fetch(path);
                if (!response.ok) {
                    throw new Error(`Failed to load ${path}`);
                }
                return await response.json();
            } catch (error) {
                console.warn(`Could not load ${path}:`, error.message);
                return {};
            }
        },

        /**
         * Load translations for the detected language
         */
        async loadTranslations() {
            this.currentLang = this.detectLanguage();

            // Always load English first as base
            const englishTranslations = await this.loadJSON('./common.json');

            // If language is not English, load and merge the specific language
            if (this.currentLang !== 'en') {
                const langTranslations = await this.loadJSON(`./${this.currentLang}/common.json`);
                // Merge: language-specific translations override English
                this.translations = { ...englishTranslations, ...langTranslations };
            } else {
                this.translations = englishTranslations;
            }

            // Save to localStorage for next visit
            localStorage.setItem('chronovault-lang', this.currentLang);
        },

        /**
         * Get translation for a key
         */
        t(key) {
            return this.translations[key] || key;
        },

        /**
         * Apply translations to the DOM
         */
        applyTranslations() {
            // Translate text content
            document.querySelectorAll('[data-i18n]').forEach(element => {
                const key = element.getAttribute('data-i18n');
                const translation = this.t(key);

                if (translation && translation !== key) {
                    element.textContent = translation;
                }
            });

            // Translate placeholders
            document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
                const key = element.getAttribute('data-i18n-placeholder');
                const translation = this.t(key);

                if (translation && translation !== key) {
                    element.placeholder = translation;
                }
            });

            // Update HTML lang attribute
            document.documentElement.lang = this.currentLang;
        },

        /**
         * Initialize i18n system
         */
        async init() {
            await this.loadTranslations();
            this.applyTranslations();
            this.initLanguageSelector();

            console.log(`ChronoVault i18n initialized - Language: ${this.currentLang}`);
        },

        /**
         * Initialize language selector dropdown
         */
        initLanguageSelector() {
            const selector = document.getElementById('languageSelector');
            if (!selector) return;

            // Set current language in dropdown
            selector.value = this.currentLang;

            // Add change event listener
            selector.addEventListener('change', async (e) => {
                const newLang = e.target.value;
                await this.changeLanguage(newLang);

                // Update URL with new language parameter
                const url = new URL(window.location);
                url.searchParams.set('lang', newLang);
                window.history.pushState({}, '', url);
            });
        },

        /**
         * Change language dynamically
         */
        async changeLanguage(lang) {
            if (!this.supportedLanguages.includes(lang)) {
                console.warn(`Language '${lang}' is not supported`);
                return;
            }

            this.currentLang = lang;
            localStorage.setItem('chronovault-lang', lang);

            // Reload translations
            const englishTranslations = await this.loadJSON('./common.json');
            if (lang !== 'en') {
                const langTranslations = await this.loadJSON(`./${lang}/common.json`);
                this.translations = { ...englishTranslations, ...langTranslations };
            } else {
                this.translations = englishTranslations;
            }

            this.applyTranslations();

            // Update dropdown if it exists
            const selector = document.getElementById('languageSelector');
            if (selector) {
                selector.value = lang;
            }
        }
    };

    // Make I18N globally accessible
    window.I18N = I18N;

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => I18N.init());
    } else {
        I18N.init();
    }
})();
