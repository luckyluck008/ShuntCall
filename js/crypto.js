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
  }
};

if (typeof window !== 'undefined') {
  window.ShuntCallCrypto = ShuntCallCrypto;
}

export { ShuntCallCrypto };
console.log('ShuntCallCrypto module loaded');
