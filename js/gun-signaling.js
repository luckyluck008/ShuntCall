/**
 * Gun.js Signaling Module
 * Reliable peer discovery and WebRTC signaling with retries
 */

const GUN_PEERS = [
  'http://localhost:8766/gun',
  'https://gun-manhattan.herokuapp.com/gun',
  'https://gun-eu.herokuapp.com/gun'
];

const ShuntCallSignaling = {
  gun: null,
  namespace: null,
  peerId: null,
  listeners: {},
  connectedPeers: new Map(),
  sentMessages: new Map(),
  
  async init(namespace, peerId) {
    this.namespace = namespace;
    this.peerId = peerId;
    this.connectedPeers = new Map();
    this.sentMessages = new Map();
    
    this.gun = Gun(GUN_PEERS);
    this.room = this.gun.get('shuntcall').get(namespace);
    this.peersNode = this.room.get('peers');
    this.myNode = this.peersNode.get(peerId);
    this.signaling = this.room.get('signaling');
    
    this.myNode.put({ id: peerId, time: Date.now() });
    
    this.pollForPeers();
    this.setupListeners();
    
    setInterval(() => {
      this.myNode.put({ id: this.peerId, time: Date.now() });
    }, 3000);
    
    console.log('Signaling ready:', peerId);
    return this;
  },
  
  pollForPeers() {
    setInterval(() => {
      this.peersNode.map().once((data, id) => {
        if (id && id !== this.peerId && data && data.id) {
          if (!this.connectedPeers.has(data.id)) {
            this.connectedPeers.set(data.id, true);
            console.log('Found peer:', data.id);
            this.emit('peer:join', { id: data.id });
          }
        }
      });
    }, 2000);
  },
  
  setupListeners() {
    const offerNode = this.signaling.get(this.peerId).get('offer');
    offerNode.map().on((data, key) => {
      if (data && data.from && data.sdp && data.time > Date.now() - 10000) {
        if (!this.sentMessages.has(`offer-${data.from}`) || this.sentMessages.get(`offer-${data.from}`) < data.time) {
          console.log('Got offer from:', data.from);
          this.sentMessages.set(`offer-${data.from}`, data.time);
          this.emit('offer', { from: data.from, sdp: data.sdp });
        }
      }
    });
    
    const answerNode = this.signaling.get(this.peerId).get('answer');
    answerNode.map().on((data, key) => {
      if (data && data.from && data.sdp && data.time > Date.now() - 10000) {
        if (!this.sentMessages.has(`answer-${data.from}`) || this.sentMessages.get(`answer-${data.from}`) < data.time) {
          console.log('Got answer from:', data.from);
          this.sentMessages.set(`answer-${data.from}`, data.time);
          this.emit('answer', { from: data.from, sdp: data.sdp });
        }
      }
    });
    
    const iceNode = this.signaling.get(this.peerId).get('ice');
    iceNode.map().on((data, key) => {
      if (data && data.from && data.candidate && data.time > Date.now() - 5000) {
        this.emit('ice', { from: data.from, candidate: data.candidate });
      }
    });
  },
  
  sendOffer(targetId, sdp) {
    console.log('Sending offer to:', targetId);
    const msg = { from: this.peerId, sdp: JSON.stringify(sdp), time: Date.now() };
    
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        this.signaling.get(targetId).get('offer').set(msg);
      }, i * 500);
    }
  },
  
  sendAnswer(targetId, sdp) {
    console.log('Sending answer to:', targetId);
    const msg = { from: this.peerId, sdp: JSON.stringify(sdp), time: Date.now() };
    
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        this.signaling.get(targetId).get('answer').set(msg);
      }, i * 500);
    }
  },
  
  sendIceCandidate(targetId, candidate) {
    const msg = { from: this.peerId, candidate: JSON.stringify(candidate), time: Date.now() };
    
    this.signaling.get(targetId).get('ice').set(msg);
  },
  
  async getPeers() {
    return new Promise((resolve) => {
      const peers = [];
      this.peersNode.map().once((data, id) => {
        if (id && id !== this.peerId && data && data.id) {
          peers.push(data.id);
        }
      });
      setTimeout(() => resolve(peers), 1500);
    });
  },
  
  async leave() {
    this.myNode.put(null);
  },
  
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  },
  
  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  },
  
  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(cb => cb(data));
  },
  
  destroy() {
    this.leave();
    this.listeners = {};
  }
};

if (typeof window !== 'undefined') window.ShuntCallSignaling = ShuntCallSignaling;
if (typeof module !== 'undefined') module.exports = ShuntCallSignaling;

console.log('ShuntCallSignaling loaded');
