/**
 * Comprehensive tests for bug fixes and new decentralized features
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';

// ============================================================
// BUG FIX TESTS
// ============================================================

test.describe('Bug Fix: Crypto Secure Room ID Generation', () => {
  test('index.html uses crypto.getRandomValues instead of Math.random', () => {
    const indexHtml = fs.readFileSync('index.html', 'utf-8');
    expect(indexHtml).toContain('crypto.getRandomValues');
    expect(indexHtml).not.toMatch(/Math\.random\(\)/);
  });

  test('generated room IDs are properly formatted', async ({ page }) => {
    await page.goto('/');
    await page.click('#generateId');
    const roomId = await page.inputValue('#createRoomId');
    expect(roomId).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/);
  });
});

test.describe('Bug Fix: fake-peer.js NostrSignaling Reference', () => {
  test('fake-peer.js references NostrSignaling not ShuntCallSignaling', () => {
    const fakePeer = fs.readFileSync('js/fake-peer.js', 'utf-8');
    expect(fakePeer).toContain('NostrSignaling');
    expect(fakePeer).not.toContain('ShuntCallSignaling');
  });
});

test.describe('Bug Fix: handleTrackFailure Logic', () => {
  test('handleTrackFailure searches senders not receivers', () => {
    const webrtc = fs.readFileSync('js/webrtc.js', 'utf-8');
    // Should find sender by track or kind, not receiver
    expect(webrtc).toContain('pc.getSenders().find(s => s.track === track || s.track?.kind === track.kind)');
    expect(webrtc).not.toContain("pc.getReceivers().find(r => r.track === track)");
  });
});

test.describe('Bug Fix: ICE Candidate Buffer Race Condition', () => {
  test('handleIceCandidate initializes buffer before pushing', () => {
    const webrtc = fs.readFileSync('js/webrtc.js', 'utf-8');
    // Both branches should initialize the buffer
    const matches = webrtc.match(/this\.pendingIceCandidates\[peerId\] = this\.pendingIceCandidates\[peerId\] \|\| \[\]/g);
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

test.describe('Bug Fix: Removed optimizeSDP', () => {
  test('optimizeSDP function is removed from webrtc.js', () => {
    const webrtc = fs.readFileSync('js/webrtc.js', 'utf-8');
    expect(webrtc).not.toContain('optimizeSDP');
  });
});

test.describe('Bug Fix: Removed Module-Load console.logs', () => {
  test('crypto.js has no module-load console.log', () => {
    const crypto = fs.readFileSync('js/crypto.js', 'utf-8');
    expect(crypto).not.toContain("console.log('ShuntCallCrypto module loaded')");
  });

  test('relay-tree.js has no module-load console.log', () => {
    const relayTree = fs.readFileSync('js/relay-tree.js', 'utf-8');
    expect(relayTree).not.toContain("console.log('ShuntCallRelayTree module loaded')");
  });

  test('fake-peer.js has no module-load console.log', () => {
    const fakePeer = fs.readFileSync('js/fake-peer.js', 'utf-8');
    expect(fakePeer).not.toContain("console.log('ShuntCallFakePeer module loaded')");
  });
});

test.describe('Bug Fix: room.html uses ShuntCallCrypto.deriveNamespace', () => {
  test('computeRoomTag delegates to ShuntCallCrypto.deriveNamespace', () => {
    const room = fs.readFileSync('room.html', 'utf-8');
    expect(room).toContain('ShuntCallCrypto.deriveNamespace');
    // Should not have duplicate SHA-256 implementation
    const cryptoImpl = room.match(/crypto\.subtle\.digest\('SHA-256'/g);
    // Only one should remain (in the deriveNamespace call), not duplicated
    expect(cryptoImpl).toBeNull();
  });
});

// ============================================================
// FEATURE TESTS: TURN Support
// ============================================================

test.describe('Feature: TURN Server Support', () => {
  test('webrtc.js includes TURN server configuration', () => {
    const webrtc = fs.readFileSync('js/webrtc.js', 'utf-8');
    expect(webrtc).toContain('PUBLIC_TURN_SERVERS');
    expect(webrtc).toContain('turn:');
    expect(webrtc).toContain('enableTurn');
  });

  test('TURN is enabled on reconnect attempts', () => {
    const webrtc = fs.readFileSync('js/webrtc.js', 'utf-8');
    expect(webrtc).toContain('this.enableTurn()');
    expect(webrtc).toContain('turnEnabled');
  });
});

// ============================================================
// FEATURE TESTS: Relay Tree Video Forwarding
// ============================================================

test.describe('Feature: Relay Tree Video Forwarding', () => {
  test('relay-tree.js has forwarding methods', () => {
    const relayTree = fs.readFileSync('js/relay-tree.js', 'utf-8');
    expect(relayTree).toContain('startForwarding');
    expect(relayTree).toContain('stopForwarding');
    expect(relayTree).toContain('stopAllForwarding');
    expect(relayTree).toContain('forwardToNewChild');
    expect(relayTree).toContain('sendForwardToPeer');
    expect(relayTree).toContain('forwardedStreams');
    expect(relayTree).toContain('canvas.captureStream');
  });

  test('room.html integrates relay forwarding on remote stream', () => {
    const room = fs.readFileSync('room.html', 'utf-8');
    expect(room).toContain('startForwarding');
    expect(room).toContain('forwardToNewChild');
  });

  test('relay tree properly cleans up on destroy', () => {
    const relayTree = fs.readFileSync('js/relay-tree.js', 'utf-8');
    expect(relayTree).toContain('stopAllForwarding');
  });
});

// ============================================================
// FEATURE TESTS: Presence Heartbeat
// ============================================================

test.describe('Feature: Presence Heartbeat', () => {
  test('nostr-signaling.js has heartbeat functionality', () => {
    const signaling = fs.readFileSync('js/nostr-signaling.js', 'utf-8');
    expect(signaling).toContain('HEARTBEAT_INTERVAL');
    expect(signaling).toContain('PEER_TIMEOUT');
    expect(signaling).toContain('startHeartbeat');
    expect(signaling).toContain('sendHeartbeat');
    expect(signaling).toContain('startPeerTimeoutCheck');
    expect(signaling).toContain('checkPeerTimeouts');
    expect(signaling).toContain('knownPeers');
  });

  test('heartbeat type is handled in incoming events', () => {
    const signaling = fs.readFileSync('js/nostr-signaling.js', 'utf-8');
    expect(signaling).toContain("data.type === 'heartbeat'");
    expect(signaling).toContain("data.type === 'leave'");
  });

  test('room.html handles peer timeout events', () => {
    const room = fs.readFileSync('room.html', 'utf-8');
    expect(room).toContain('peerTimedOut');
    expect(room).toContain('peerLeft');
    expect(room).toContain('beforeunload');
    expect(room).toContain('broadcastLeave');
  });
});

// ============================================================
// FEATURE TESTS: Nostr Event Signature Verification
// ============================================================

test.describe('Feature: Nostr Event Signature Verification', () => {
  test('nostr-signaling.js has signature verification', () => {
    const signaling = fs.readFileSync('js/nostr-signaling.js', 'utf-8');
    expect(signaling).toContain('verifyEventSignature');
    expect(signaling).toContain('NostrTools.verifyEvent');
    expect(signaling).toContain('NostrTools.getEventHash');
  });

  test('events are verified before processing', () => {
    const signaling = fs.readFileSync('js/nostr-signaling.js', 'utf-8');
    expect(signaling).toContain('verifyEventSignature(event)');
    expect(signaling).toContain('verification FAILED');
  });
});

// ============================================================
// FEATURE TESTS: Peer Nicknames
// ============================================================

test.describe('Feature: Peer Nicknames', () => {
  test('room.html has nickname input field', () => {
    const room = fs.readFileSync('room.html', 'utf-8');
    expect(room).toContain('nicknameInput');
    expect(room).toContain('Set nickname');
  });

  test('nostr-signaling.js has nickname broadcasting', () => {
    const signaling = fs.readFileSync('js/nostr-signaling.js', 'utf-8');
    expect(signaling).toContain('setNickname');
    expect(signaling).toContain("data.type === 'nickname'");
  });

  test('room.html has nickname event handlers', () => {
    const room = fs.readFileSync('room.html', 'utf-8');
    expect(room).toContain('updatePeerNickname');
    expect(room).toContain('nickname-${peerId}');
  });
});

// ============================================================
// FEATURE TESTS: Session Reconnect
// ============================================================

test.describe('Feature: Session Reconnect via SessionStorage', () => {
  test('room.html has session save/restore methods', () => {
    const room = fs.readFileSync('room.html', 'utf-8');
    expect(room).toContain('saveSessionState');
    expect(room).toContain('restoreSessionState');
    expect(room).toContain("sessionStorage.setItem('shuntcall_session'");
    expect(room).toContain("sessionStorage.getItem('shuntcall_session'");
  });

  test('session has timestamp for expiry check', () => {
    const room = fs.readFileSync('room.html', 'utf-8');
    expect(room).toContain('timestamp: Date.now()');
    expect(room).toContain('300000');
  });
});

// ============================================================
// FEATURE TESTS: File Sharing
// ============================================================

test.describe('Feature: File Sharing via DataChannel', () => {
  test('room.html has file sharing button', () => {
    const room = fs.readFileSync('room.html', 'utf-8');
    expect(room).toContain('shareFile');
    expect(room).toContain('Share File');
  });

  test('room.html has file transfer methods', () => {
    const room = fs.readFileSync('room.html', 'utf-8');
    expect(room).toContain('sendFile');
    expect(room).toContain('handleFileOffer');
    expect(room).toContain('handleFileChunk');
    expect(room).toContain('file-offer');
    expect(room).toContain('file-chunk');
  });

  test('file transfer uses chunked sending', () => {
    const room = fs.readFileSync('room.html', 'utf-8');
    expect(room).toContain('CHUNK_SIZE');
    expect(room).toContain('chunkIndex');
  });
});

// ============================================================
// FEATURE TESTS: E2E Chat Encryption
// ============================================================

test.describe('Feature: End-to-End Chat Encryption', () => {
  test('room.html derives encryption key from password', () => {
    const room = fs.readFileSync('room.html', 'utf-8');
    expect(room).toContain('deriveEncryptionKey');
    expect(room).toContain('AES-GCM');
    expect(room).toContain('PBKDF2');
    expect(room).toContain('256');
  });

  test('room.html has encrypt/decrypt methods', () => {
    const room = fs.readFileSync('room.html', 'utf-8');
    expect(room).toContain('encryptMessage');
    expect(room).toContain('decryptMessage');
  });

  test('chat messages are encrypted before sending', () => {
    const room = fs.readFileSync('room.html', 'utf-8');
    expect(room).toContain('await this.encryptMessage');
    expect(room).toContain('await this.decryptMessage');
  });
});

// ============================================================
// FEATURE TESTS: Connection Quality Overlay
// ============================================================

test.describe('Feature: Connection Quality Overlay', () => {
  test('room.html has quality badge CSS classes', () => {
    const room = fs.readFileSync('room.html', 'utf-8');
    expect(room).toContain('quality-badge');
    expect(room).toContain('quality-good');
    expect(room).toContain('quality-medium');
    expect(room).toContain('quality-poor');
  });
});

// ============================================================
// FEATURE TESTS: Mobile Responsive
// ============================================================

test.describe('Feature: Mobile Responsive Layout', () => {
  test('room.html has mobile media queries', () => {
    const room = fs.readFileSync('room.html', 'utf-8');
    expect(room).toContain('@media (max-width: 768px)');
    expect(room).toContain('@media (max-width: 480px)');
  });

  test('room.html has responsive toolbar sizing', () => {
    const room = fs.readFileSync('room.html', 'utf-8');
    expect(room).toContain('44px');
    expect(room).toContain('40px');
  });
});

// ============================================================
// FEATURE TESTS: Nostr Relay Health
// ============================================================

test.describe('Feature: Nostr Relay Health Check', () => {
  test('nostr.js tracks relay health metrics', () => {
    const nostr = fs.readFileSync('js/nostr.js', 'utf-8');
    expect(nostr).toContain('relayHealth');
    expect(nostr).toContain('messagesReceived');
    expect(nostr).toContain('messagesSent');
    expect(nostr).toContain('errors');
    expect(nostr).toContain('reconnects');
  });

  test('getStatus includes relay health', () => {
    const nostr = fs.readFileSync('js/nostr.js', 'utf-8');
    expect(nostr).toContain('relayHealth: { ...this.relayHealth }');
  });
});

// ============================================================
// INTEGRATION TESTS
// ============================================================

test.describe('Integration: Module Loading', () => {
  test('all modules load on index page', async ({ page }) => {
    await page.goto('/');
    const modules = await page.evaluate(() => ({
      crypto: typeof window.ShuntCallCrypto,
      nostr: typeof window.Nostr,
      signaling: typeof window.NostrSignaling,
      webrtc: typeof window.ShuntCallWebRTC
    }));
    expect(modules.crypto).toBe('object');
    expect(modules.nostr).toBe('object');
    expect(modules.signaling).toBe('object');
    expect(modules.webrtc).toBe('object');
  });

  test('all modules load on room page', async ({ page }) => {
    await page.goto('/room.html?room=test-integration');
    await page.waitForTimeout(2000);
    const modules = await page.evaluate(() => ({
      crypto: typeof window.ShuntCallCrypto,
      nostr: typeof window.Nostr,
      signaling: typeof window.NostrSignaling,
      webrtc: typeof window.ShuntCallWebRTC,
      relayTree: typeof window.ShuntCallRelayTree
    }));
    expect(modules.crypto).toBe('object');
    expect(modules.nostr).toBe('object');
    expect(modules.signaling).toBe('object');
    expect(modules.webrtc).toBe('object');
    expect(modules.relayTree).toBe('object');
  });
});

test.describe('Integration: Room Creation Flow', () => {
  test('can create room with secure ID generation', async ({ page }) => {
    await page.goto('/');
    
    await page.evaluate(() => {
      window._getUserMediaCalled = false;
      const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        window._getUserMediaCalled = true;
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const stream = canvas.captureStream(30);
        try {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const dest = ctx.createMediaStreamDestination();
          osc.connect(dest);
          osc.start();
          dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
        } catch(e) {}
        return stream;
      };
    });
    
    await page.click('#generateId');
    await page.fill('#createPassword', 'test-password-123');
    await page.click('button[type="submit"]');
    
    await page.waitForTimeout(3000);
    
    const shareLink = await page.inputValue('#shareLink');
    expect(shareLink).toContain('room.html?room=');
    expect(shareLink).not.toContain('password');
    
    const displayedPassword = await page.inputValue('#displayPassword');
    expect(displayedPassword).toBe('test-password-123');
  });
});

test.describe('Integration: WebRTC Module', () => {
  test('WebRTC module has all required methods after fixes', async ({ page }) => {
    await page.goto('/room.html?room=test-methods');
    await page.waitForTimeout(2000);
    
    const methods = await page.evaluate(() => {
      const w = window.ShuntCallWebRTC;
      return {
        init: typeof w.init,
        createPeerConnection: typeof w.createPeerConnection,
        handleOffer: typeof w.handleOffer,
        handleAnswer: typeof w.handleAnswer,
        handleIceCandidate: typeof w.handleIceCandidate,
        addLocalTrack: typeof w.addLocalTrack,
        removeLocalTrack: typeof w.removeLocalTrack,
        setVideoQuality: typeof w.setVideoQuality,
        enableTurn: typeof w.enableTurn,
        verifyTracks: typeof w.verifyTracks,
        handleTrackFailure: typeof w.handleTrackFailure
      };
    });
    
    for (const [method, type] of Object.entries(methods)) {
      expect(type, `Method ${method} should be a function`).toBe('function');
    }
  });
});

test.describe('Integration: Relay Tree Module', () => {
  test('Relay tree has forwarding capabilities', async ({ page }) => {
    await page.goto('/room.html?room=test-relay');
    await page.waitForTimeout(2000);
    
    const methods = await page.evaluate(() => {
      const rt = window.ShuntCallRelayTree;
      return {
        init: typeof rt.init,
        addPeer: typeof rt.addPeer,
        removePeer: typeof rt.removePeer,
        startForwarding: typeof rt.startForwarding,
        stopForwarding: typeof rt.stopForwarding,
        stopAllForwarding: typeof rt.stopAllForwarding,
        forwardToNewChild: typeof rt.forwardToNewChild,
        getAsciiTree: typeof rt.getAsciiTree,
        getTree: typeof rt.getTree,
        isRelay: typeof rt.isRelay,
        getHops: typeof rt.getHops,
        getBandwidth: typeof rt.getBandwidth,
        destroy: typeof rt.destroy
      };
    });
    
    for (const [method, type] of Object.entries(methods)) {
      expect(type, `Method ${method} should be a function`).toBe('function');
    }
  });
});

test.describe('Integration: NostrSignaling Module', () => {
  test('NostrSignaling has heartbeat and verification', async ({ page }) => {
    await page.goto('/room.html?room=test-signaling');
    await page.waitForTimeout(2000);
    
    const methods = await page.evaluate(() => {
      const ns = window.NostrSignaling;
      return {
        init: typeof ns.init,
        broadcastPresence: typeof ns.broadcastPresence,
        sendOffer: typeof ns.sendOffer,
        sendAnswer: typeof ns.sendAnswer,
        sendIceCandidate: typeof ns.sendIceCandidate,
        broadcastLeave: typeof ns.broadcastLeave,
        setNickname: typeof ns.setNickname,
        sendHeartbeat: typeof ns.sendHeartbeat,
        verifyEventSignature: typeof ns.verifyEventSignature,
        getStatus: typeof ns.getStatus,
        destroy: typeof ns.destroy
      };
    });
    
    for (const [method, type] of Object.entries(methods)) {
      expect(type, `Method ${method} should be a function`).toBe('function');
    }
  });
});
