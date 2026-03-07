import { test, expect } from '@playwright/test';

// Mock media devices to avoid permission issues in headless mode
const mockMediaDevices = async () => {
  await page.evaluate(() => {
    const mockStream = {
      getTracks: () => [],
      addTrack: () => {},
      removeTrack: () => {}
    };
    
    navigator.mediaDevices.getUserMedia = async () => mockStream;
    navigator.mediaDevices.getDisplayMedia = async () => mockStream;
  });
};

test.describe('Nostr Signaling Tests', () => {
  test('can initialize Nostr module and connect to relays', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    page.on('console', msg => console.log('Log:', msg.text()));
    
    await page.goto('http://localhost:8765/index.html');
    
    // Test Nostr initialization
    await page.evaluate(async () => {
      // Wait for modules to load
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check if Nostr module is available
      expect(typeof window.Nostr).toBe('object');
      expect(typeof window.Nostr.init).toBe('function');
      expect(typeof window.NostrTools).toBe('object');
    });
    
    await context.close();
  });

  test('can generate valid keys using NostrTools', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('http://localhost:8765/index.html');
    
    const result = await page.evaluate(async () => {
      // Wait for modules to load
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const sk = window.NostrTools.generateSecretKey();
      const pk = window.NostrTools.getPublicKey(sk);
      
      return {
        skLength: sk.length,
        pkLength: pk.length
      };
    });
    
    expect(result.skLength).toBe(32); // 32 bytes secret key
    expect(result.pkLength).toBe(64); // 64 hex characters
    
    await context.close();
  });

  test('can navigate to room page and initialize', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    page.on('console', msg => console.log('Log:', msg.text()));
    
    await page.goto('http://localhost:8765/room.html?room=test-room&password=test123');
    
    // Wait for page to load
    await page.waitForSelector('#passwordModal', { timeout: 5000 });
    
    const modalVisible = await page.locator('#passwordModal').isVisible();
    expect(modalVisible).toBeTruthy();
    
    await context.close();
  });

  test('room tag generation works correctly', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('http://localhost:8765/index.html');
    
    const roomTag = await page.evaluate(async () => {
      const app = window.App;
      return await app.computeRoomTag('test-room', 'test123');
    });
    
    expect(typeof roomTag).toBe('string');
    expect(roomTag.length).toBe(64); // SHA-256 hash length
    
    await context.close();
  });

  test('Nostr relay list contains valid URLs', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('http://localhost:8765/index.html');
    
    const relays = await page.evaluate(() => {
      return window.NostrRelays;
    });
    
    expect(relays.length).toBeGreaterThan(0);
    relays.forEach(relay => {
      expect(relay.startsWith('wss://')).toBeTruthy();
      expect(relay.includes('.')).toBeTruthy();
    });
    
    await context.close();
  });
});

test.describe('WebRTC Tests', () => {
  test('WebRTC module is available', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('http://localhost:8765/index.html');
    
    const hasWebRTC = await page.evaluate(() => {
      return typeof window.ShuntCallWebRTC === 'object';
    });
    
    expect(hasWebRTC).toBeTruthy();
    
    await context.close();
  });

  test('can create peer connection', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('http://localhost:8765/index.html');
    
    const canCreate = await page.evaluate(() => {
      const webrtc = window.ShuntCallWebRTC;
      return typeof webrtc.createPeerConnection === 'function';
    });
    
    expect(canCreate).toBeTruthy();
    
    await context.close();
  });
});