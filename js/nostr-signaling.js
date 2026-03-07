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
    console.log('NostrSignaling: Initializing with roomId:', roomId);
    try {
      this.roomTag = await this.computeRoomTag(roomId, password);
      console.log('NostrSignaling: Room tag:', this.roomTag);
      
      this.nostr = Nostr;
      await this.nostr.init();
      
      this.setupSubscriptions();
      
      console.log('NostrSignaling: Ready');
      return this;
    } catch (error) {
      console.error('NostrSignaling: Initialization error', error);
      throw error;
    }
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
    try {
      // Get events from the last 60 seconds to catch offers published before we subscribed
      const since = Math.floor(Date.now() / 1000) - 60;
      
      const filters = [
        {
          kinds: [EVENT_KIND],
          '#t': [this.roomTag],
          since: since
        }
      ];

      console.log('NostrSignaling: Subscribing with filters', JSON.stringify(filters));
      
      this.nostr.subscribe('room-' + this.roomTag, filters, (event) => {
        console.log('NostrSignaling: Received event from', event.pubkey?.slice(0, 16), 'content type:', event.content ? JSON.parse(event.content).type : 'none');
        this.handleIncomingEvent(event);
      }, () => {
        console.log('NostrSignaling: EOSE received');
      });
    } catch (error) {
      console.error('NostrSignaling: Subscription setup error', error);
      throw error;
    }
  },

  handleIncomingEvent(event) {
    try {
      if (!event || !event.content) {
        console.warn('NostrSignaling: Invalid event - missing content');
        return;
      }
      
      if (event.pubkey === this.nostr.keys.publicKey) {
        console.log('NostrSignaling: Ignoring own event');
        return;
      }
      
      const eventId = event.id;
      if (this.sentEvents.has(eventId)) {
        console.log('NostrSignaling: Ignoring already processed event');
        return;
      }
      
      this.sentEvents.add(eventId);

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
      } else if (data.type === 'ice' && data.candidate) {
        console.log('NostrSignaling: Received ICE candidate from', event.pubkey.slice(0, 16) + '...');
        this.emit('iceCandidate', {
          from: event.pubkey,
          candidate: data.candidate,
          eventId: eventId
        });
      } else {
        console.log('NostrSignaling: Unknown event type', data.type);
      }
    } catch (e) {
      console.warn('NostrSignaling: Failed to parse event content', e);
    }
  },

  async sendOffer(targetPubkey, offer) {
    try {
      console.log('NostrSignaling: Sending offer to', targetPubkey?.slice(0, 16));
      const payload = {
        type: 'offer',
        sdp: offer.sdp,
        from: this.nostr.keys.publicKey
      };

      const tags = [
        ['t', this.roomTag],
        ['p', targetPubkey]
      ];

      const event = await this.nostr.publish(EVENT_KIND, tags, JSON.stringify(payload));
      console.log('NostrSignaling: Sent offer - event:', event.id.slice(0, 16));
    } catch (error) {
      console.error('NostrSignaling: Send offer error', error);
      throw error;
    }
  },

  async sendAnswer(targetPubkey, answer, offerEventId) {
    try {
      console.log('NostrSignaling: Sending answer to', targetPubkey?.slice(0, 16));
      const payload = {
        type: 'answer',
        sdp: answer.sdp,
        from: this.nostr.keys.publicKey,
        replyTo: offerEventId
      };

      const tags = [
        ['t', this.roomTag],
        ['p', targetPubkey],
        ['e', offerEventId]
      ];

      const event = await this.nostr.publish(EVENT_KIND, tags, JSON.stringify(payload));
      console.log('NostrSignaling: Sent answer - event:', event.id.slice(0, 16));
    } catch (error) {
      console.error('NostrSignaling: Send answer error', error);
      throw error;
    }
  },

   async broadcastOffer(sdp) {
    try {
      console.log('NostrSignaling: Broadcasting offer to room');
      const payload = {
        type: 'offer',
        sdp: sdp,
        from: this.nostr.keys.publicKey
      };

      const tags = [
        ['t', this.roomTag]
      ];

      const event = await this.nostr.publish(EVENT_KIND, tags, JSON.stringify(payload));
      console.log('NostrSignaling: Broadcast offer sent - event:', event.id.slice(0, 16));
    } catch (error) {
      console.error('NostrSignaling: Broadcast offer error', error);
      throw error;
    }
  },

  async sendIceCandidate(targetPubkey, candidate) {
    try {
      console.log('NostrSignaling: Sending ICE candidate to', targetPubkey?.slice(0, 16));
      const payload = {
        type: 'ice',
        candidate: candidate,
        from: this.nostr.keys.publicKey
      };

      const tags = [
        ['t', this.roomTag],
        ['p', targetPubkey]
      ];

      const event = await this.nostr.publish(EVENT_KIND, tags, JSON.stringify(payload));
      console.log('NostrSignaling: Sent ICE candidate - event:', event.id.slice(0, 16));
    } catch (error) {
      console.error('NostrSignaling: Send ICE candidate error', error);
      throw error;
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
