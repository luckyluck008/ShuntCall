/**
 * WebRTC Core Module
 * RTCPeerConnection lifecycle management
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

  /**
   * Initialize WebRTC with local stream
   * @param {MediaStream} localStream - Local video/audio stream
   * @param {string} peerId - Our peer ID
   * @param {object} signaling - Signaling module instance
   */
  init(localStream, peerId, signaling) {
    this.localStream = localStream;
    this.peerId = peerId;
    this.signaling = signaling;
    this.pendingIceCandidates = {};
    
    this.setupSignalingListeners();
    console.log('ShuntCallWebRTC initialized');
    return this;
  },

  /**
   * Setup signaling event listeners
   */
  setupSignalingListeners() {
    this.signaling.on('offer', async (data) => {
      console.log('Received offer event from:', data.from);
      await this.handleOffer(data.from, JSON.parse(data.sdp));
    });
    
    this.signaling.on('answer', async (data) => {
      console.log('Received answer event from:', data.from);
      await this.handleAnswer(data.from, JSON.parse(data.sdp));
    });
    
    this.signaling.on('ice', async (data) => {
      console.log('Received ICE event from:', data.from);
      await this.handleIceCandidate(data.from, JSON.parse(data.candidate));
    });
  },

  /**
   * Create a peer connection
   * @param {string} remotePeerId - Remote peer ID
   * @returns {RTCPeerConnection}
   */
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
      if (event.candidate) {
        console.log('ICE candidate generated for:', remotePeerId);
        this.signaling.sendIceCandidate(remotePeerId, event.candidate);
      }
    };
    
    pc.ontrack = (event) => {
      console.log('Track received from:', remotePeerId);
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
    console.log('Peer connection created for:', remotePeerId);
    return pc;
  },

  /**
   * Handle incoming offer
   * @param {string} fromPeerId - Sender peer ID
   * @param {RTCSessionDescriptionInit} sdp - SDP offer
   */
  async handleOffer(fromPeerId, sdp) {
    console.log('Processing offer from:', fromPeerId);
    
    let pc = this.peerConnections[fromPeerId];
    if (!pc) {
      pc = this.createPeerConnection(fromPeerId);
    }
    
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log('Remote description set for offer');
    
    this.processPendingIceCandidates(fromPeerId);
    
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    console.log('Sending answer to:', fromPeerId);
    this.signaling.sendAnswer(fromPeerId, answer);
  },

  /**
   * Handle incoming answer
   * @param {string} fromPeerId - Sender peer ID
   * @param {RTCSessionDescriptionInit} sdp - SDP answer
   */
  async handleAnswer(fromPeerId, sdp) {
    console.log('Processing answer from:', fromPeerId);
    
    const pc = this.peerConnections[fromPeerId];
    if (!pc) {
      console.warn('No peer connection for answer:', fromPeerId);
      return;
    }
    
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log('Remote description set for answer');
    
    this.processPendingIceCandidates(fromPeerId);
  },

  /**
   * Handle incoming ICE candidate
   * @param {string} fromPeerId - Sender peer ID
   * @param {RTCIceCandidateInit} candidate - ICE candidate
   */
  async handleIceCandidate(fromPeerId, candidate) {
    console.log('Processing ICE from:', fromPeerId);
    
    const pc = this.peerConnections[fromPeerId];
    if (!pc) {
      console.log('No PC yet, buffering ICE for:', fromPeerId);
      if (!this.pendingIceCandidates[fromPeerId]) {
        this.pendingIceCandidates[fromPeerId] = [];
      }
      this.pendingIceCandidates[fromPeerId].push(candidate);
      return;
    }
    
    if (pc.remoteDescription) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('ICE candidate added for:', fromPeerId);
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    } else {
      console.log('No remote description, buffering ICE');
      if (!this.pendingIceCandidates[fromPeerId]) {
        this.pendingIceCandidates[fromPeerId] = [];
      }
      this.pendingIceCandidates[fromPeerId].push(candidate);
    }
  },

  /**
   * Process buffered ICE candidates
   */
  async processPendingIceCandidates(peerId) {
    const pc = this.peerConnections[peerId];
    if (!pc || !this.pendingIceCandidates[peerId]) return;
    
    const candidates = this.pendingIceCandidates[peerId];
    console.log('Processing', candidates.length, 'buffered ICE candidates');
    
    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error adding buffered ICE:', error);
      }
    }
    
    this.pendingIceCandidates[peerId] = [];
  },

  /**
   * Create and send offer to a peer
   * @param {string} remotePeerId - Target peer ID
   */
  async createOffer(remotePeerId) {
    console.log('Creating offer for:', remotePeerId);
    
    let pc = this.peerConnections[remotePeerId];
    if (!pc) {
      pc = this.createPeerConnection(remotePeerId);
    }
    
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    console.log('Sending offer to:', remotePeerId);
    this.signaling.sendOffer(remotePeerId, offer);
  },

  /**
   * Handle connection state changes
   * @param {RTCPeerConnection} pc
   */
  handleConnectionStateChange(pc) {
    console.log(`Peer ${pc.peerId} connection state:`, pc.connectionState);
    
    this.emit('connectionStateChange', {
      peerId: pc.peerId,
      state: pc.connectionState
    });
    
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      this.attemptReconnect(pc);
    }
  },

  /**
   * Handle ICE connection state changes
   * @param {RTCPeerConnection} pc
   */
  handleICEConnectionStateChange(pc) {
    console.log(`Peer ${pc.peerId} ICE state:`, pc.iceConnectionState);
    
    if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
      this.attemptReconnect(pc);
    }
  },

  /**
   * Attempt to reconnect to a peer
   * @param {RTCPeerConnection} pc
   */
  async attemptReconnect(pc) {
    if (pc.reconnectAttempts >= pc.maxReconnectAttempts) {
      console.log(`Max reconnect attempts reached for ${pc.peerId}`);
      this.emit('peerDisconnected', { peerId: pc.peerId });
      return;
    }
    
    pc.reconnectAttempts++;
    console.log(`Attempting reconnect ${pc.reconnectAttempts}/${pc.maxReconnectAttempts} for ${pc.peerId}`);
    
    try {
      pc.restartIce();
    } catch (error) {
      console.error('ICE restart failed:', error);
      await this.createOffer(pc.peerId);
    }
  },

  /**
   * Get peer connection stats
   * @param {string} peerId - Peer ID
   * @returns {Promise<RTCStatsReport>}
   */
  async getStats(peerId) {
    const pc = this.peerConnections[peerId];
    if (!pc) return null;
    return pc.getStats();
  },

  /**
   * Get all peer connections
   * @returns {Object}
   */
  getAllConnections() {
    return { ...this.peerConnections };
  },

  /**
   * Close a peer connection
   * @param {string} peerId - Peer ID to disconnect
   */
  closePeerConnection(peerId) {
    const pc = this.peerConnections[peerId];
    if (pc) {
      pc.close();
      delete this.peerConnections[peerId];
      delete this.pendingIceCandidates[peerId];
    }
  },

  /**
   * Close all peer connections
   */
  closeAllConnections() {
    Object.keys(this.peerConnections).forEach(peerId => {
      this.closePeerConnection(peerId);
    });
  },

  /**
   * Add local stream tracks
   * @param {MediaStream} stream
   */
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
   * Destroy WebRTC manager
   */
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
