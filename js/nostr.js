/**
 * Nostr Core Module
 * Handles keys, relays, and event publishing/subscribing
 */

const NostrRelays = [
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://relay.nostr.band',
  'wss://purplepag.es',
  'wss://nostr.wellorder.net'
];

const Nostr = {
  keys: null,
  relays: {},
  subscriptions: {},
  connectionStatus: 'disconnected',
  listeners: {},
  relayHealth: {},
  writableRelays: new Set(),

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
          this.relayHealth[url] = {
            connected: true,
            lastMessage: Date.now(),
            messagesReceived: 0,
            messagesSent: 0,
            errors: 0,
            okReceived: 0,
            okRejected: 0,
            reconnects: (this.relayHealth[url]?.reconnects || 0)
          };
          this.emit('relay:connected', url);
          resolve(true);
        };
        
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (this.relayHealth[url]) {
              this.relayHealth[url].lastMessage = Date.now();
              this.relayHealth[url].messagesReceived++;
            }
            this.handleMessage(msg, url);
          } catch (e) {
            console.warn('Nostr: Failed to parse message from', url, e);
          }
        };
        
        ws.onerror = (error) => {
          console.warn('Nostr: Relay error', url, error);
          if (this.relayHealth[url]) {
            this.relayHealth[url].errors++;
          }
          this.emit('relay:error', { url, error });
        };
        
        ws.onclose = () => {
          console.log('Nostr: Disconnected from', url);
          this.relays[url] = null;
          this.writableRelays.delete(url);
          if (this.relayHealth[url]) {
            this.relayHealth[url].connected = false;
            this.relayHealth[url].reconnects++;
          }
          this.emit('relay:disconnected', url);
          setTimeout(() => this.connectToRelay(url), 5000);
        };
        
        setTimeout(() => {
          if (ws.readyState !== 1) {
            console.warn('Nostr: Connection timeout to', url);
            resolve(false);
          }
        }, 3000);
        
      } catch (e) {
        console.error('Nostr: Failed to connect to', url, e);
        resolve(false);
      }
    });
  },

  handleMessage(msg, relayUrl) {
    try {
      if (!msg || !Array.isArray(msg)) {
        return;
      }
      
      const [type, ...rest] = msg;
      
      if (type === 'EVENT') {
        const subId = rest[0];
        const data = rest[1];
        const subscription = this.subscriptions[subId];
        if (subscription) {
          subscription.callback(data);
        }
      } else if (type === 'EOSE') {
        const subId = rest[0];
        const subscription = this.subscriptions[subId];
        if (subscription) {
          subscription.eose = true;
          if (subscription.onEose) {
            subscription.onEose();
          }
          if (subscription.eoseTimer) {
            clearTimeout(subscription.eoseTimer);
            subscription.eoseTimer = null;
          }
        }
      } else if (type === 'OK') {
        const eventId = rest[0];
        const success = rest[1];
        const reason = rest[2] || '';
        
        if (success) {
          // Mark relay as writable
          if (relayUrl) {
            this.writableRelays.add(relayUrl);
          }
          if (this.relayHealth[relayUrl]) {
            this.relayHealth[relayUrl].okReceived++;
          }
        } else {
          console.warn('Nostr: Event rejected by', relayUrl, ':', eventId?.slice(0, 16), reason);
          if (this.relayHealth[relayUrl]) {
            this.relayHealth[relayUrl].okRejected++;
          }
        }
        
        // Resolve publish promise if tracked
        if (this._publishResolves && this._publishResolves[eventId]) {
          const resolvers = this._publishResolves[eventId];
          if (success) {
            resolvers.accepted.push(relayUrl);
            if (resolvers.resolve) {
              resolvers.resolve(resolvers.accepted);
              resolvers.resolve = null;
            }
          } else {
            resolvers.rejected.push({ relay: relayUrl, reason });
            // If all relays responded and none accepted, reject
            const totalResponded = resolvers.accepted.length + resolvers.rejected.length;
            if (totalResponded >= resolvers.totalRelays && resolvers.accepted.length === 0) {
              if (resolvers.resolve) {
                resolvers.resolve([]); // return empty array = no relay accepted
                resolvers.resolve = null;
              }
            }
          }
        }
      } else if (type === 'NOTICE') {
        console.log('Nostr: NOTICE from', relayUrl, ':', rest);
      }
    } catch (error) {
      console.error('Nostr: Message handling error', error);
    }
  },

  subscribe(subId, filters, callback, onEose = null) {
    try {
      console.log('Nostr: Creating subscription', subId, 'with filters', JSON.stringify(filters));
      this.subscriptions[subId] = { filters, callback, onEose, eose: false };
      
      const filtersArray = Array.isArray(filters) ? filters : [filters];
      const msg = ['REQ', subId, ...filtersArray];
      
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
      const signedEvent = window.NostrTools.finalizeEvent(event, this.keys.privateKey);
      event.sig = signedEvent.sig;
      
      // Track OK responses
      if (!this._publishResolves) this._publishResolves = {};
      const connectedRelays = Object.keys(this.relays).filter(url => this.relays[url]?.readyState === 1);
      
      const accepted = await new Promise((resolve) => {
        this._publishResolves[event.id] = {
          resolve,
          accepted: [],
          rejected: [],
          totalRelays: connectedRelays.length
        };
        
        const msg = ['EVENT', event];
        this.send(msg);
        
        // Timeout: resolve after 5s if at least one relay accepted, or all rejected
        setTimeout(() => {
          const resolvers = this._publishResolves[event.id];
          if (resolvers && resolvers.resolve) {
            resolve(resolvers.accepted);
            resolvers.resolve = null;
          }
        }, 5000);
      });
      
      if (accepted.length === 0) {
        console.warn('Nostr: Event', event.id.slice(0, 16), 'NOT accepted by any relay');
      } else {
        console.log('Nostr: Published event', event.id.slice(0, 16), 'accepted by', accepted.length, 'relay(s):', accepted.map(r => r.replace('wss://', '')).join(', '));
      }
      
      // Cleanup tracking
      delete this._publishResolves[event.id];
      
      return { event, accepted };
    } catch (error) {
      console.error('Nostr: Publish error', error);
      throw error;
    }
  },

  send(msg) {
    try {
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
          try {
            ws.send(data);
            if (this.relayHealth[url]) {
              this.relayHealth[url].messagesSent++;
            }
          } catch (error) {
            console.error('Nostr: Error sending to relay', url, error);
          }
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
      writable: this.writableRelays.size,
      total: NostrRelays.length,
      pubkey: this.keys?.publicKey,
      subscriptions,
      relayHealth: { ...this.relayHealth }
    };
  },

  async addCustomRelay(url) {
    if (!url || !url.startsWith('wss://')) {
      throw new Error('Invalid relay URL. Must start with wss://');
    }
    if (this.relays[url]) {
      throw new Error('Relay already connected');
    }
    await this.connectToRelay(url);
    return this.relays[url]?.readyState === 1;
  },

  removeRelay(url) {
    const ws = this.relays[url];
    if (ws) {
      ws.close();
      delete this.relays[url];
      delete this.relayHealth[url];
      this.writableRelays.delete(url);
    }
  },

  getAllRelays() {
    return Object.keys(this.relays).map(url => ({
      url,
      connected: this.relays[url]?.readyState === 1,
      writable: this.writableRelays.has(url),
      health: this.relayHealth[url] || null
    }));
  }
};

if (typeof window !== 'undefined') window.Nostr = Nostr;

export { Nostr };
