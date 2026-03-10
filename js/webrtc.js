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
    
    // Add local stream track event listeners for dynamic track management
    if (this.localStream) {
      this.setupLocalStreamTrackListeners(this.localStream);
    }
    
    console.log('WebRTC init - stream:', !!localStream, 'peerId:', peerId.slice(0, 16));
    
    this.setupSignalingListeners();
    console.log('ShuntCallWebRTC initialized');
    return this;
  },

  setupLocalStreamTrackListeners(stream) {
    // Listen for new tracks being added to local stream
    stream.onaddtrack = (event) => {
      console.log('Local track added:', event.track.kind);
      this.addLocalTrack(event.track, stream);
    };

    // Listen for tracks being removed from local stream
    stream.onremovetrack = (event) => {
      console.log('Local track removed:', event.track.kind);
      this.removeLocalTrack(event.track);
    };
  },

   setupSignalingListeners() {
    this.signaling.on('presence', async (data) => {
      console.log('Received presence event from:', data.from.slice(0, 16) + '...');
      await this.handlePresence(data.from);
    });

    this.signaling.on('offer', async (data) => {
      console.log('Received offer event from:', data.from.slice(0, 16) + '...');
      await this.handleOffer(data.from, {type: 'offer', sdp: data.sdp}, data.eventId);
    });

    this.signaling.on('answer', async (data) => {
      console.log('Received answer event from:', data.from.slice(0, 16) + '...');
      await this.handleAnswer(data.from, {type: 'answer', sdp: data.sdp});
    });

    this.signaling.on('iceCandidate', async (data) => {
      console.log('Received ICE candidate from:', data.from.slice(0, 16) + '...');
      await this.handleIceCandidate(data.from, data.candidate);
    });
  },

  async handlePresence(fromPeerId) {
    console.log('Handling presence from:', fromPeerId.slice(0, 16) + '...');

    // Create a dedicated offer for this peer
    await this.createOffer(fromPeerId);
  },

   createPeerConnection(remotePeerId) {
    const pc = new RTCPeerConnection(this.config);
    
    pc.peerId = remotePeerId;
    pc.connectionState = 'new';
    pc.reconnectAttempts = 0;
    pc.maxReconnectAttempts = 3;
    this.pendingIceCandidates[remotePeerId] = [];
    
    if (this.localStream) {
      console.log('Adding local tracks to peer connection:', this.localStream.getTracks().map(t => ({
        kind: t.kind,
        id: t.id,
        readyState: t.readyState,
        enabled: t.enabled
      })));
      
      this.localStream.getTracks().forEach(track => {
        const sender = pc.addTrack(track, this.localStream);
        console.log('Track added to peer connection:', track.kind, 'sender:', sender);
      });
    } else {
      console.warn('No local stream available when creating peer connection');
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('ICE candidate generated for peer:', remotePeerId.slice(0, 16));
        this.emit('iceCandidate', {
          peerId: remotePeerId,
          candidate: event.candidate
        });
        
        // If signaling has ice candidate method, send it
        if (this.signaling && this.signaling.sendIceCandidate) {
          this.signaling.sendIceCandidate(remotePeerId, event.candidate);
        }
      }
    };
    
    pc.ontrack = (event) => {
      console.log('Track received from:', remotePeerId.slice(0, 16) + '...');
      const { track, streams } = event;
      
      console.log('Track details:', {
        kind: track.kind,
        id: track.id,
        label: track.label,
        readyState: track.readyState,
        enabled: track.enabled,
        streams: streams.length,
        streamId: streams[0]?.id
      });
      
      // Add track error listener
      track.onended = () => {
        console.log('Remote track ended:', track.kind, remotePeerId.slice(0, 16));
        this.emit('trackEnded', {
          peerId: remotePeerId,
          track,
          kind: track.kind
        });
      };
      
      track.onerror = (error) => {
        console.error('Remote track error:', track.kind, remotePeerId.slice(0, 16), error);
        this.emit('trackError', {
          peerId: remotePeerId,
          track,
          kind: track.kind,
          error
        });
      };
      
      // Emit both remoteStream and track events for flexibility
      this.emit('remoteStream', {
        peerId: remotePeerId,
        stream: streams[0]
      });
      
      this.emit('trackReceived', {
        peerId: remotePeerId,
        track,
        stream: streams[0],
        kind: track.kind
      });
    };
    
    // Listen for track events from the peer connection
    pc.onsignalingstatechange = () => {
      console.log(`Peer ${remotePeerId.slice(0, 16)} signaling state:`, pc.signalingState);
    };
    
    pc.onconnectionstatechange = () => {
      this.handleConnectionStateChange(pc);
    };
    
    pc.oniceconnectionstatechange = () => {
      this.handleICEConnectionStateChange(pc);
    };
    
    // Listen for ICE gathering state changes
    pc.onicegatheringstatechange = () => {
      console.log(`Peer ${remotePeerId.slice(0, 16)} ICE gathering state:`, pc.iceGatheringState);
    };
    
    this.peerConnections[remotePeerId] = pc;
    console.log('Peer connection created for:', remotePeerId.slice(0, 16) + '...');
    return pc;
  },

   async handleOffer(fromPeerId, sdp, eventId) {
    console.log('Processing offer from:', fromPeerId.slice(0, 16) + '...');
    console.log('Offer details:', {
      hasVideo: sdp.sdp.includes('m=video'),
      hasAudio: sdp.sdp.includes('m=audio'),
      sdpSize: sdp.sdp.length
    });

    let pc = this.peerConnections[fromPeerId];
    if (!pc) {
      pc = this.createPeerConnection(fromPeerId);
    }

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log('Remote description set for offer');

    this.processPendingIceCandidates(fromPeerId);

    const answer = await pc.createAnswer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    
    console.log('Answer created:', {
      type: answer.type,
      hasVideo: answer.sdp.includes('m=video'),
      hasAudio: answer.sdp.includes('m=audio'),
      sdpSize: answer.sdp.length
    });

    const optimizedAnswer = this.optimizeSDP(answer);
    await pc.setLocalDescription(optimizedAnswer);

    await this.waitForIceGathering(pc);

    console.log('Sending answer to:', fromPeerId.slice(0, 16) + '...');
    await this.signaling.sendAnswer(fromPeerId, pc.localDescription, eventId);
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

   async handleIceCandidate(peerId, candidate) {
    let pc = this.peerConnections[peerId];
    if (!pc) {
      console.log('No peer connection for ICE candidate - buffering:', peerId.slice(0, 16));
      this.pendingIceCandidates[peerId] = this.pendingIceCandidates[peerId] || [];
      this.pendingIceCandidates[peerId].push(candidate);
      return;
    }

    try {
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        console.log('Remote description not set - buffering ICE candidate:', peerId.slice(0, 16));
        this.pendingIceCandidates[peerId].push(candidate);
      }
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
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
    
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    
    console.log('Offer created:', {
      type: offer.type,
      sdpSize: offer.sdp.length,
      hasVideo: offer.sdp.includes('m=video'),
      hasAudio: offer.sdp.includes('m=audio')
    });
    
    // Optimize SDP for better compatibility
    const optimizedOffer = this.optimizeSDP(offer);
    
    await pc.setLocalDescription(optimizedOffer);
    
    await this.waitForIceGathering(pc);
    
    console.log('Sending offer to:', remotePeerId.slice(0, 16) + '...');
    await this.signaling.sendOffer(remotePeerId, pc.localDescription);
    
    return pc.localDescription;
  },

  optimizeSDP(sessionDescription) {
    let sdp = sessionDescription.sdp;
    
    // Prioritize VP8 and H.264 codecs for better compatibility
    if (sdp.includes('VP8')) {
      // Reorder codecs to prioritize VP8
      sdp = sdp.replace(/(m=video.*?)(VP8.*?)(H264.*?)(\\r\\n)/s, '$1$2$3');
    }
    
    // Ensure audio codecs are properly configured
    if (sdp.includes('opus')) {
      // Prioritize Opus codec
      sdp = sdp.replace(/(m=audio.*?)(opus.*?)(PCMU.*?)(\\r\\n)/s, '$1$2$3');
    }
    
    return new RTCSessionDescription({
      type: sessionDescription.type,
      sdp: sdp
    });
  },



   handleConnectionStateChange(pc) {
    console.log(`Peer ${pc.peerId?.slice(0, 16)} connection state:`, pc.connectionState);
    
    this.emit('connectionStateChange', {
      peerId: pc.peerId,
      state: pc.connectionState
    });
    
    if (pc.connectionState === 'connected') {
      // Verify tracks are properly established when connection is complete
      setTimeout(() => {
        this.verifyTracks(pc.peerId);
      }, 1000);
    }
    
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

  async    async handleTrackFailure(peerId, track, error) {
    console.error('Track failure for peer:', peerId.slice(0, 16), 'track:', track.kind, 'error:', error);
    
    this.emit('trackFailure', {
      peerId,
      track,
      kind: track.kind,
      error
    });
    
    // Try to recover the track
    try {
      const pc = this.peerConnections[peerId];
      if (pc && pc.connectionState === 'connected') {
        // Check if track is still available locally
        const localTracks = this.getLocalTracks();
        const sameKindTrack = localTracks.find(t => t.kind === track.kind && t.readyState === 'live');
        
        if (sameKindTrack) {
          console.log('Trying to recover track by replacing with same kind track');
          const receiver = pc.getReceivers().find(r => r.track === track);
          if (receiver) {
            // For outgoing tracks, we need to find the sender
            const sender = pc.getSenders().find(s => s.track?.kind === track.kind);
            if (sender) {
              await sender.replaceTrack(sameKindTrack);
              console.log('Track recovered successfully');
              this.emit('trackRecovered', {
                peerId,
                track: sameKindTrack,
                kind: sameKindTrack.kind
              });
            }
          }
        }
      }
    } catch (recoveryError) {
      console.error('Track recovery failed:', recoveryError);
    }
  },

  async verifyTracks(peerId) {
    const pc = this.peerConnections[peerId];
    if (!pc) return;

    const senders = pc.getSenders();
    const receivers = pc.getReceivers();

    console.log('Track verification for peer:', peerId.slice(0, 16));
    console.log('Senders:', senders.map(s => ({
      kind: s.track?.kind,
      id: s.track?.id,
      readyState: s.track?.readyState
    })));
    console.log('Receivers:', receivers.map(r => ({
      kind: r.track?.kind,
      id: r.track?.id,
      readyState: r.track?.readyState
    })));

    // Check for inactive tracks
    senders.forEach(sender => {
      if (sender.track && sender.track.readyState !== 'live') {
        console.warn('Sender track not live:', sender.track.kind, sender.track.readyState);
      }
    });

    receivers.forEach(receiver => {
      if (receiver.track && receiver.track.readyState !== 'live') {
        console.warn('Receiver track not live:', receiver.track.kind, receiver.track.readyState);
      }
    });
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
    this.setupLocalStreamTrackListeners(stream);
    
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

  addLocalTrack(track, stream) {
    console.log('Adding local track to all peers:', track.kind);
    
    Object.values(this.peerConnections).forEach(pc => {
      const sender = pc.getSenders().find(s => s.track?.kind === track.kind);
      if (sender) {
        sender.replaceTrack(track).catch(error => {
          console.error('Failed to replace track:', error);
        });
      } else {
        pc.addTrack(track, stream || this.localStream);
      }
    });
    
    this.emit('localTrackAdded', { track, kind: track.kind });
  },

  removeLocalTrack(track) {
    console.log('Removing local track from all peers:', track.kind);
    
    Object.values(this.peerConnections).forEach(pc => {
      const sender = pc.getSenders().find(s => s.track === track);
      if (sender) {
        sender.replaceTrack(null).catch(error => {
          console.error('Failed to remove track:', error);
        });
      }
    });
    
    this.emit('localTrackRemoved', { track, kind: track.kind });
  },

  getRemoteTracks(peerId) {
    const pc = this.peerConnections[peerId];
    if (!pc) return [];
    
    const tracks = [];
    pc.getReceivers().forEach(receiver => {
      if (receiver.track) {
        tracks.push(receiver.track);
      }
    });
    return tracks;
  },

  getLocalTracks() {
    if (!this.localStream) return [];
    return this.localStream.getTracks();
  },

  async replaceTrack(peerId, oldTrack, newTrack) {
    const pc = this.peerConnections[peerId];
    if (!pc) {
      console.warn('No peer connection found for track replacement:', peerId);
      return false;
    }
    
    try {
      const sender = pc.getSenders().find(s => s.track === oldTrack);
      if (sender) {
        await sender.replaceTrack(newTrack);
        console.log('Track replaced successfully for peer:', peerId.slice(0, 16));
        return true;
      }
      
      // If old track not found, try to find by kind
      const kindSender = pc.getSenders().find(s => s.track?.kind === newTrack.kind);
      if (kindSender) {
        await kindSender.replaceTrack(newTrack);
        console.log('Track replaced by kind successfully for peer:', peerId.slice(0, 16));
        return true;
      }
      
      // If no sender found, add as new track
      pc.addTrack(newTrack, this.localStream);
      console.log('New track added successfully for peer:', peerId.slice(0, 16));
      return true;
    } catch (error) {
      console.error('Failed to replace track:', error);
      this.emit('trackError', {
        peerId,
        track: oldTrack,
        kind: oldTrack?.kind || newTrack.kind,
        error
      });
      return false;
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
