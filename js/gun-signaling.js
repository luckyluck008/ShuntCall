/**
 * Gun.js Signaling Module
 * Handles peer discovery and WebRTC signaling via Gun.js
 */

const GUN_PEERS = [
  'https://gun-manhattan.herokuapp.com/gun',
  'https://gun-eu.herokuapp.com/gun'
];

const ShuntCallSignaling = {
  gun: null,
  namespace: null,
  peerId: null,
  listeners: {},
  knownPeers: new Set(),
  announceInterval: null,
  pollInterval: null,

  /**
   * Initialize Gun.js with a namespace
   * @param {string} namespace - The room namespace (SHA-256 hash)
   * @param {string} peerId - Our peer ID
   */
  async init(namespace, peerId) {
    this.namespace = namespace;
    this.peerId = peerId;
    this.knownPeers = new Set();
    
    if (this.gun) {
      this.gun._.opt({ peers: [] });
    }
    
    this.gun = Gun({
      peers: GUN_PEERS,
      localStorage: false,
      radisk: false,
      store: false
    });

    this.room = this.gun.get('shuntcall').get(namespace);
    this.peersNode = this.room.get('peers');
    this.signalingNode = this.room.get('signaling');
    this.announceNode = this.room.get('announce');

    await this.registerPeer();
    this.setupPeerDiscovery();
    this.startAnnounce();
    this.startPolling();
    
    console.log('ShuntCallSignaling initialized with namespace:', namespace.substring(0, 16) + '...');
    return this;
  },

  /**
   * Register ourselves as a peer in the room
   */
  async registerPeer() {
    const peerData = {
      id: this.peerId,
      timestamp: Date.now(),
      joined: true
    };
    
    this.peersNode.get(this.peerId).put(peerData);
    
    this.peersNode.get(this.peerId).get('alive').put(true);
    setInterval(() => {
      this.peersNode.get(this.peerId).get('alive').put(true);
    }, 5000);
  },

  /**
   * Announce our presence to the room
   */
  startAnnounce() {
    this.announceNode.get(this.peerId).put({
      id: this.peerId,
      timestamp: Date.now()
    });
    
    this.announceInterval = setInterval(() => {
      this.announceNode.get(this.peerId).put({
        id: this.peerId,
        timestamp: Date.now()
      });
    }, 3000);
  },

  /**
   * Poll for new peers
   */
  startPolling() {
    this.pollInterval = setInterval(async () => {
      await this.pollPeers();
    }, 2000);
    
    setTimeout(() => this.pollPeers(), 1000);
  },

  /**
   * Poll for peers in the room
   */
  async pollPeers() {
    return new Promise((resolve) => {
      const foundPeers = [];
      
      this.peersNode.map().once((data, peerId) => {
        if (peerId && peerId !== this.peerId && data && data.id) {
          foundPeers.push(data.id);
        }
      });
      
      setTimeout(() => {
        foundPeers.forEach(peerId => {
          if (!this.knownPeers.has(peerId)) {
            this.knownPeers.add(peerId);
            console.log('Discovered peer:', peerId);
            this.emit('peer:join', { id: peerId });
            this.setupPeerSignaling(peerId);
          }
        });
        resolve();
      }, 1500);
    });
  },

  /**
   * Setup peer discovery listener
   */
  setupPeerDiscovery() {
    this.announceNode.map().on((data, peerId) => {
      if (!data || !data.id || peerId === this.peerId) return;
      
      if (!this.knownPeers.has(data.id)) {
        this.knownPeers.add(data.id);
        console.log('Peer announced:', data.id);
        this.emit('peer:join', { id: data.id });
      }
    });
    
    this.peersNode.map().on((data, peerId) => {
      if (!data || !data.id || peerId === this.peerId) return;
      
      if (!this.knownPeers.has(data.id)) {
        this.knownPeers.add(data.id);
        console.log('Peer joined via peers node:', data.id);
        this.emit('peer:join', { id: data.id });
      }
      this.setupPeerSignaling(data.id);
    });
  },

  /**
   * Setup signaling channel for a specific peer
   * @param {string} peerId - Target peer ID
   */
  setupPeerSignaling(peerId) {
    const peerSignaling = this.signalingNode.get(peerId);
    
    peerSignaling.get('offer').on((data) => {
      if (!data || data.from === this.peerId) return;
      
      this.emit('offer', {
        from: data.from,
        sdp: data.sdp,
        timestamp: data.timestamp
      });
      
      setTimeout(() => {
        peerSignaling.get('offer').put(null);
      }, 5000);
    });
    
    peerSignaling.get('answer').on((data) => {
      if (!data || data.from === this.peerId) return;
      
      this.emit('answer', {
        from: data.from,
        sdp: data.sdp,
        timestamp: data.timestamp
      });
      
      setTimeout(() => {
        peerSignaling.get('answer').put(null);
      }, 5000);
    });
    
    peerSignaling.get('ice').on((data) => {
      if (!data || data.from === this.peerId) return;
      
      this.emit('ice', {
        from: data.from,
        candidate: data.candidate,
        timestamp: data.timestamp
      });
      
      setTimeout(() => {
        peerSignaling.get('ice').put(null);
      }, 5000);
    });
  },

  /**
   * Send an offer to a peer
   * @param {string} targetPeerId - Target peer ID
   * @param {RTCSessionDescriptionInit} sdp - The SDP offer
   */
  async sendOffer(targetPeerId, sdp) {
    const offerData = {
      from: this.peerId,
      sdp: JSON.stringify(sdp),
      timestamp: Date.now()
    };
    
    console.log('Sending offer to:', targetPeerId);
    this.signalingNode.get(targetPeerId).get('offer').put(offerData);
  },

  /**
   * Send an answer to a peer
   * @param {string} targetPeerId - Target peer ID
   * @param {RTCSessionDescriptionInit} sdp - The SDP answer
   */
  async sendAnswer(targetPeerId, sdp) {
    const answerData = {
      from: this.peerId,
      sdp: JSON.stringify(sdp),
      timestamp: Date.now()
    };
    
    console.log('Sending answer to:', targetPeerId);
    this.signalingNode.get(targetPeerId).get('answer').put(answerData);
  },

  /**
   * Send ICE candidate to a peer
   * @param {string} targetPeerId - Target peer ID
   * @param {RTCIceCandidateInit} candidate - The ICE candidate
   */
  async sendIceCandidate(targetPeerId, candidate) {
    const iceData = {
      from: this.peerId,
      candidate: JSON.stringify(candidate),
      timestamp: Date.now()
    };
    
    this.signalingNode.get(targetPeerId).get('ice').put(iceData);
  },

  /**
   * Get all peers in the room
   * @returns {Promise<Array<string>>} - List of peer IDs
   */
  async getPeers() {
    return new Promise((resolve) => {
      const peers = [];
      this.peersNode.map().once((data, peerId) => {
        if (peerId && peerId !== this.peerId && data && data.id) {
          peers.push(data.id);
        }
      });
      setTimeout(() => resolve([...this.knownPeers]), 1500);
    });
  },

  /**
   * Remove ourselves from the room
   */
  async leave() {
    if (this.announceInterval) clearInterval(this.announceInterval);
    if (this.pollInterval) clearInterval(this.pollInterval);
    
    if (this.announceNode) {
      this.announceNode.get(this.peerId).put(null);
    }
    if (this.peersNode) {
      this.peersNode.get(this.peerId).put(null);
    }
  },

  /**
   * Event emitter methods
   */
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

  /**
   * Destroy the signaling connection
   */
  destroy() {
    this.leave();
    if (this.gun) {
      this.gun._.opt({ peers: [] });
    }
    this.listeners = {};
  }
};

if (typeof window !== 'undefined') {
  window.ShuntCallSignaling = ShuntCallSignaling;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ShuntCallSignaling;
}

console.log('ShuntCallSignaling module loaded');
