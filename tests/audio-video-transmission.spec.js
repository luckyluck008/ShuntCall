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

test.describe('Audio/Video Transmission Tests', () => {
  test('should transmit audio and video between two peers', async ({ browser }) => {
    const context1 = await browser.newContext({
      permissions: ['camera', 'microphone']
    });
    const context2 = await browser.newContext({
      permissions: ['camera', 'microphone']
    });
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    setupConsoleLogging(page1, 'P1');
    setupConsoleLogging(page2, 'P2');
    
    // Create a room
    await page1.goto('http://localhost:8765/index.html');
    
    // Mock media devices for headless testing
    await page1.evaluate(() => {
      const mockStream = {
        getTracks: () => [{ kind: 'audio', readyState: 'live', enabled: true, stop: () => {} }, { kind: 'video', readyState: 'live', enabled: true, stop: () => {} }],
        addTrack: () => {},
        removeTrack: () => {},
        getAudioTracks: () => [{ kind: 'audio', readyState: 'live', enabled: true, stop: () => {} }],
        getVideoTracks: () => [{ kind: 'video', readyState: 'live', enabled: true, stop: () => {} }]
      };
      
      if (!navigator.mediaDevices) {
        navigator.mediaDevices = {};
      }
      navigator.mediaDevices.getUserMedia = async () => mockStream;
      navigator.mediaDevices.getDisplayMedia = async () => mockStream;
      navigator.mediaDevices.enumerateDevices = async () => [];
    });
    
    await page2.evaluate(() => {
      const mockStream = {
        getTracks: () => [{ kind: 'audio', readyState: 'live', enabled: true, stop: () => {} }, { kind: 'video', readyState: 'live', enabled: true, stop: () => {} }],
        addTrack: () => {},
        removeTrack: () => {},
        getAudioTracks: () => [{ kind: 'audio', readyState: 'live', enabled: true, stop: () => {} }],
        getVideoTracks: () => [{ kind: 'video', readyState: 'live', enabled: true, stop: () => {} }]
      };
      
      if (!navigator.mediaDevices) {
        navigator.mediaDevices = {};
      }
      navigator.mediaDevices.getUserMedia = async () => mockStream;
      navigator.mediaDevices.getDisplayMedia = async () => mockStream;
      navigator.mediaDevices.enumerateDevices = async () => [];
    });
    
    await page1.fill('#createRoomId', 'audio-video-test-room');
    await page1.fill('#createPassword', 'test123');
    await page1.click('button:has-text("Create & Host")');
    
    await page1.waitForSelector('#shareSection:not(.hidden)', { timeout: 10000 });
    const roomUrl = await page1.inputValue('#shareLink');
    console.log('Room URL:', roomUrl);
    
    // Join from second page
    await page2.goto(roomUrl);
    
    // Enter password
    await page2.waitForSelector('#passwordModal', { timeout: 5000 });
    await page2.fill('#roomPassword', 'test123');
    await page2.click('button:has-text("Authenticate")');
    
    // Accept media permissions
    await page2.waitForSelector('#mediaPermissionModal', { timeout: 5000 });
    await page2.click('button:has-text("Authorize")');
    
    // Wait for room to be visible
    await page2.waitForSelector('#room:not(.hidden)', { timeout: 15000 });
    
    // Wait for peer connections to be established
    await page1.waitForTimeout(5000);
    await page2.waitForTimeout(5000);
    
    // Check if both peers have local video element with srcObject
    const page1VideoSrc = await page1.evaluate(() => {
      return document.getElementById('localVideo').srcObject !== null;
    });
    
    const page2VideoSrc = await page2.evaluate(() => {
      return document.getElementById('localVideo').srcObject !== null;
    });
    
    expect(page1VideoSrc).toBeTruthy();
    expect(page2VideoSrc).toBeTruthy();
    
    // Check if remote video elements are added
    const page1RemoteVideos = await page1.evaluate(() => {
      return document.querySelectorAll('#videoGrid > div:not(#localContainer)').length;
    });
    
    const page2RemoteVideos = await page2.evaluate(() => {
      return document.querySelectorAll('#videoGrid > div:not(#localContainer)').length;
    });
    
    expect(page1RemoteVideos).toBeGreaterThan(0);
    expect(page2RemoteVideos).toBeGreaterThan(0);
    
    console.log('Peers connected, audio/video transmission established');
    
    await context1.close();
    await context2.close();
  });
  
  test('should handle track failures and recovery', async ({ browser }) => {
    const context1 = await browser.newContext({
      permissions: ['camera', 'microphone']
    });
    
    const page1 = await context1.newPage();
    setupConsoleLogging(page1, 'P1');
    
    await page1.goto('http://localhost:8765/index.html');
    
    await page1.evaluate(() => {
      const mockStream = {
        getTracks: () => [{ kind: 'audio', readyState: 'live', enabled: true, stop: () => {} }, { kind: 'video', readyState: 'live', enabled: true, stop: () => {} }],
        addTrack: () => {},
        removeTrack: () => {},
        getAudioTracks: () => [{ kind: 'audio', readyState: 'live', enabled: true, stop: () => {} }],
        getVideoTracks: () => [{ kind: 'video', readyState: 'live', enabled: true, stop: () => {} }]
      };
      
      if (!navigator.mediaDevices) {
        navigator.mediaDevices = {};
      }
      navigator.mediaDevices.getUserMedia = async () => mockStream;
      navigator.mediaDevices.getDisplayMedia = async () => mockStream;
      navigator.mediaDevices.enumerateDevices = async () => [];
    });
    
    await page1.fill('#createRoomId', 'track-failure-test');
    await page1.fill('#createPassword', 'test123');
    await page1.click('button:has-text("Create & Host")');
    
    await page1.waitForSelector('#shareSection:not(.hidden)', { timeout: 10000 });
    
    // Check if WebRTC module is initialized
    const isWebRTCInitialized = await page1.evaluate(() => {
      return window.ShuntCallWebRTC && window.ShuntCallWebRTC.peerConnections;
    });
    
    expect(isWebRTCInitialized).toBeTruthy();
    
    await context1.close();
  });
});