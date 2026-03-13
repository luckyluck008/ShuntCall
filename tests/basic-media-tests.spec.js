import { test, expect } from '@playwright/test';

// Helper to log console messages
const setupConsoleLogging = (page, label) => {
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error(`[${label} ERROR]:`, msg.text());
    } else if (msg.type() === 'warning') {
      console.warn(`[${label} WARN]:`, msg.text());
    } else {
      console.log(`[${label}]:`, msg.text());
    }
  });
};

// Simple mock for media devices
const simpleMockMediaDevices = async (page) => {
  await page.evaluate(() => {
    // Create simple mock stream with track stop method
    const mockTrack = {
      kind: 'video',
      readyState: 'live',
      enabled: true,
      stop: () => {}
    };
    
    const mockStream = {
      getTracks: () => [mockTrack],
      addTrack: () => {},
      removeTrack: () => {},
      getAudioTracks: () => [],
      getVideoTracks: () => [mockTrack]
    };
    
    if (!navigator.mediaDevices) {
      navigator.mediaDevices = {};
    }
    
    navigator.mediaDevices.getUserMedia = async () => {
      return new Promise((resolve) => {
        setTimeout(() => resolve(mockStream), 100);
      });
    };
    
    navigator.mediaDevices.getDisplayMedia = async () => mockStream;
    navigator.mediaDevices.enumerateDevices = async () => [];
  });
};

test.describe('Basic Media and Connection Tests', () => {
  test('should load modules and create room', async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ['camera', 'microphone']
    });
    
    const page = await context.newPage();
    setupConsoleLogging(page, 'Test');
    
    await page.goto('http://localhost:8765/index.html');
    await simpleMockMediaDevices(page);
    
    // Check if modules are loaded
    const modulesLoaded = await page.evaluate(async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      return {
        shuntcallCrypto: !!window.ShuntCallCrypto,
        shuntcallWebRTC: !!window.ShuntCallWebRTC,
        nostrSignaling: !!window.NostrSignaling,
        nostr: !!window.Nostr
      };
    });
    
    expect(modulesLoaded.shuntcallCrypto).toBeTruthy();
    expect(modulesLoaded.shuntcallWebRTC).toBeTruthy();
    expect(modulesLoaded.nostrSignaling).toBeTruthy();
    expect(modulesLoaded.nostr).toBeTruthy();
    
    // Create a simple room
    await page.fill('#createRoomId', 'simple-test-room');
    await page.fill('#createPassword', 'test123');
    await page.click('button:has-text("Create & Host")');
    
    // Wait for loading and share section
    await page.waitForSelector('#loadingSection', { timeout: 3000 });
    await page.waitForSelector('#shareSection:not(.hidden)', { timeout: 5000 });
    
    // Check if share link is generated
    const shareLink = await page.inputValue('#shareLink');
    expect(shareLink).toContain('room.html?room=');
    expect(shareLink).not.toContain('password');
    
    console.log('Room created successfully:', shareLink);
    
    await context.close();
  });
  
  test('WebRTC module should have track management functions', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('http://localhost:8765/index.html');
    
    const hasRequiredMethods = await page.evaluate(() => {
      return typeof window.ShuntCallWebRTC === 'object' &&
             typeof window.ShuntCallWebRTC.init === 'function' &&
             typeof window.ShuntCallWebRTC.createPeerConnection === 'function' &&
             typeof window.ShuntCallWebRTC.addLocalStream === 'function' &&
             typeof window.ShuntCallWebRTC.verifyTracks === 'function' &&
             typeof window.ShuntCallWebRTC.handleTrackFailure === 'function';
    });
    
    expect(hasRequiredMethods).toBeTruthy();
    
    await context.close();
  });
});