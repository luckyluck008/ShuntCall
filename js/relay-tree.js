/**
 * Relay Tree Module
 * Bandwidth measurement and tree-based forwarding
 */

const RELAY_CONFIG = {
  maxChildren: 3,
  bandwidthCheckInterval: 5000,
  treeReorgInterval: 30000,
  relayThreshold: 2 * 1024 * 1024
};

const ShuntCallRelayTree = {
  peerId: null,
  webrtc: null,
  tree: {},
  bandwidthData: {},
  statsInterval: null,
  reorgInterval: null,
  listeners: {},

  /**
   * Initialize relay tree
   * @param {string} peerId - Our peer ID
   * @param {object} webrtc - WebRTC module instance
   */
  init(peerId, webrtc) {
    this.peerId = peerId;
    this.webrtc = webrtc;
    
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
        newParent.children.push(childId);
      }
    }
    
    this.emit('peerReconnected', { peerId: childId, newParentId });
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
          this.tree[peerId].isRelay = downloadMbps > (RELAY_CONFIG.relayThreshold / 1000000);
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
    
    nodes.forEach(node => {
      if (!node.parent) {
        const bestParent = this.findBestParent(node.id);
        if (bestParent && bestParent !== node.parent) {
          this.reconnectChild(node.id, bestParent);
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
    
    candidates.sort((a, b) => a.hops - b.hops);
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
    if (this.statsInterval) clearInterval(this.statsInterval);
    if (this.reorgInterval) clearInterval(this.reorgInterval);
    this.tree = {};
    this.bandwidthData = {};
    this.listeners = {};
  }
};

if (typeof window !== 'undefined') {
  window.ShuntCallRelayTree = ShuntCallRelayTree;
}

export { ShuntCallRelayTree };
console.log('ShuntCallRelayTree module loaded');
