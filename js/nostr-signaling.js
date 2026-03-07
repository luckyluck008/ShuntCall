/**
 * Nostr Signaling Module
 * WebRTC signaling via Nostr events
 */

const EVENT_KIND = 33333;

const NostrSignaling = {
  roomTag: null,
  nostr: null,
  listeners: {},
  sentEvents: new Set(),
  pendingOffers: new Map(),

  async init(roomId, password) {
    this.roomTag = await this.computeRoomTag(roomId, password);
    console.log('NostrSignaling: Room tag:', this.roomTag);
    
    this.nostr = Nostr;
    await this.nostr.init();
    
    this.setupSubscriptions();
    
    console.log('NostrSignaling: Ready');
    return this;
  },

  async computeRoomTag(roomId, password) {
    const input = roomId + ':' + password;
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  setupSubscriptions() {
    const filters = {
      kinds: [EVENT_KIND],
      '#t': [this.roomTag]
    };

    this.nostr.subscribe('room-' + this.roomTag, filters, (event) => {
      this.handleIncomingEvent(event);
    });
  },

  handleIncomingEvent(event) {
    if (!event || !event.content) return;
    if (event.pubkey === this.nostr.keys.publicKey) return;
    
    const eventId = event.id;
    if (this.sentEvents.has(eventId)) return;
    this.sentEvents.add(eventId);

    try {
      const data = JSON.parse(event.content);
      
      if (data.type === 'offer' && data.sdp) {
        console.log('NostrSignaling: Received offer from', event.pubkey.slice(0, 16) + '...');
        this.emit('offer', {
          from: event.pubkey,
          sdp: data.sdp,
          eventId: eventId
        });
      } else if (data.type === 'answer' && data.sdp) {
        console.log('NostrSignaling: Received answer from', event.pubkey.slice(0, 16) + '...');
        this.emit('answer', {
          from: event.pubkey,
          sdp: data.sdp,
          eventId: eventId
        });
      }
    } catch (e) {
      console.warn('NostrSignaling: Failed to parse event content', e);
    }
  },

  async sendOffer(targetPubkey, sdp) {
    const payload = {
      type: 'offer',
      sdp: sdp,
      from: this.nostr.keys.publicKey
    };

    const tags = [
      ['t', this.roomTag],
      ['p', targetPubkey]
    ];

    await this.nostr.publish(EVENT_KIND, tags, JSON.stringify(payload));
    console.log('NostrSignaling: Sent offer');
  },

  async sendAnswer(targetPubkey, sdp, offerEventId) {
    const payload = {
      type: 'answer',
      sdp: sdp,
      from: this.nostr.keys.publicKey,
      replyTo: offerEventId
    };

    const tags = [
      ['t', this.roomTag],
      ['p', targetPubkey],
      ['e', offerEventId]
    ];

    await this.nostr.publish(EVENT_KIND, tags, JSON.stringify(payload));
    console.log('NostrSignaling: Sent answer');
  },

  async broadcastOffer(sdp) {
    const payload = {
      type: 'offer',
      sdp: sdp,
      from: this.nostr.keys.publicKey
    };

    const tags = [
      ['t', this.roomTag]
    ];

    await this.nostr.publish(EVENT_KIND, tags, JSON.stringify(payload));
    console.log('NostrSignaling: Broadcast offer to room');
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
    return {
      roomTag: this.roomTag,
      pubkey: this.nostr?.keys?.publicKey,
      nostrStatus: this.nostr?.getStatus()
    };
  },

  destroy() {
    this.nostr = null;
    this.listeners = {};
  }
};

if (typeof window !== 'undefined') window.NostrSignaling = NostrSignaling;
if (typeof module !== 'undefined') module.exports = NostrSignaling;

console.log('NostrSignaling module loaded');
