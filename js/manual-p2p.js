/**
 * Manual P2P Signaling Module
 * Serverless P2P via URL-encoded offer/answer exchange
 */

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

const ManualP2P = {
  peerId: null,
  peerConnection: null,
  localStream: null,
  onRemoteStream: null,
  onConnectionStateChange: null,
  
  async createRoom(localStream) {
    this.localStream = localStream;
    this.peerId = this.generatePeerId();
    
    this.peerConnection = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10
    });
    
    localStream.getTracks().forEach(track => {
      this.peerConnection.addTrack(track, localStream);
    });
    
    const iceCandidates = [];
    
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        iceCandidates.push(event.candidate.toJSON());
      }
    };
    
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    
    await this.waitForIceGathering();
    
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    
    await this.waitForIceGathering();
    
    const roomData = {
      peerId: this.peerId,
      offer: {
        type: offer.type,
        sdp: offer.sdp
      },
      answer: {
        type: answer.type,
        sdp: answer.sdp
      }
    };
    
    return {
      peerId: this.peerId,
      roomData: btoa(JSON.stringify(roomData))
    };
  },
  
  async joinRoom(localStream, roomDataJson) {
    this.localStream = localStream;
    
    let roomData;
    try {
      roomData = JSON.parse(atob(roomDataJson));
    } catch (e) {
      throw new Error('Invalid room link');
    }
    
    this.peerId = roomData.peerId;
    
    this.peerConnection = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10
    });
    
    localStream.getTracks().forEach(track => {
      this.peerConnection.addTrack(track, localStream);
    });
    
    this.peerConnection.ontrack = (event) => {
      if (this.onRemoteStream) {
        this.onRemoteStream(event.streams[0]);
      }
    };
    
    this.peerConnection.onconnectionstatechange = () => {
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(this.peerConnection.connectionState);
      }
    };
    
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(roomData.offer));
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(roomData.answer));
    
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    
    return this.peerId;
  },
  
  waitForIceGathering() {
    return new Promise((resolve) => {
      if (this.peerConnection.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      
      const checkState = () => {
        if (this.peerConnection.iceGatheringState === 'complete') {
          this.peerConnection.onicecandidate = null;
          resolve();
        }
      };
      
      this.peerConnection.onicecandidate = (event) => {
        if (!event.candidate) {
          checkState();
        }
      };
      
      setTimeout(() => {
        this.peerConnection.onicecandidate = null;
        resolve();
      }, 3000);
    });
  },
  
  generatePeerId() {
    return 'peer_' + Math.random().toString(36).substring(2, 15);
  },
  
  getConnectionState() {
    return this.peerConnection?.connectionState || 'new';
  },
  
  close() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }
};

if (typeof window !== 'undefined') window.ManualP2P = ManualP2P;
if (typeof module !== 'undefined') module.exports = ManualP2P;

console.log('ManualP2P module loaded');
