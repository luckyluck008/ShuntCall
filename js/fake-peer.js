/**
 * Fake Peer Module
 * Testing utilities with canvas video and synthetic audio
 */

const ShuntCallFakePeer = {
  canvas: null,
  ctx: null,
  stream: null,
  animationId: null,
  audioContext: null,
  oscillator: null,
  roomId: null,
  namespace: null,
  peerId: null,
  isFake: false,

  /**
   * Initialize fake peer with canvas stream
   * @param {string} roomId - Room ID to join
   * @param {string} namespace - Room namespace (hash)
   */
  async init(roomId, namespace) {
    this.roomId = roomId;
    this.namespace = namespace;
    this.peerId = ShuntCallCrypto.generatePeerId();
    this.isFake = true;
    
    await this.createCanvasStream();
    this.createSyntheticAudio();
    
    this.startCanvasAnimation();
    this.connectToSignaling();
    
    console.log('ShuntCallFakePeer initialized:', this.peerId);
    return this;
  },

  /**
   * Create canvas-based video stream
   */
  async createCanvasStream() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640;
    this.canvas.height = 480;
    this.ctx = this.canvas.getContext('2d');
    
    this.stream = this.canvas.captureStream(30);
    
    const fakeCanvas = document.createElement('canvas');
    fakeCanvas.width = 640;
    fakeCanvas.height = 480;
    fakeCanvas.style.display = 'none';
    document.body.appendChild(fakeCanvas);
  },

  /**
   * Create synthetic audio using oscillator
   */
  createSyntheticAudio() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      this.oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      this.oscillator.type = 'sine';
      this.oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime);
      
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.1, this.audioContext.currentTime + 0.5);
      
      this.oscillator.connect(gainNode);
      
      const dest = this.audioContext.createMediaStreamDestination();
      gainNode.connect(dest);
      
      this.stream.addTrack(dest.stream.getAudioTracks()[0]);
      
      this.oscillator.start();
      
      this.modulateFrequency();
    } catch (error) {
      console.warn('Could not create synthetic audio:', error);
    }
  },

  /**
   * Modulate frequency for visual feedback
   */
  modulateFrequency() {
    if (!this.oscillator || !this.audioContext) return;
    
    const baseFreq = 440;
    const variation = Math.sin(Date.now() / 1000) * 100;
    this.oscillator.frequency.setValueAtTime(
      baseFreq + variation,
      this.audioContext.currentTime
    );
    
    setTimeout(() => this.modulateFrequency(), 100);
  },

  /**
   * Start canvas animation
   */
  startCanvasAnimation() {
    let frameCount = 0;
    
    const draw = () => {
      frameCount++;
      
      const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);
      gradient.addColorStop(0, `hsl(${(frameCount * 2) % 360}, 70%, 20%)`);
      gradient.addColorStop(1, `hsl(${(frameCount * 2 + 120) % 360}, 70%, 30%)`);
      
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 48px system-ui';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('Fake Peer', this.canvas.width / 2, this.canvas.height / 2 - 30);
      
      this.ctx.font = '24px system-ui';
      this.ctx.fillText(this.peerId.substring(0, 8), this.canvas.width / 2, this.canvas.height / 2 + 30);
      
      this.ctx.strokeStyle = '#6366f1';
      this.ctx.lineWidth = 3;
      const time = Date.now() / 1000;
      for (let i = 0; i < 5; i++) {
        const x = this.canvas.width / 2 + Math.sin(time * 2 + i * 0.5) * 100;
        const y = this.canvas.height / 2 + Math.cos(time * 2 + i * 0.5) * 60;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 10, 0, Math.PI * 2);
        this.ctx.stroke();
      }
      
      this.animationId = requestAnimationFrame(draw);
    };
    
    draw();
  },

  /**
   * Connect to signaling
   */
  async connectToSignaling() {
    this.signaling = await ShuntCallSignaling.init(this.namespace, this.peerId);
    
    this.signaling.on('offer', async (data) => {
      await this.handleOffer(data.from, JSON.parse(data.sdp));
    });
    
    this.signaling.on('answer', async (data) => {
      await this.handleAnswer(data.from, JSON.parse(data.sdp));
    });
    
    this.signaling.on('ice', async (data) => {
      await this.handleIceCandidate(data.from, JSON.parse(data.candidate));
    });
  },

  /**
   * Handle incoming offer
   */
  async handleOffer(fromPeerId, sdp) {
    let pc = this.peerConnections?.[fromPeerId];
    if (!pc) {
      pc = this.createPeerConnection(fromPeerId);
    }
    
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    this.signaling.sendAnswer(fromPeerId, answer);
  },

  /**
   * Handle incoming answer
   */
  async handleAnswer(fromPeerId, sdp) {
    const pc = this.peerConnections?.[fromPeerId];
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  },

  /**
   * Handle incoming ICE candidate
   */
  async handleIceCandidate(fromPeerId, candidate) {
    const pc = this.peerConnections?.[fromPeerId];
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  },

  /**
   * Create peer connection
   */
  createPeerConnection(remotePeerId) {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
      ]
    });
    
    this.stream.getTracks().forEach(track => {
      pc.addTrack(track, this.stream);
    });
    
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.sendIceCandidate(remotePeerId, event.candidate);
      }
    };
    
    pc.ontrack = (event) => {
      console.log('Received track from', remotePeerId);
    };
    
    if (!this.peerConnections) {
      this.peerConnections = {};
    }
    this.peerConnections[remotePeerId] = pc;
    
    return pc;
  },

  /**
   * Open fake peer in new window
   */
  static openFakePeer(roomId, namespace) {
    const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/');
    const fakeUrl = `${baseUrl}room.html?room=${encodeURIComponent(roomId)}&hash=${namespace}&fake=true`;
    window.open(fakeUrl, '_blank', 'width=800,height=600');
  },

  /**
   * Check if this is a fake peer request
   */
  static isFakeRequest() {
    const params = new URLSearchParams(window.location.search);
    return params.get('fake') === 'true';
  },

  /**
   * Destroy fake peer
   */
  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.oscillator) {
      this.oscillator.stop();
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    if (this.canvas) {
      this.canvas.remove();
    }
    if (this.signaling) {
      this.signaling.destroy();
    }
    if (this.peerConnections) {
      Object.values(this.peerConnections).forEach(pc => pc.close());
    }
  }
};

if (typeof window !== 'undefined') {
  window.ShuntCallFakePeer = ShuntCallFakePeer;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ShuntCallFakePeer;
}

console.log('ShuntCallFakePeer module loaded');
