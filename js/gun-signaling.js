/**
 * Gun.js Signaling Module
 * Simple and reliable peer discovery and WebRTC signaling
 */

const GUN_PEERS = ['https://gun-manhattan.herokuapp.com/gun'];

const ShuntCallSignaling = {
  gun: null,
  namespace: null,
  peerId: null,
  listeners: {},
  connectedPeers: new Map(),
  
  async init(namespace, peerId) {
    this.namespace = namespace;
    this.peerId = peerId;
    this.connectedPeers = new Map();
    
    this.gun = Gun(GUN_PEERS[0]);
    this.room = this.gun.get('shuntcall').get(namespace);
    this.myNode = this.room.get('peers').get(peerId);
    this.signaling = this.room.get('signaling');
    
    this.myNode.put({ id: peerId, time: Date.now() });
    
    this.pollForPeers();
    this.setupListeners();
    
    setInterval(() => {
      this.myNode.put({ id: this.peerId, time: Date.now() });
    }, 5000);
    
    console.log('Signaling ready:', peerId);
    return this;
  },
  
  pollForPeers() {
    setInterval(() => {
      this.room.get('peers').map().once((data, id) => {
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
    this.signaling.get(this.peerId).get('offer').on((data) => {
      if (data && data.from && data.sdp) {
        console.log('Got offer from:', data.from);
        this.emit('offer', { from: data.from, sdp: data.sdp });
      }
    });
    
    this.signaling.get(this.peerId).get('answer').on((data) => {
      if (data && data.from && data.sdp) {
        console.log('Got answer from:', data.from);
        this.emit('answer', { from: data.from, sdp: data.sdp });
      }
    });
    
    this.signaling.get(this.peerId).get('ice').on((data) => {
      if (data && data.from && data.candidate) {
        this.emit('ice', { from: data.from, candidate: data.candidate });
      }
    });
  },
  
  async sendOffer(targetId, sdp) {
    console.log('Sending offer to:', targetId);
    this.signaling.get(targetId).get('offer').put({
      from: this.peerId,
      sdp: JSON.stringify(sdp)
    });
  },
  
  async sendAnswer(targetId, sdp) {
    console.log('Sending answer to:', targetId);
    this.signaling.get(targetId).get('answer').put({
      from: this.peerId,
      sdp: JSON.stringify(sdp)
    });
  },
  
  async sendIceCandidate(targetId, candidate) {
    this.signaling.get(targetId).get('ice').put({
      from: this.peerId,
      candidate: JSON.stringify(candidate)
    });
  },
  
  async getPeers() {
    return new Promise((resolve) => {
      const peers = [];
      this.room.get('peers').map().once((data, id) => {
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
