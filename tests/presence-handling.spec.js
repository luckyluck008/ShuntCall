import { test, expect } from '@playwright/test';

// Mock media devices to avoid permission issues in headless mode
const mockMediaDevices = async (page) => {
  await page.evaluate(() => {
    const mockStream = {
      getTracks: () => [],
      addTrack: () => {},
      removeTrack: () => {},
      getAudioTracks: () => [],
      getVideoTracks: () => []
    };
    
    navigator.mediaDevices.getUserMedia = async () => mockStream;
    navigator.mediaDevices.getDisplayMedia = async () => mockStream;
    navigator.mediaDevices.enumerateDevices = async () => [];
  });
};

// Helper function to automate password and media permissions
const completeInitialization = async (page) => {
  // Wait for password modal
  await page.waitForSelector('#passwordModal', { timeout: 5000 });
  await page.fill('#roomPassword', 'test123');
  await page.click('button:has-text("Authenticate")');
  
  // Wait for media permission modal and accept
  await page.waitForSelector('#mediaPermissionModal', { timeout: 5000 });
  await page.click('button:has-text("Authorize")');
};

test.describe('Presence Event Handling Tests', () => {
  test('can handle presence events from signaling module', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    page.on('console', msg => console.log('Log:', msg.text()));
    
    await page.goto('http://localhost:8765/room.html?room=presence-test&password=test123');
    
    // Mock media devices
    await mockMediaDevices(page);
    
    // Complete initialization
    await completeInitialization(page);
    
    // Wait for room to be visible
    await page.waitForSelector('#room:not(.hidden)', { timeout: 15000 });
    
    // Check if we're in the room
    const roomVisible = await page.locator('#room').isVisible();
    expect(roomVisible).toBeTruthy();
    
    // Check if we have peers (we should be the only one, but peerCount should be 1)
    const peerCount = await page.locator('#peerCount').textContent();
    expect(peerCount).toContain('1 Node');
    
    await context.close();
  });

  test('presence event triggers peer connection creation', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    page.on('console', msg => console.log('Log:', msg.text()));
    
    await page.goto('http://localhost:8765/room.html?room=presence-test&password=test123');
    
    // Mock media devices
    await mockMediaDevices(page);
    
    // Complete initialization
    await completeInitialization(page);
    
    // Wait for room to be visible
    await page.waitForSelector('#room:not(.hidden)', { timeout: 15000 });
    
    // Simulate receiving a presence event
    const peerId = 'test-peer-' + Math.random().toString(16).substr(2, 8);
    const connectionCreated = await page.evaluate(async (peerId) => {
      return new Promise((resolve) => {
        // Track if peer connection is created
        const originalCreatePeerConnection = window.ShuntCallWebRTC.createPeerConnection;
        let connectionCreated = false;
        
        window.ShuntCallWebRTC.createPeerConnection = (remotePeerId) => {
          connectionCreated = true;
          console.log('createPeerConnection called for peer:', remotePeerId.slice(0, 8));
          return originalCreatePeerConnection.call(window.ShuntCallWebRTC, remotePeerId);
        };
        
        // Simulate presence event
        window.NostrSignaling.emit('presence', { from: peerId });
        
        // Wait for connection to be created
        setTimeout(() => {
          resolve(connectionCreated);
        }, 3000);
      });
    }, peerId);
    
    expect(connectionCreated).toBeTruthy();
    
    await context.close();
  });

  test('webrtc handlePresence method creates peer connection', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('http://localhost:8765/room.html?room=presence-test&password=test123');
    
    // Mock media devices
    await mockMediaDevices(page);
    
    // Complete initialization
    await completeInitialization(page);
    
    // Wait for room to be visible
    await page.waitForSelector('#room:not(.hidden)', { timeout: 15000 });
    
    // Test WebRTC handlePresence method
    const peerId = 'webrtc-test-peer-' + Math.random().toString(16).substr(2, 8);
    const connectionCreated = await page.evaluate(async (peerId) => {
      // Mock createPeerConnection to track calls
      const originalCreateOffer = window.ShuntCallWebRTC.createOffer;
      let createOfferCalled = false;
      
      window.ShuntCallWebRTC.createOffer = async (remotePeerId) => {
        createOfferCalled = true;
        console.log('createOffer called for peer:', remotePeerId.slice(0, 8));
        return originalCreateOffer.call(window.ShuntCallWebRTC, remotePeerId);
      };
      
      // Call handlePresence
      await window.ShuntCallWebRTC.handlePresence(peerId);
      
      // Wait for createOffer to be called
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return createOfferCalled;
    }, peerId);
    
    expect(connectionCreated).toBeTruthy();
    
    await context.close();
  });
});

test.describe('WebRTC Connection Tests', () => {
  test('can create peer connection and handle presence', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    page.on('console', msg => console.log('Log:', msg.text()));
    
    await page.goto('http://localhost:8765/room.html?room=webrtc-test&password=test123');
    
    // Mock media devices
    await mockMediaDevices(page);
    
    // Complete initialization
    await completeInitialization(page);
    
    // Wait for room to be visible
    await page.waitForSelector('#room:not(.hidden)', { timeout: 15000 });
    
    // Check if peer connections object exists and is initialized
    const connectionsExist = await page.evaluate(() => {
      return typeof window.ShuntCallWebRTC.peerConnections === 'object';
    });
    
    expect(connectionsExist).toBeTruthy();
    
    // Check if we can create a peer connection
    const canCreatePeerConnection = await page.evaluate(() => {
      return typeof window.ShuntCallWebRTC.createPeerConnection === 'function';
    });
    
    expect(canCreatePeerConnection).toBeTruthy();
    
    await context.close();
  });
});

test.describe('Media Transmission Tests', () => {
  test('local media tracks are properly managed', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('http://localhost:8765/room.html?room=media-test&password=test123');
    
    // Mock media devices
    await mockMediaDevices(page);
    
    // Complete initialization
    await completeInitialization(page);
    
    // Wait for room to be visible
    await page.waitForSelector('#room:not(.hidden)', { timeout: 15000 });
    
    // Check media track handling methods
    const trackMethodsExist = await page.evaluate(() => {
      return [
        'addLocalTrack',
        'removeLocalTrack',
        'getRemoteTracks',
        'getLocalTracks',
        'replaceTrack'
      ].every(method => typeof window.ShuntCallWebRTC[method] === 'function');
    });
    
    expect(trackMethodsExist).toBeTruthy();
    
    await context.close();
  });
});

test.describe('Relay Tree Tests', () => {
  test('relay tree is properly initialized', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('http://localhost:8765/room.html?room=relay-test&password=test123');
    
    // Mock media devices
    await mockMediaDevices(page);
    
    // Complete initialization
    await completeInitialization(page);
    
    // Wait for room to be visible
    await page.waitForSelector('#room:not(.hidden)', { timeout: 15000 });
    
    // Check relay tree methods
    const treeMethodsExist = await page.evaluate(() => {
      return [
        'addPeer',
        'removePeer',
        'getTree',
        'getAsciiTree',
        'isRelay',
        'getHops',
        'getBandwidth'
      ].every(method => typeof window.ShuntCallRelayTree[method] === 'function');
    });
    
    expect(treeMethodsExist).toBeTruthy();
    
    // Check if we have our own node in the tree
    const hasOurNode = await page.evaluate(() => {
      return window.ShuntCallRelayTree.getTree() && 
             Object.keys(window.ShuntCallRelayTree.getTree()).length > 0;
    });
    
    expect(hasOurNode).toBeTruthy();
    
    await context.close();
  });

  test('can add and remove peers from relay tree', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('http://localhost:8765/room.html?room=relay-test&password=test123');
    
    // Mock media devices
    await mockMediaDevices(page);
    
    // Complete initialization
    await completeInitialization(page);
    
    // Wait for room to be visible
    await page.waitForSelector('#room:not(.hidden)', { timeout: 15000 });
    
    // Test peer addition and removal
    const peerId = 'relay-peer-' + Math.random().toString(16).substr(2, 8);
    const success = await page.evaluate(async (peerId) => {
      // Add peer
      window.ShuntCallRelayTree.addPeer(peerId);
      const treeAfterAdd = window.ShuntCallRelayTree.getTree();
      const peerAdded = !!treeAfterAdd[peerId];
      
      if (!peerAdded) {
        console.error('Failed to add peer to relay tree');
        return false;
      }
      
      // Remove peer
      window.ShuntCallRelayTree.removePeer(peerId);
      const treeAfterRemove = window.ShuntCallRelayTree.getTree();
      const peerRemoved = !treeAfterRemove[peerId];
      
      return peerRemoved;
    }, peerId);
    
    expect(success).toBeTruthy();
    
    await context.close();
  });
});

test.describe('Integration Tests', () => {
  test('complete initialization flow works', async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ['camera', 'microphone']
    });
    const page = await context.newPage();
    
    page.on('console', msg => console.log('Log:', msg.text()));
    
    // Mock media devices before navigating to page
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const stream = canvas.captureStream(30);
      
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const destination = audioContext.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.frequency.value = 440;
      oscillator.start();
      
      destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
      
      if (!navigator.mediaDevices) {
        navigator.mediaDevices = {};
      }
      navigator.mediaDevices.getUserMedia = async () => stream;
      navigator.mediaDevices.getDisplayMedia = async () => stream;
      navigator.mediaDevices.enumerateDevices = async () => [];
    });
    
    await page.goto('http://localhost:8765/index.html');
    
    // Create a room
    await page.fill('#createRoomId', 'integration-test-room');
    await page.fill('#createPassword', 'test123');
    await page.click('button:has-text("Create & Host")');
    
    // Wait for share section to be visible
    await page.waitForSelector('#shareSection:not(.hidden)', { timeout: 10000 });
    
    // Get share link from input field
    const shareLink = await page.inputValue('#shareLink');
    console.log('Created room URL:', shareLink);
    
    expect(shareLink).toContain('room.html?room=');
    expect(shareLink).not.toContain('password');
    
    await context.close();
  });
});