/**
 * Nostr Core Module
 * Handles keys, relays, and event publishing/subscribing
 */

const NostrRelays = [
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://brb.io',
  'wss://njump.me'
];

const Nostr = {
  keys: null,
  relays: {},
  subscriptions: {},
  connectionStatus: 'disconnected',
  listeners: {},

  async init() {
    console.log('Nostr: Initializing');
    try {
      this.keys = this.generateKeys();
      console.log('Nostr: Keys generated', this.keys.publicKey.slice(0, 16) + '...');
      
      const connected = await this.connectToRelays();
      if (!connected) {
        console.error('Nostr: No relays connected');
        throw new Error('Failed to connect to any Nostr relay');
      }
      
      return this.keys;
    } catch (error) {
      console.error('Nostr: Initialization error', error);
      throw error;
    }
  },

  generateKeys() {
    try {
      const privateKey = window.NostrTools.generateSecretKey();
      const publicKey = window.NostrTools.getPublicKey(privateKey);
      console.log('Nostr: Generated keys - pubkey:', publicKey.slice(0, 16));
      return { privateKey, publicKey };
    } catch (error) {
      console.error('Nostr: Error generating keys', error);
      throw error;
    }
  },

  bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  },

  async sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return this.bytesToHex(new Uint8Array(hashBuffer));
  },

  async connectToRelays() {
    try {
      const connectPromises = NostrRelays.map(relayUrl => this.connectToRelay(relayUrl));
      const results = await Promise.all(connectPromises);
      
      const connectedCount = results.filter(Boolean).length;
      const readyCount = Object.keys(this.relays).filter(url => this.relays[url]?.readyState === 1).length;
      
      console.log(`Nostr: Connection attempts - success: ${connectedCount}/${NostrRelays.length}`);
      console.log(`Nostr: Ready state - open: ${readyCount}/${NostrRelays.length}`);
      
      return readyCount > 0;
    } catch (error) {
      console.error('Nostr: Relay connection error', error);
      return false;
    }
  },

  async connectToRelay(url) {
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(url);
        
        ws.onopen = () => {
          console.log('Nostr: Connected to', url);
          this.relays[url] = ws;
          this.emit('relay:connected', url);
          resolve(true);
        };
        
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            console.log('Nostr: Received from', url, msg);
            this.handleMessage(msg);
          } catch (e) {
            console.warn('Nostr: Failed to parse message from', url, e);
          }
        };
        
        ws.onerror = (error) => {
          console.warn('Nostr: Relay error', url, error);
          this.emit('relay:error', { url, error });
        };
        
        ws.onclose = () => {
          console.log('Nostr: Disconnected from', url);
          this.relays[url] = null;
          this.emit('relay:disconnected', url);
          setTimeout(() => this.connectToRelay(url), 5000);
        };
        
        setTimeout(() => {
          if (ws.readyState !== 1) {
            console.warn('Nostr: Connection timeout to', url);
            resolve(false);
          }
        }, 5000);
        
      } catch (e) {
        console.error('Nostr: Failed to connect to', url, e);
        resolve(false);
      }
    });
  },

  handleMessage(msg) {
    try {
      if (!msg || !Array.isArray(msg)) {
        console.warn('Nostr: Invalid message format', msg);
        return;
      }
      
      const [type, ...rest] = msg;
      
      if (type === 'EVENT') {
        const subId = rest[0];
        const data = rest[1];
        console.log('Nostr: Got EVENT for sub', subId, 'kind:', data?.kind);
        const subscription = this.subscriptions[subId];
        if (subscription) {
          subscription.callback(data);
        } else {
          console.warn('Nostr: No subscription for subId', subId);
        }
      } else if (type === 'EOSE') {
        const subId = rest[0];
        console.log('Nostr: Got EOSE for sub', subId);
        const subscription = this.subscriptions[subId];
        if (subscription) {
          subscription.eose = true;
          if (subscription.onEose) {
            subscription.onEose();
          }
          // Clear timer
          if (subscription.eoseTimer) {
            clearTimeout(subscription.eoseTimer);
            subscription.eoseTimer = null;
          }
        } else {
          console.warn('Nostr: No subscription for EOSE subId', subId);
        }
      } else if (type === 'OK') {
        const eventId = rest[0];
        const success = rest[1];
        const message = rest[2];
        console.log('Nostr: OK message - event:', eventId?.slice(0, 16), 'success:', success, 'message:', message);
      } else if (type === 'NOTICE') {
        console.log('Nostr: NOTICE:', rest);
      } else {
        console.log('Nostr: Unknown message type:', type, rest);
      }
    } catch (error) {
      console.error('Nostr: Message handling error', error);
    }
  },

  subscribe(subId, filters, callback, onEose = null) {
    try {
      console.log('Nostr: Creating subscription', subId, 'with filters', JSON.stringify(filters));
      this.subscriptions[subId] = { filters, callback, onEose, eose: false };
      
      // Ensure filters is an array for valid Nostr protocol
      const filtersArray = Array.isArray(filters) ? filters : [filters];
      const msg = ['REQ', subId, ...filtersArray];
      console.log('Nostr: Sending subscription request:', msg);
      
      // Add a timer to check if we received EOSE
      const eoseTimer = setTimeout(() => {
        if (!this.subscriptions[subId]?.eose) {
          console.warn('Nostr: No EOSE received for sub', subId, 'within 10 seconds');
        }
      }, 10000);
      
      this.subscriptions[subId].eoseTimer = eoseTimer;
      
      this.send(msg);
      
      return () => this.unsubscribe(subId);
    } catch (error) {
      console.error('Nostr: Subscribe error', error);
      throw error;
    }
  },

  unsubscribe(subId) {
    try {
      if (this.subscriptions[subId]?.eoseTimer) {
        clearTimeout(this.subscriptions[subId].eoseTimer);
      }
      delete this.subscriptions[subId];
      this.send(['CLOSE', subId]);
      console.log('Nostr: Unsubscribed from', subId);
    } catch (error) {
      console.error('Nostr: Unsubscribe error', error);
    }
  },

  async publish(kind, tags, content) {
    try {
      const createdAt = Math.floor(Date.now() / 1000);
      
      const event = {
        kind,
        created_at: createdAt,
        tags,
        content,
        pubkey: this.keys.publicKey
      };
      
      event.id = window.NostrTools.getEventHash(event);
      event.sig = window.NostrTools.finalizeEvent(event, this.keys.privateKey);
      
      const msg = ['EVENT', event];
      this.send(msg);
      
      console.log('Nostr: Published event', event.id.slice(0, 16) + '...');
      
      return event;
    } catch (error) {
      console.error('Nostr: Publish error', error);
      throw error;
    }
  },



  send(msg) {
    try {
      // Handle cyclic references
      const seen = new WeakSet();
      const data = JSON.stringify(msg, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular Reference]';
          }
          seen.add(value);
        }
        return value;
      });
      
      Object.keys(this.relays).forEach(url => {
        const ws = this.relays[url];
        if (ws && ws.readyState === 1) {
          console.log('Nostr: Sending to relay', url, msg[0]);
          try {
            ws.send(data);
          } catch (error) {
            console.error('Nostr: Error sending to relay', url, error);
          }
        } else {
          console.warn('Nostr: Relay not connected or ready', url, ws?.readyState);
        }
      });
    } catch (error) {
      console.error('Nostr: Send error', error);
    }
  },

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  },

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  },

  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => callback(data));
  },

  getStatus() {
    const connected = Object.keys(this.relays).filter(url => this.relays[url]?.readyState === 1).length;
    const subscriptions = Object.keys(this.subscriptions).length;
    return {
      connected,
      total: NostrRelays.length,
      pubkey: this.keys?.publicKey,
      subscriptions
    };
  }
};

if (typeof window !== 'undefined') window.Nostr = Nostr;
if (typeof module !== 'undefined') module.exports = Nostr;

console.log('Nostr module loaded');