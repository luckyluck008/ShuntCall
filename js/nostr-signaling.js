/**
 * Nostr Signaling Module
 * WebRTC signaling via Nostr events with heartbeat and signature verification
 */

const EVENT_KIND = 33333;
const HEARTBEAT_INTERVAL = 15000;
const PEER_TIMEOUT = 45000;

const NostrSignaling = {
  roomTag: null,
  nostr: null,
  listeners: {},
  sentEvents: new Map(),
  sentEventsMax: 1000,
  pendingOffers: new Map(),
  knownPeers: {},
  heartbeatInterval: null,
  peerTimeoutInterval: null,

  async init(roomId, password) {
    console.log('NostrSignaling: Initializing with roomId:', roomId);
    try {
      this.roomTag = await this.computeRoomTag(roomId, password);
      console.log('NostrSignaling: Room tag:', this.roomTag);
      
      this.nostr = Nostr;
      await this.nostr.init();
      
      this.setupSubscriptions();
      this.startHeartbeat();
      this.startPeerTimeoutCheck();
      
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
       const since = Math.floor(Date.now() / 1000) - 60;
       
       const filters = [
         {
           kinds: [EVENT_KIND],
           '#t': [this.roomTag],
           since: since
         }
       ];

       const shortRoomTag = this.roomTag.slice(0, 16);
       console.log('NostrSignaling: Subscribing with filters', JSON.stringify(filters));
       
       this.nostr.subscribe('room-' + shortRoomTag, filters, (event) => {
         this.handleIncomingEvent(event);
       }, () => {
         console.log('NostrSignaling: EOSE received');
       });
    } catch (error) {
      console.error('NostrSignaling: Subscription setup error', error);
      throw error;
    }
  },

  /**
   * Verify a Nostr event signature
   * @param {object} event - Nostr event object
   * @returns {boolean} - True if signature is valid
   */
  verifyEventSignature(event) {
    try {
      if (!event || !event.id || !event.sig || !event.pubkey) {
        console.warn('NostrSignaling: Event missing required fields for verification');
        return false;
      }
      
      // Recompute the event hash and compare
      const eventData = [
        0,
        event.pubkey,
        event.created_at,
        event.kind,
        event.tags,
        event.content
      ];
      
      if (window.NostrTools && window.NostrTools.verifyEvent) {
        return window.NostrTools.verifyEvent(event);
      }
      
      // Fallback: verify hash consistency
      if (window.NostrTools && window.NostrTools.getEventHash) {
        const computedId = window.NostrTools.getEventHash({
          pubkey: event.pubkey,
          created_at: event.created_at,
          kind: event.kind,
          tags: event.tags,
          content: event.content
        });
        return computedId === event.id;
      }
      
      // If no verification tools available, REJECT for security
      console.error('NostrSignaling: No verification tools available, REJECTING event');
      return false;
    } catch (error) {
      console.error('NostrSignaling: Signature verification error', error);
      return false;
    }
  },

  handleIncomingEvent(event) {
    try {
      if (!event || !event.content) {
        console.warn('NostrSignaling: Invalid event - missing content');
        return;
      }
      
      if (event.pubkey === this.nostr.keys.publicKey) {
        return;
      }
      
      // Verify event signature
      if (!this.verifyEventSignature(event)) {
        console.warn('NostrSignaling: Event signature verification FAILED from', event.pubkey?.slice(0, 16));
        return;
      }
      
      const eventId = event.id;
      if (this.sentEvents.has(eventId)) {
        return;
      }
      
      // LRU: evict oldest if at capacity
      if (this.sentEvents.size >= this.sentEventsMax) {
        const oldestKey = this.sentEvents.keys().next().value;
        this.sentEvents.delete(oldestKey);
      }
      this.sentEvents.set(eventId, Date.now());

       const data = JSON.parse(event.content);

       // Update peer last-seen timestamp for all valid events
       this.updatePeerSeen(event.pubkey);

         if (data.type === 'presence') {
         this.emit('presence', {
           from: event.pubkey,
           eventId: eventId
         });
      } else if (data.type === 'heartbeat') {
        // Heartbeat received - peer is alive, already updated via updatePeerSeen
      } else if (data.type === 'offer' && data.sdp) {
        this.emit('offer', {
          from: event.pubkey,
          sdp: data.sdp,
          eventId: eventId
        });
      } else if (data.type === 'answer' && data.sdp) {
        this.emit('answer', {
          from: event.pubkey,
          sdp: data.sdp,
          eventId: eventId
        });
      } else if (data.type === 'ice' && data.candidate) {
        this.emit('iceCandidate', {
          from: event.pubkey,
          candidate: data.candidate,
          eventId: eventId
        });
      } else if (data.type === 'leave') {
        this.emit('peerLeft', {
          from: event.pubkey
        });
        delete this.knownPeers[event.pubkey];
      } else if (data.type === 'nickname') {
        this.emit('nickname', {
          from: event.pubkey,
          nickname: data.nickname
        });
      } else {
        console.log('NostrSignaling: Unknown event type', data.type);
      }
    } catch (e) {
      console.warn('NostrSignaling: Failed to parse event content', e);
    }
  },

  /**
   * Update the last-seen timestamp for a peer
   */
  updatePeerSeen(pubkey) {
    const wasKnown = !!this.knownPeers[pubkey];
    this.knownPeers[pubkey] = { lastSeen: Date.now() };
    if (!wasKnown) {
      this.emit('peerDiscovered', { pubkey });
    }
  },

  /**
   * Start sending periodic heartbeats
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(async () => {
      await this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL);
  },

  /**
   * Send a heartbeat event
   */
  async sendHeartbeat() {
    try {
      const payload = {
        type: 'heartbeat',
        from: this.nostr.keys.publicKey,
        timestamp: Date.now()
      };

      const tags = [
        ['t', this.roomTag]
      ];

      await this.nostr.publish(EVENT_KIND, tags, JSON.stringify(payload));
    } catch (error) {
      console.error('NostrSignaling: Heartbeat error', error);
    }
  },

  /**
   * Start checking for timed-out peers
   */
  startPeerTimeoutCheck() {
    this.peerTimeoutInterval = setInterval(() => {
      this.checkPeerTimeouts();
    }, HEARTBEAT_INTERVAL);
  },

  /**
   * Check for peers that haven't sent heartbeat within timeout
   */
  checkPeerTimeouts() {
    const now = Date.now();
    Object.entries(this.knownPeers).forEach(([pubkey, data]) => {
      if (now - data.lastSeen > PEER_TIMEOUT) {
        console.log('NostrSignaling: Peer timed out:', pubkey.slice(0, 16));
        delete this.knownPeers[pubkey];
        this.emit('peerTimedOut', { pubkey });
      }
    });
  },

  /**
   * Broadcast leave message when disconnecting
   */
  async broadcastLeave() {
    try {
      const payload = {
        type: 'leave',
        from: this.nostr.keys.publicKey
      };
      const tags = [['t', this.roomTag]];
      await this.nostr.publish(EVENT_KIND, tags, JSON.stringify(payload));
    } catch (error) {
      console.error('NostrSignaling: Leave broadcast error', error);
    }
  },

  /**
   * Set and broadcast a nickname
   */
  async setNickname(nickname) {
    try {
      const payload = {
        type: 'nickname',
        nickname: nickname.slice(0, 32),
        from: this.nostr.keys.publicKey
      };
      const tags = [['t', this.roomTag]];
      await this.nostr.publish(EVENT_KIND, tags, JSON.stringify(payload));
    } catch (error) {
      console.error('NostrSignaling: Nickname broadcast error', error);
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

   async broadcastPresence() {
    try {
      console.log('NostrSignaling: Broadcasting presence to room');
      const payload = {
        type: 'presence',
        from: this.nostr.keys.publicKey
      };

      const tags = [
        ['t', this.roomTag]
      ];

      const event = await this.nostr.publish(EVENT_KIND, tags, JSON.stringify(payload));
      console.log('NostrSignaling: Presence broadcast sent - event:', event.id.slice(0, 16));
    } catch (error) {
      console.error('NostrSignaling: Broadcast presence error', error);
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

  /**
   * Get list of known active peers
   */
  getKnownPeers() {
    return { ...this.knownPeers };
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
      nostrStatus: this.nostr?.getStatus(),
      knownPeers: Object.keys(this.knownPeers).length
    };
  },

  destroy() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.peerTimeoutInterval) clearInterval(this.peerTimeoutInterval);
    if (this.nostr) {
      const shortRoomTag = this.roomTag?.slice(0, 16);
      if (shortRoomTag) {
        this.nostr.unsubscribe('room-' + shortRoomTag);
      }
    }
    this.nostr = null;
    this.listeners = {};
    this.knownPeers = {};
  }
};

if (typeof window !== 'undefined') window.NostrSignaling = NostrSignaling;

export { NostrSignaling };
