/**
 * WebRTC Core Module
 * RTCPeerConnection lifecycle management with Nostr signaling
 */

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

const ShuntCallWebRTC = {
  peerConnections: {},
  localStream: null,
  peerId: null,
  signaling: null,
  pendingIceCandidates: {},
  config: {
    iceServers: ICE_SERVERS,
    iceCandidatePoolSize: 10
  },
  listeners: {},

  init(localStream, peerId, signaling) {
    this.localStream = localStream;
    this.peerId = peerId;
    this.signaling = signaling;
    this.pendingIceCandidates = {};
    
    console.log('WebRTC init - stream:', !!localStream, 'peerId:', peerId.slice(0, 16));
    
    this.setupSignalingListeners();
    console.log('ShuntCallWebRTC initialized');
    return this;
  },

  setupSignalingListeners() {
    this.signaling.on('offer', async (data) => {
      console.log('Received offer event from:', data.from.slice(0, 16) + '...');
      await this.handleOffer(data.from, JSON.parse(data.sdp), data.eventId);
    });
    
    this.signaling.on('answer', async (data) => {
      console.log('Received answer event from:', data.from.slice(0, 16) + '...');
      await this.handleAnswer(data.from, JSON.parse(data.sdp));
    });
  },

  createPeerConnection(remotePeerId) {
    const pc = new RTCPeerConnection(this.config);
    
    pc.peerId = remotePeerId;
    pc.connectionState = 'new';
    pc.reconnectAttempts = 0;
    pc.maxReconnectAttempts = 3;
    this.pendingIceCandidates[remotePeerId] = [];
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    pc.onicecandidate = (event) => {
    };
    
    pc.ontrack = (event) => {
      console.log('Track received from:', remotePeerId.slice(0, 16) + '...');
      this.emit('remoteStream', {
        peerId: remotePeerId,
        stream: event.streams[0]
      });
    };
    
    pc.onconnectionstatechange = () => {
      this.handleConnectionStateChange(pc);
    };
    
    pc.oniceconnectionstatechange = () => {
      this.handleICEConnectionStateChange(pc);
    };
    
    this.peerConnections[remotePeerId] = pc;
    console.log('Peer connection created for:', remotePeerId.slice(0, 16) + '...');
    return pc;
  },

  async handleOffer(fromPeerId, sdp, eventId) {
    console.log('Processing offer from:', fromPeerId.slice(0, 16) + '...');
    
    let pc = this.peerConnections[fromPeerId];
    if (!pc) {
      pc = this.createPeerConnection(fromPeerId);
    }
    
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log('Remote description set for offer');
    
    this.processPendingIceCandidates(fromPeerId);
    
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    await this.waitForIceGathering(pc);
    
    console.log('Sending answer to:', fromPeerId.slice(0, 16) + '...');
    await this.signaling.sendAnswer(fromPeerId, answer, eventId);
  },

  async handleAnswer(fromPeerId, sdp) {
    console.log('Processing answer from:', fromPeerId.slice(0, 16) + '...');
    
    const pc = this.peerConnections[fromPeerId];
    if (!pc) {
      console.warn('No peer connection for answer:', fromPeerId.slice(0, 16) + '...');
      return;
    }
    
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log('Remote description set for answer');
    
    this.processPendingIceCandidates(fromPeerId);
  },

  processPendingIceCandidates(peerId) {
    const pc = this.peerConnections[peerId];
    if (!pc || !this.pendingIceCandidates[peerId]) return;
    
    const candidates = this.pendingIceCandidates[peerId];
    
    for (const candidate of candidates) {
      try {
        pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error adding buffered ICE:', error);
      }
    }
    
    this.pendingIceCandidates[peerId] = [];
  },

  async waitForIceGathering(pc) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      const checkState = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.onicecandidate = null;
          resolve();
        }
      };

      pc.onicecandidate = (event) => {
        if (!event.candidate) {
          checkState();
        }
      };

      setTimeout(() => {
        pc.onicecandidate = null;
        resolve();
      }, 2000);
    });
  },

  async createOffer(remotePeerId) {
    console.log('Creating offer for:', remotePeerId.slice(0, 16) + '...');
    
    let pc = this.peerConnections[remotePeerId];
    if (!pc) {
      pc = this.createPeerConnection(remotePeerId);
    }
    
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    await this.waitForIceGathering(pc);
    
    console.log('Sending offer to:', remotePeerId.slice(0, 16) + '...');
    await this.signaling.sendOffer(remotePeerId, offer);
    
    return offer;
  },

  async broadcastOffer() {
    try {
      if (!this.localStream) {
        console.log('WebRTC: Cannot broadcast offer - localStream not ready');
        return;
      }
      
      console.log('WebRTC: Creating offer for broadcast');
      
      // Create a dummy peer connection for broadcast
      // Note: For broadcast, we just need to generate the offer without a specific peer
      const dummyPeerId = 'broadcast';
      let pc = this.peerConnections[dummyPeerId];
      if (!pc) {
        pc = this.createPeerConnection(dummyPeerId);
      }
      
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      await this.waitForIceGathering(pc);
      
      console.log('Sending broadcast offer');
      
      // Send just the necessary data (avoid RTCSessionDescription object)
      await this.signaling.broadcastOffer({
        type: offer.type,
        sdp: offer.sdp
      });
      
    } catch (error) {
      console.error('WebRTC: Broadcast offer error', error);
      throw error;
    }
  },

  handleConnectionStateChange(pc) {
    console.log(`Peer ${pc.peerId?.slice(0, 16)} connection state:`, pc.connectionState);
    
    this.emit('connectionStateChange', {
      peerId: pc.peerId,
      state: pc.connectionState
    });
    
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      this.attemptReconnect(pc);
    }
  },

  handleICEConnectionStateChange(pc) {
    console.log(`Peer ${pc.peerId?.slice(0, 16)} ICE state:`, pc.iceConnectionState);
    
    if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
      this.attemptReconnect(pc);
    }
  },

  async attemptReconnect(pc) {
    if (pc.reconnectAttempts >= pc.maxReconnectAttempts) {
      console.log(`Max reconnect attempts reached for ${pc.peerId?.slice(0, 16)}`);
      this.emit('peerDisconnected', { peerId: pc.peerId });
      return;
    }
    
    pc.reconnectAttempts++;
    console.log(`Attempting reconnect ${pc.reconnectAttempts}/${pc.maxReconnectAttempts} for ${pc.peerId?.slice(0, 16)}`);
    
    try {
      pc.restartIce();
    } catch (error) {
      console.error('ICE restart failed:', error);
    }
  },

  async getStats(peerId) {
    const pc = this.peerConnections[peerId];
    if (!pc) return null;
    return pc.getStats();
  },

  getAllConnections() {
    return { ...this.peerConnections };
  },

  closePeerConnection(peerId) {
    const pc = this.peerConnections[peerId];
    if (pc) {
      pc.close();
      delete this.peerConnections[peerId];
      delete this.pendingIceCandidates[peerId];
    }
  },

  closeAllConnections() {
    Object.keys(this.peerConnections).forEach(peerId => {
      this.closePeerConnection(peerId);
    });
  },

  addLocalStream(stream) {
    this.localStream = stream;
    
    Object.values(this.peerConnections).forEach(pc => {
      stream.getTracks().forEach(track => {
        const sender = pc.getSenders().find(s => s.track?.kind === track.kind);
        if (sender) {
          sender.replaceTrack(track);
        } else {
          pc.addTrack(track, stream);
        }
      });
    });
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

  destroy() {
    this.closeAllConnections();
    this.listeners = {};
  }
};

if (typeof window !== 'undefined') {
  window.ShuntCallWebRTC = ShuntCallWebRTC;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ShuntCallWebRTC;
}

console.log('ShuntCallWebRTC module loaded');
