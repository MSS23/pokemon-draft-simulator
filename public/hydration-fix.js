/**
 * Pre-React hydration fix for browser extensions
 * This script runs before React loads to prevent hydration mismatches
 * caused by browser extensions modifying the DOM
 */

(function() {
  'use strict';
  
  // List of problematic browser extension attributes
  const EXTENSION_ATTRIBUTES = [
    'jf-ext-cache-id',
    'data-1p-ignore',
    'data-lpignore',
    'data-form-type',
    'data-ms-editor',
    'autocomplete-data',
    'data-kwimpalastatus',
    'data-lastpass-icon-added',
    'data-dashlane-rid',
    'data-bitwarden-watching'
  ];

  // Override console.error to suppress ONLY extension-related hydration warnings
  if (typeof console !== 'undefined' && console.error) {
    const originalError = console.error;
    console.error = function(...args) {
      const message = args[0]?.toString() || '';

      // ONLY suppress hydration errors explicitly caused by extension attributes
      // This allows us to see real hydration errors that need to be fixed
      if (EXTENSION_ATTRIBUTES.some(attr => message.includes(attr))) {
        return; // Suppress extension-specific errors only
      }

      // Allow ALL other errors through (including hydration errors we need to debug)
      originalError.apply(console, args);
    };
  }

  // Function to clean extension attributes
  function cleanExtensionAttributes() {
    EXTENSION_ATTRIBUTES.forEach(attr => {
      const elements = document.querySelectorAll(`[${attr}]`);
      elements.forEach(el => {
        el.removeAttribute(attr);
      });
    });
  }

  // Set up MutationObserver to watch for extension modifications
  function setupMutationObserver() {
    if (typeof MutationObserver === 'undefined') return;

    const observer = new MutationObserver(function(mutations) {
      let needsCleanup = false;
      
      mutations.forEach(function(mutation) {
        if (mutation.type === 'attributes') {
          const attrName = mutation.attributeName;
          if (EXTENSION_ATTRIBUTES.includes(attrName)) {
            mutation.target.removeAttribute(attrName);
            needsCleanup = true;
          }
        }
      });
      
      if (needsCleanup) {
        cleanExtensionAttributes();
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      subtree: true,
      attributeFilter: EXTENSION_ATTRIBUTES
    });

    return observer;
  }

  // Clean immediately when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      cleanExtensionAttributes();
      setupMutationObserver();
    });
  } else {
    cleanExtensionAttributes();
    setupMutationObserver();
  }

  // Aggressive cleanup on interval
  setInterval(cleanExtensionAttributes, 100);

  // Cleanup on window load as well
  if (typeof window !== 'undefined') {
    window.addEventListener('load', cleanExtensionAttributes);
  }

})();
