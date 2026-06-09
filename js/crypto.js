/**
 * Crypto Module
 * SHA-256 room namespace derivation using Web Crypto API
 */

const ShuntCallCrypto = {
  /**
   * Derive room namespace from roomId and password using SHA-256
   * @param {string} roomId - The room identifier
   * @param {string} password - The room password
   * @returns {Promise<string>} - 64-character hex string
   */
  async deriveNamespace(roomId, password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(roomId + ':' + password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Generate a random room ID
   * @param {number} length - Length of the ID (default: 8)
   * @returns {string} - Random alphanumeric string
   */
  generateRoomId(length = 8) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const randomValues = new Uint32Array(length);
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
      result += chars.charAt(randomValues[i] % chars.length);
    }
    return result;
  },

  /**
   * Generate a random peer ID
   * @returns {string} - 16-character random hex string
   */
  generatePeerId() {
    const randomValues = new Uint8Array(8);
    crypto.getRandomValues(randomValues);
    return Array.from(randomValues).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Validate room ID format
   * @param {string} roomId - Room ID to validate
   * @returns {boolean} - True if valid
   */
  isValidRoomId(roomId) {
    return /^[a-zA-Z0-9_-]+$/.test(roomId) && roomId.length >= 3 && roomId.length <= 32;
  },

  /**
   * Check if the current context is secure (HTTPS or localhost)
   * @returns {boolean} - True if secure context
   */
  isSecureContext() {
    return window.location.protocol === 'https:' ||
           window.location.hostname === 'localhost' ||
           window.location.hostname === '127.0.0.1';
  },

  /**
   * Calculate password strength score, label, color and entropy
   * @param {string} password - The password to evaluate
   * @returns {object} - { score, label, color, entropy }
   */
  calculatePasswordStrength(password) {
    if (!password) return { score: 0, label: '', color: '#333', entropy: 0 };
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (password.length >= 16) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    const charsetSize = (/[a-z]/.test(password) ? 26 : 0) + (/[A-Z]/.test(password) ? 26 : 0) + (/\d/.test(password) ? 10 : 0) + (/[^a-zA-Z0-9]/.test(password) ? 32 : 0);
    const entropy = password.length * Math.log2(charsetSize || 1);
    if (entropy >= 60) score++;
    if (entropy >= 80) score++;
    const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
    const colors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#10b981'];
    const idx = Math.min(Math.floor(score / 1.5), labels.length - 1);
    return { score: Math.min(score, 9), label: labels[idx], color: colors[idx], entropy: Math.round(entropy) };
  }
};

if (typeof window !== 'undefined') {
  window.ShuntCallCrypto = ShuntCallCrypto;
}

export { ShuntCallCrypto };
