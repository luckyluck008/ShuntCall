/**
 * WebRTC Core Module
 * RTCPeerConnection lifecycle management with Nostr signaling
 */

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
];

const PUBLIC_TURN_SERVERS = [
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];

const ShuntCallWebRTC = {
  peerConnections: {},
  dataChannels: {},
  remoteStreams: {},
  localStream: null,
  peerId: null,
  signaling: null,
  pendingIceCandidates: {},
  config: {
    iceServers: ICE_SERVERS,
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all'
  },
  turnEnabled: false,
  listeners: {},
  currentVideoQuality: '720p',
  videoQualityMap: {
    '480p': { width: 854, height: 480, bitrate: 2500000 },
    '720p': { width: 1280, height: 720, bitrate: 5000000 },
    '1080p': { width: 1920, height: 1080, bitrate: 8000000 },
    '1440p': { width: 2560, height: 1440, bitrate: 16000000 },
    '4k': { width: 3840, height: 2160, bitrate: 35000000 },
    '8k': { width: 7680, height: 4320, bitrate: 80000000 }
  },

  init(localStream, peerId, signaling) {
    this.localStream = localStream;
    this.peerId = peerId;
    this.signaling = signaling;
    this.pendingIceCandidates = {};
    this.remoteStreams = {};
    this.dataChannels = {};
    this.turnEnabled = false;
    
    // Add local stream track event listeners for dynamic track management
    if (this.localStream) {
      this.setupLocalStreamTrackListeners(this.localStream);
    }
    
    console.log('WebRTC init - stream:', !!localStream, 'peerId:', peerId.slice(0, 16));
    
    this.setupSignalingListeners();
    console.log('ShuntCallWebRTC initialized');
    return this;
  },

  enableTurn() {
    this.turnEnabled = true;
    this.config.iceServers = [...ICE_SERVERS, ...PUBLIC_TURN_SERVERS];
    console.log('TURN servers enabled for NAT traversal');
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
       console.log('=== WebRTC handlePresence ===');
       console.log('From peer:', fromPeerId.slice(0, 16) + '...');
       console.log('Current peer connections:', Object.keys(this.peerConnections));
       
       try {
         // Check if we already have a connection with this peer
         if (this.peerConnections[fromPeerId]) {
           console.log('Already have a peer connection with:', fromPeerId.slice(0, 16) + '...');
           return;
         }
         
         // Wait for local stream to be available before creating offer
         if (!this.localStream) {
           console.warn('Local stream not available yet - skipping offer creation');
           return;
         }
         
         // Glare resolution: only peer with higher pubkey creates offer
         if (fromPeerId > this.peerId) {
           console.log('Remote peer has higher ID, they will create offer. Waiting.');
           return;
         }
         
         // Create a dedicated offer for this peer
         const offer = await this.createOffer(fromPeerId);
         console.log('Offer created successfully:', offer?.type);
       } catch (error) {
         console.error('Error handling presence:', error);
         console.error('Error stack:', error.stack);
       }
     },

    createPeerConnection(remotePeerId) {
     const pc = new RTCPeerConnection(this.config);
     
     pc.peerId = remotePeerId;
     pc.internalConnectionState = 'new';
     pc.reconnectAttempts = 0;
     pc.maxReconnectAttempts = 3;
     this.pendingIceCandidates[remotePeerId] = [];
    
     if (this.localStream) {
       const tracks = this.localStream.getTracks();
       console.log('Adding local tracks to peer connection:', tracks.map(t => ({
         kind: t.kind,
         id: t.id,
         readyState: t.readyState,
         enabled: t.enabled
       })));
       
       if (tracks.length === 0) {
         console.error('ERROR: Local stream has no tracks to add');
       } else {
         tracks.forEach(track => {
           const sender = pc.addTrack(track, this.localStream);
           console.log('Track added to peer connection:', track.kind, 'sender:', sender);
         });
       }
      } else {
        console.warn('No local stream available when creating peer connection');
      }

    // Setup DataChannel for signaling state sync and chat
    // The offerer creates the channel, the answerer receives it via ondatachannel
    const dataChannel = pc.createDataChannel('shuntcall', {
      ordered: true
    });
    this.setupDataChannel(dataChannel, remotePeerId);
    this.dataChannels[remotePeerId] = dataChannel;

    pc.ondatachannel = (event) => {
      console.log('DataChannel received from:', remotePeerId.slice(0, 16));
      const channel = event.channel;
      this.setupDataChannel(channel, remotePeerId);
      this.dataChannels[remotePeerId] = channel;
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // IP Leak Detection: check for host candidates that expose local IPs
        if (event.candidate.candidate && event.candidate.candidate.includes('typ host')) {
          const ipMatch = event.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
          if (ipMatch && !ipMatch[1].startsWith('127.')) {
            this.emit('ipLeakWarning', {
              peerId: remotePeerId,
              ip: ipMatch[1],
              type: 'host',
              candidate: event.candidate.candidate
            });
          }
        }
        
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
      const isFirstTrack = !this.remoteStreams[remotePeerId];
      
      console.log('Track details:', {
        kind: track.kind,
        id: track.id,
        label: track.label,
        readyState: track.readyState,
        enabled: track.enabled,
        streams: streams.length,
        streamId: streams[0]?.id,
        isFirstTrack
      });
      
      // Maintain a single MediaStream per remote peer that accumulates all tracks
      if (!this.remoteStreams[remotePeerId]) {
        // Use incoming stream if available, otherwise create a new one
        if (streams[0]) {
          this.remoteStreams[remotePeerId] = streams[0];
        } else {
          this.remoteStreams[remotePeerId] = new MediaStream();
        }
      }
      
      // Add track to our managed stream (idempotent - won't duplicate)
      this.remoteStreams[remotePeerId].addTrack(track);
      const remoteStream = this.remoteStreams[remotePeerId];
      
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
      
      // Always emit remoteStream so the UI can update with new tracks
      this.emit('remoteStream', {
        peerId: remotePeerId,
        stream: remoteStream,
        isFirstTrack
      });
      
      this.emit('trackReceived', {
        peerId: remotePeerId,
        track,
        stream: remoteStream,
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

    await pc.setLocalDescription(answer);

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
      
      // Auto-cleanup orphaned pending candidates after 60s
      if (!this.pendingIceCleanupTimers) this.pendingIceCleanupTimers = {};
      if (!this.pendingIceCleanupTimers[peerId]) {
        this.pendingIceCleanupTimers[peerId] = setTimeout(() => {
          delete this.pendingIceCandidates[peerId];
          delete this.pendingIceCleanupTimers[peerId];
        }, 60000);
      }
      return;
    }

    try {
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        console.log('Remote description not set - buffering ICE candidate:', peerId.slice(0, 16));
        this.pendingIceCandidates[peerId] = this.pendingIceCandidates[peerId] || [];
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

      // Use icegatheringstatechange instead of overwriting onicecandidate
      const onGatheringChange = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', onGatheringChange);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', onGatheringChange);

      setTimeout(() => {
        pc.removeEventListener('icegatheringstatechange', onGatheringChange);
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

    // Set local description directly (no SDP manipulation needed)
    await pc.setLocalDescription(offer);
    
    await this.waitForIceGathering(pc);
    
    console.log('Sending offer to:', remotePeerId.slice(0, 16) + '...');
    await this.signaling.sendOffer(remotePeerId, pc.localDescription);
    
    return pc.localDescription;
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
      // Enable TURN as last resort before giving up
      if (!this.turnEnabled) {
        this.enableTurn();
        console.log('Enabling TURN servers for future connections');
      }
      this.emit('peerDisconnected', { peerId: pc.peerId });
      return;
    }
    
    pc.reconnectAttempts++;
    console.log(`Attempting reconnect ${pc.reconnectAttempts}/${pc.maxReconnectAttempts} for ${pc.peerId?.slice(0, 16)}`);
    
    // Enable TURN on second reconnect attempt
    if (pc.reconnectAttempts >= 2 && !this.turnEnabled) {
      this.enableTurn();
      console.log('TURN enabled for reconnection (likely symmetric NAT)');
    }
    
    try {
      pc.restartIce();
      
      // Timeout: if connection not restored within 30s, try again or give up
      setTimeout(() => {
        if (pc.connectionState !== 'connected' && pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
          console.log(`ICE restart timeout for ${pc.peerId?.slice(0, 16)}, retrying...`);
          this.attemptReconnect(pc);
        }
      }, 30000);
    } catch (error) {
      console.error('ICE restart failed:', error);
    }
  },

  async handleTrackFailure(peerId, track, error) {
    console.error('Track failure for peer:', peerId.slice(0, 16), 'track:', track.kind, 'error:', error);
    
    this.emit('trackFailure', {
      peerId,
      track,
      kind: track.kind,
      error
    });
    
    try {
      const pc = this.peerConnections[peerId];
      if (pc && pc.connectionState === 'connected') {
        const localTracks = this.getLocalTracks();
        const sameKindTrack = localTracks.find(t => t.kind === track.kind && t.readyState === 'live');
        
        if (sameKindTrack) {
          console.log('Trying to recover track by replacing with same kind track');
          // Find the sender for outgoing tracks (not receiver)
          const sender = pc.getSenders().find(s => s.track === track || s.track?.kind === track.kind);
          if (sender) {
            await sender.replaceTrack(sameKindTrack);
            console.log('Track recovered successfully via sender.replaceTrack');
            this.emit('trackRecovered', {
              peerId,
              track: sameKindTrack,
              kind: sameKindTrack.kind
            });
          } else {
            console.log('No sender found - adding track as new');
            pc.addTrack(sameKindTrack, this.localStream);
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
        this.handleTrackFailure(peerId, sender.track, new Error('Track not live'));
      }
    });

    receivers.forEach(receiver => {
      if (receiver.track && receiver.track.readyState !== 'live') {
        console.warn('Receiver track not live:', receiver.track.kind, receiver.track.readyState);
        this.handleTrackFailure(peerId, receiver.track, new Error('Track not live'));
      }
    });

    // Check if we need to add missing tracks
    if (this.localStream) {
      const localTracks = this.localStream.getTracks();
      const existingSenderKinds = senders.map(s => s.track?.kind).filter(Boolean);
      
      localTracks.forEach(track => {
        if (!existingSenderKinds.includes(track.kind)) {
          console.log('Adding missing track to peer connection:', track.kind);
          pc.addTrack(track, this.localStream);
        }
      });
    }

    // Verify that we have both audio and video tracks if expected
    const hasAudioSender = senders.some(s => s.track?.kind === 'audio');
    const hasVideoSender = senders.some(s => s.track?.kind === 'video');
    const hasAudioReceiver = receivers.some(r => r.track?.kind === 'audio');
    const hasVideoReceiver = receivers.some(r => r.track?.kind === 'video');

    console.log('Track presence:', {
      sendAudio: hasAudioSender,
      sendVideo: hasVideoSender,
      recvAudio: hasAudioReceiver,
      recvVideo: hasVideoReceiver
    });
  },

  getAllConnections() {
    return { ...this.peerConnections };
  },

  closePeerConnection(peerId) {
    const pc = this.peerConnections[peerId];
    if (pc) {
      const dc = this.dataChannels[peerId];
      if (dc && dc.readyState !== 'closed') {
        dc.close();
      }
      pc.close();
      delete this.peerConnections[peerId];
      delete this.pendingIceCandidates[peerId];
      delete this.remoteStreams[peerId];
      delete this.dataChannels[peerId];
      if (this.pendingIceCleanupTimers?.[peerId]) {
        clearTimeout(this.pendingIceCleanupTimers[peerId]);
        delete this.pendingIceCleanupTimers[peerId];
      }
    }
  },

  closeAllConnections() {
    Object.keys(this.peerConnections).forEach(peerId => {
      this.closePeerConnection(peerId);
    });
    this.remoteStreams = {};
    this.dataChannels = {};
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

  getLocalTracks() {
    if (!this.localStream) return [];
    return this.localStream.getTracks();
  },

  setupDataChannel(channel, peerId) {
    // Guard against double-setup
    if (channel._setupComplete) return;
    channel._setupComplete = true;
    
    channel.onopen = () => {
      console.log('DataChannel open with:', peerId.slice(0, 16));
      this.emit('dataChannelOpen', { peerId, channel });
    };

    channel.onclose = () => {
      console.log('DataChannel closed with:', peerId.slice(0, 16));
      this.emit('dataChannelClose', { peerId });
    };

    channel.onerror = (error) => {
      console.error('DataChannel error with:', peerId.slice(0, 16), error);
    };

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit('dataChannelMessage', { peerId, data, channel });
      } catch (e) {
        console.warn('Failed to parse DataChannel message:', e);
      }
    };
  },

  sendData(peerId, data) {
    const channel = this.dataChannels[peerId];
    if (channel && channel.readyState === 'open') {
      try {
        const msg = JSON.stringify(data);
        // Check if message is too large
        if (channel.maxMessageSize && msg.length > channel.maxMessageSize) {
          console.warn('DataChannel message too large for peer:', peerId.slice(0, 16), 'size:', msg.length, 'max:', channel.maxMessageSize);
          return false;
        }
        channel.send(msg);
        return true;
      } catch (error) {
        console.error('DataChannel send error to', peerId.slice(0, 16), error);
        return false;
      }
    }
    return false;
  },

  broadcastData(data) {
    let sent = 0;
    Object.keys(this.dataChannels).forEach(peerId => {
      if (this.sendData(peerId, data)) sent++;
    });
    return sent;
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

  async setVideoQuality(quality, fallback = true) {
    const qualitySettings = this.videoQualityMap[quality];
    if (!qualitySettings) {
      console.error('Invalid video quality:', quality);
      return false;
    }

    if (!this.localStream) {
      console.warn('No local stream available');
      return false;
    }

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) {
      console.warn('No video track available');
      return false;
    }

    try {
      const constraints = {
        width: { ideal: qualitySettings.width },
        height: { ideal: qualitySettings.height },
        frameRate: { ideal: 30 }
      };
      
      await videoTrack.applyConstraints(constraints);
      this.currentVideoQuality = quality;
      
      Object.values(this.peerConnections).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.track.applyConstraints(constraints).catch(err => {
            console.warn('Failed to apply constraints on sender:', err);
          });
        }
      });

      console.log('Video quality changed to:', quality, constraints);
      this.emit('videoQualityChanged', { quality, settings: qualitySettings });
      return true;
    } catch (error) {
      console.error('Failed to apply video quality:', error);
      
      if (fallback) {
        const fallbackQualities = ['1080p', '720p', '480p'];
        const currentIndex = fallbackQualities.indexOf(quality);
        
        for (let i = currentIndex + 1; i < fallbackQualities.length; i++) {
          const fallbackQuality = fallbackQualities[i];
          console.log('Trying fallback quality:', fallbackQuality);
          const fallbackSettings = this.videoQualityMap[fallbackQuality];
          
          try {
            const fallbackConstraints = {
              width: { ideal: fallbackSettings.width },
              height: { ideal: fallbackSettings.height },
              frameRate: { ideal: 30 }
            };
            
            await videoTrack.applyConstraints(fallbackConstraints);
            this.currentVideoQuality = fallbackQuality;
            
            console.log('Fallback to', fallbackQuality, 'successful');
            this.emit('videoQualityChanged', { quality: fallbackQuality, settings: fallbackSettings, originalQuality: quality });
            return true;
          } catch (fallbackError) {
            console.warn('Fallback to', fallbackQuality, 'failed:', fallbackError);
          }
        }
      }
      
      this.emit('videoQualityError', { quality, error });
      return false;
    }
  },

  getAvailableQualities() {
    return Object.keys(this.videoQualityMap);
  },

  getCurrentQuality() {
    return this.currentVideoQuality;
  },

  async autoAdjustQuality() {
    if (!this.localStream || Object.keys(this.peerConnections).length === 0) return;
    
    let worstRtt = 0;
    let totalPacketLoss = 0;
    let reportCount = 0;
    
    for (const pc of Object.values(this.peerConnections)) {
      try {
        const stats = await pc.getStats();
        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            worstRtt = Math.max(worstRtt, report.currentRoundTripTime || 0);
          }
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            const lost = report.packetsLost || 0;
            const received = report.packetsReceived || 1;
            totalPacketLoss += (lost / (lost + received)) * 100;
            reportCount++;
          }
        });
      } catch (e) { /* ignore */ }
    }
    
    const avgPacketLoss = reportCount > 0 ? totalPacketLoss / reportCount : 0;
    const rttMs = worstRtt * 1000;
    
    const qualityOrder = ['8k', '4k', '1440p', '1080p', '720p', '480p'];
    const currentIdx = qualityOrder.indexOf(this.currentVideoQuality);
    
    // Downgrade if RTT > 500ms or packet loss > 10%
    if ((rttMs > 500 || avgPacketLoss > 10) && currentIdx < qualityOrder.length - 1) {
      const newQuality = qualityOrder[currentIdx + 1];
      console.log(`Auto-adjusting quality DOWN: ${this.currentVideoQuality} -> ${newQuality} (RTT:${rttMs.toFixed(0)}ms, loss:${avgPacketLoss.toFixed(1)}%)`);
      await this.setVideoQuality(newQuality, false);
      return { changed: true, direction: 'down', quality: newQuality, rtt: rttMs, loss: avgPacketLoss };
    }
    
    // Upgrade if RTT < 100ms and packet loss < 2% and stable for a while
    if ((rttMs < 100 && avgPacketLoss < 2) && currentIdx > 0) {
      const newQuality = qualityOrder[currentIdx - 1];
      console.log(`Auto-adjusting quality UP: ${this.currentVideoQuality} -> ${newQuality} (RTT:${rttMs.toFixed(0)}ms, loss:${avgPacketLoss.toFixed(1)}%)`);
      await this.setVideoQuality(newQuality, false);
      return { changed: true, direction: 'up', quality: newQuality, rtt: rttMs, loss: avgPacketLoss };
    }
    
    return { changed: false, quality: this.currentVideoQuality, rtt: rttMs, loss: avgPacketLoss };
  },

  destroy() {
    // Remove signaling listeners
    if (this.signaling) {
      this.signaling.off('presence');
      this.signaling.off('offer');
      this.signaling.off('answer');
      this.signaling.off('iceCandidate');
    }
    this.closeAllConnections();
    this.listeners = {};
    this.signaling = null;
  }
};

if (typeof window !== 'undefined') {
  window.ShuntCallWebRTC = ShuntCallWebRTC;
}

export { ShuntCallWebRTC };
