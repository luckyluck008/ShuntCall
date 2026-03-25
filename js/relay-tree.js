/**
 * Relay Tree Module
 * Bandwidth measurement, tree-based topology, and video stream forwarding
 */

const RELAY_CONFIG = {
  maxChildren: 3,
  bandwidthCheckInterval: 10000,
  treeReorgInterval: 30000,
  relayThreshold: 2 * 1024 * 1024,
  forwardCanvasWidth: 640,
  forwardCanvasHeight: 480,
  forwardFrameRate: 24
};

const ShuntCallRelayTree = {
  peerId: null,
  webrtc: null,
  tree: {},
  bandwidthData: {},
  statsInterval: null,
  reorgInterval: null,
  listeners: {},
  forwardedStreams: {},
  forwardElements: {},

  /**
   * Initialize relay tree
   * @param {string} peerId - Our peer ID
   * @param {object} webrtc - WebRTC module instance
   */
  init(peerId, webrtc) {
    this.peerId = peerId;
    this.webrtc = webrtc;
    this.forwardedStreams = {};
    this.forwardElements = {};
    
    this.tree[peerId] = {
      id: peerId,
      parent: null,
      children: [],
      isRelay: false,
      bandwidth: 0,
      hops: 0
    };
    
    this.startStatsCollection();
    this.startTreeReorganization();
    
    console.log('ShuntCallRelayTree initialized');
    return this;
  },

  /**
   * Add a peer to the tree
   * @param {string} peerId - Peer ID to add
   * @param {string} parentId - Parent peer ID
   */
  addPeer(peerId, parentId = null) {
    if (this.tree[peerId]) return;
    
    const parent = parentId ? this.tree[parentId] : null;
    const hops = parent ? parent.hops + 1 : 0;
    
    this.tree[peerId] = {
      id: peerId,
      parent: parentId,
      children: [],
      isRelay: false,
      bandwidth: 0,
      hops: hops
    };
    
    if (parent) {
      parent.children.push(peerId);
      if (parent.children.length >= RELAY_CONFIG.maxChildren) {
        parent.isRelay = true;
        this.emit('relayActivated', { peerId: parent.id });
      }
    }
    
    this.emit('peerAdded', { peerId, parentId, hops });
  },

  /**
   * Remove a peer from the tree
   * @param {string} peerId - Peer ID to remove
   */
  removePeer(peerId) {
    const node = this.tree[peerId];
    if (!node) return;
    
    // Stop any forwarding for this peer
    this.stopForwarding(peerId);
    
    if (node.parent) {
      const parent = this.tree[node.parent];
      if (parent) {
        parent.children = parent.children.filter(id => id !== peerId);
        if (parent.children.length < RELAY_CONFIG.maxChildren) {
          parent.isRelay = false;
        }
      }
    }
    
    node.children.forEach(childId => {
      this.reconnectChild(childId, node.parent);
    });
    
    delete this.tree[peerId];
    delete this.bandwidthData[peerId];
    
    this.emit('peerRemoved', { peerId });
  },

  /**
   * Reconnect a child to a new parent
   * @param {string} childId - Child peer ID
   * @param {string|null} newParentId - New parent ID
   */
  reconnectChild(childId, newParentId) {
    const child = this.tree[childId];
    if (!child) return;
    
    if (child.parent) {
      const oldParent = this.tree[child.parent];
      if (oldParent) {
        oldParent.children = oldParent.children.filter(id => id !== childId);
      }
    }
    
    child.parent = newParentId;
    child.hops = newParentId ? (this.tree[newParentId]?.hops || 0) + 1 : 0;
    
    if (newParentId) {
      const newParent = this.tree[newParentId];
      if (newParent) {
        if (newParent.children.length >= RELAY_CONFIG.maxChildren) {
          // Find alternative parent with capacity
          const altParent = this.findBestParent(childId);
          if (altParent && altParent !== newParentId) {
            this.reconnectChild(childId, altParent);
            return;
          }
        }
        newParent.children.push(childId);
      }
    }
    
    this.emit('peerReconnected', { peerId: childId, newParentId });
  },

  /**
   * Start forwarding a remote video stream to children via canvas capture
   * @param {string} sourcePeerId - Peer whose stream to forward
   * @param {MediaStream} stream - The stream to forward
   */
  startForwarding(sourcePeerId, stream) {
    if (!this.webrtc) return;
    
    const node = this.tree[this.peerId];
    if (!node || node.children.length === 0) return;
    
    // Don't forward if already forwarding this source
    if (this.forwardedStreams[sourcePeerId]) {
      this.updateForwardStream(sourcePeerId, stream);
      return;
    }
    
    console.log('Starting video forwarding from:', sourcePeerId.slice(0, 8), 'to', node.children.length, 'children');
    
    // Create hidden video element to receive the source stream
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    video.style.display = 'none';
    document.body.appendChild(video);
    
    // Create canvas to capture and re-render video
    const canvas = document.createElement('canvas');
    canvas.width = RELAY_CONFIG.forwardCanvasWidth;
    canvas.height = RELAY_CONFIG.forwardCanvasHeight;
    canvas.style.display = 'none';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    
    // Create forwarded stream from canvas
    const forwardStream = canvas.captureStream(RELAY_CONFIG.forwardFrameRate);
    
    // Add audio track from original stream if available
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length > 0) {
      forwardStream.addTrack(audioTracks[0]);
    }
    
    // Animation loop to draw video frames to canvas (throttled to forwardFrameRate)
    let animId = null;
    const frameInterval = 1000 / RELAY_CONFIG.forwardFrameRate;
    let lastFrameTime = 0;
    const drawFrame = (timestamp) => {
      if (timestamp - lastFrameTime >= frameInterval) {
        lastFrameTime = timestamp;
        if (video.readyState >= video.HAVE_CURRENT_DATA) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
      }
      animId = requestAnimationFrame(drawFrame);
    };
    video.onloadeddata = () => requestAnimationFrame(drawFrame);
    
    this.forwardedStreams[sourcePeerId] = {
      stream: forwardStream,
      sourceStream: stream,
      video,
      canvas,
      animId,
      children: [...node.children]
    };
    this.forwardElements[sourcePeerId] = { video, canvas };
    
    // Send forwarded stream to all children
    node.children.forEach(childId => {
      this.sendForwardToPeer(childId, forwardStream);
    });
    
    this.emit('forwardingStarted', { sourcePeerId, childrenCount: node.children.length });
  },

  /**
   * Update the source stream for an existing forward
   */
  updateForwardStream(sourcePeerId, newStream) {
    const fwd = this.forwardedStreams[sourcePeerId];
    if (!fwd) return;
    
    fwd.sourceStream = newStream;
    fwd.video.srcObject = newStream;
    
    // Update audio track
    const audioTracks = newStream.getAudioTracks();
    if (audioTracks.length > 0) {
      const existingAudio = fwd.stream.getAudioTracks();
      existingAudio.forEach(t => fwd.stream.removeTrack(t));
      fwd.stream.addTrack(audioTracks[0]);
    }
  },

  /**
   * Send a forwarded stream to a specific peer
   */
  sendForwardToPeer(peerId, stream) {
    if (!this.webrtc) return;
    
    const pc = this.webrtc.peerConnections[peerId];
    if (!pc) {
      console.warn('No peer connection for forwarding to:', peerId.slice(0, 8));
      return;
    }
    
    // Add tracks from forwarded stream
    stream.getTracks().forEach(track => {
      const existingSender = pc.getSenders().find(s => s.track?.kind === track.kind && s.track?.label === 'relay');
      if (!existingSender) {
        const sender = pc.addTrack(track, stream);
        console.log('Forwarded track added to peer:', peerId.slice(0, 8), track.kind);
      }
    });
  },

  /**
   * Forward a stream to newly joined children
   */
  forwardToNewChild(childId) {
    Object.entries(this.forwardedStreams).forEach(([sourcePeerId, fwd]) => {
      if (!fwd.children.includes(childId)) {
        fwd.children.push(childId);
        this.sendForwardToPeer(childId, fwd.stream);
      }
    });
  },

  /**
   * Stop forwarding for a specific source peer
   */
  stopForwarding(sourcePeerId) {
    const fwd = this.forwardedStreams[sourcePeerId];
    if (!fwd) return;
    
    if (fwd.animId) cancelAnimationFrame(fwd.animId);
    if (fwd.video) {
      fwd.video.srcObject = null;
      fwd.video.remove();
    }
    if (fwd.canvas) fwd.canvas.remove();
    if (fwd.stream) fwd.stream.getTracks().forEach(t => t.stop());
    
    delete this.forwardedStreams[sourcePeerId];
    delete this.forwardElements[sourcePeerId];
    
    this.emit('forwardingStopped', { sourcePeerId });
  },

  /**
   * Stop all forwarding
   */
  stopAllForwarding() {
    Object.keys(this.forwardedStreams).forEach(sourcePeerId => {
      this.stopForwarding(sourcePeerId);
    });
  },

  /**
   * Get list of peers we are forwarding for
   */
  getForwardingSources() {
    return Object.keys(this.forwardedStreams);
  },

  /**
   * Start bandwidth stats collection
   */
  startStatsCollection() {
    this.statsInterval = setInterval(async () => {
      await this.collectBandwidthStats();
    }, RELAY_CONFIG.bandwidthCheckInterval);
  },

  /**
   * Collect bandwidth statistics for all peers
   */
  async collectBandwidthStats() {
    const connections = this.webrtc.getAllConnections();
    
    for (const [peerId, pc] of Object.entries(connections)) {
      try {
        const stats = await pc.getStats();
        let bytesReceived = 0;
        let bytesSent = 0;
        
        stats.forEach(report => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            bytesReceived += report.bytesReceived || 0;
          }
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            bytesSent += report.bytesSent || 0;
          }
        });
        
        const now = Date.now();
        const prev = this.bandwidthData[peerId] || { timestamp: now, bytesReceived: 0, bytesSent: 0 };
        
        const timeDiff = (now - prev.timestamp) / 1000;
        const downloadMbps = timeDiff > 0 ? ((bytesReceived - prev.bytesReceived) * 8 / timeDiff / 1000000) : 0;
        const uploadMbps = timeDiff > 0 ? ((bytesSent - prev.bytesSent) * 8 / timeDiff / 1000000) : 0;
        
        this.bandwidthData[peerId] = { timestamp: now, bytesReceived, bytesSent, downloadMbps, uploadMbps };
        
        if (this.tree[peerId]) {
          this.tree[peerId].bandwidth = downloadMbps;
          // Only mark as relay by bandwidth if not already a tree-based relay
          if (!this.tree[peerId].isRelay) {
            const thresholdMbps = RELAY_CONFIG.relayThreshold * 8 / 1000000;
            this.tree[peerId].isRelay = downloadMbps > thresholdMbps;
          }
        }
        
        this.emit('bandwidthUpdate', {
          peerId,
          download: downloadMbps,
          upload: uploadMbps
        });
      } catch (error) {
        console.error('Error collecting stats for', peerId, error);
      }
    }
  },

  /**
   * Start periodic tree reorganization
   */
  startTreeReorganization() {
    this.reorgInterval = setInterval(() => {
      this.reorganizeTree();
    }, RELAY_CONFIG.treeReorgInterval);
  },

  /**
   * Reorganize the relay tree based on bandwidth
   */
  reorganizeTree() {
    const nodes = Object.values(this.tree).filter(n => n.id !== this.peerId);
    
    // Orphaned nodes (no parent) get assigned to best parent
    nodes.forEach(node => {
      if (!node.parent) {
        const bestParent = this.findBestParent(node.id);
        if (bestParent && bestParent !== node.parent) {
          this.reconnectChild(node.id, bestParent);
        }
      }
    });
    
    // Check if any node with too many hops should be reorganized
    nodes.forEach(node => {
      if (node.hops > 3 && node.parent) {
        const betterParent = this.findBestParent(node.id);
        if (betterParent && betterParent !== node.parent) {
          this.reconnectChild(node.id, betterParent);
        }
      }
    });
    
    this.emit('treeReorganized', { tree: this.getTree() });
  },

  /**
   * Find best parent for a peer
   * @param {string} peerId - Peer ID
   * @returns {string|null} - Best parent ID
   */
  findBestParent(peerId) {
    const candidates = Object.values(this.tree).filter(n => 
      n.id !== this.peerId && 
      n.id !== peerId &&
      n.children.length < RELAY_CONFIG.maxChildren &&
      n.hops < 3
    );
    
    if (candidates.length === 0) return this.peerId;
    
    // Prefer nodes with fewer hops and higher bandwidth
    candidates.sort((a, b) => {
      if (a.hops !== b.hops) return a.hops - b.hops;
      return (b.bandwidth || 0) - (a.bandwidth || 0);
    });
    return candidates[0].id;
  },

  /**
   * Get relay children for a peer
   * @param {string} peerId - Peer ID
   * @returns {Array<string>} - Array of child peer IDs
   */
  getRelayChildren(peerId) {
    const node = this.tree[peerId];
    return node ? node.children : [];
  },

  /**
   * Check if peer is a relay node
   * @param {string} peerId - Peer ID
   * @returns {boolean}
   */
  isRelay(peerId) {
    const node = this.tree[peerId];
    return node ? node.isRelay : false;
  },

  /**
   * Get hop count for a peer
   * @param {string} peerId - Peer ID
   * @returns {number}
   */
  getHops(peerId) {
    const node = this.tree[peerId];
    return node ? node.hops : -1;
  },

  /**
   * Get the full tree structure
   * @returns {Object}
   */
  getTree() {
    return JSON.parse(JSON.stringify(this.tree));
  },

  /**
   * Get bandwidth data for a peer
   * @param {string} peerId - Peer ID
   * @returns {Object}
   */
  getBandwidth(peerId) {
    return this.bandwidthData[peerId] || { downloadMbps: 0, uploadMbps: 0 };
  },

  /**
   * Get ASCII representation of tree
   * @returns {string}
   */
  getAsciiTree() {
    const buildTree = (nodeId, prefix = '', isLast = true) => {
      const node = this.tree[nodeId];
      if (!node) return '';
      
      const connector = isLast ? '└─ ' : '├─ ';
      const bandwidth = this.bandwidthData[nodeId];
      const bwStr = bandwidth ? ` (↓${bandwidth.downloadMbps.toFixed(1)}Mbps ↑${bandwidth.uploadMbps.toFixed(1)}Mbps)` : '';
      const relayStr = node.isRelay ? ' [RELAY]' : '';
      const hopStr = ` [${node.hops}H]`;
      
      let result = `${prefix}${connector}[${nodeId.substring(0, 8)}]${relayStr}${hopStr}${bwStr}\n`;
      
      node.children.forEach((childId, index) => {
        const childPrefix = prefix + (isLast ? '   ' : '│  ');
        result += buildTree(childId, childPrefix, index === node.children.length - 1);
      });
      
      return result;
    };
    
    return buildTree(this.peerId);
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
   * Destroy relay tree
   */
  destroy() {
    this.stopAllForwarding();
    if (this.statsInterval) clearInterval(this.statsInterval);
    if (this.reorgInterval) clearInterval(this.reorgInterval);
    this.tree = {};
    this.bandwidthData = {};
    this.listeners = {};
    this.forwardedStreams = {};
    this.forwardElements = {};
  }
};

if (typeof window !== 'undefined') {
  window.ShuntCallRelayTree = ShuntCallRelayTree;
}

export { ShuntCallRelayTree };
