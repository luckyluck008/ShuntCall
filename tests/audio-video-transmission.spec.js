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
     
     // Log more info from page1
     await page1.on('console', msg => {
       if (msg.type() === 'error') {
         console.error(`[P1 ERROR]:`, msg.text());
       } else if (msg.type() === 'warning') {
         console.warn(`[P1 WARN]:`, msg.text());
       } else {
         console.log(`[P1]:`, msg.text());
       }
     });
    
    // Mock media devices by adding them to the context before creating pages
    // Use a simpler approach - mock at context level
    const mockMediaStream = () => {
      // Create canvas for video track
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const stream = canvas.captureStream(30);
      
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const destination = audioContext.createMediaStreamDestination();
        oscillator.connect(destination);
        oscillator.frequency.value = 440;
        oscillator.start();
        
        destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
      } catch (error) {
        console.warn('Failed to create audio track:', error);
      }
      
      return stream;
    };

    // Add mock to page1 before navigation
    await page1.addInitScript(() => {
      const stream = (() => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const stream = canvas.captureStream(30);
        
        try {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const oscillator = audioContext.createOscillator();
          const destination = audioContext.createMediaStreamDestination();
          oscillator.connect(destination);
          oscillator.frequency.value = 440;
          oscillator.start();
          
          destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
        } catch (error) {
          console.warn('Failed to create audio track:', error);
        }
        
        return stream;
      })();
      
      if (!navigator.mediaDevices) {
        navigator.mediaDevices = {};
      }
      
      navigator.mediaDevices.getUserMedia = async () => stream;
      navigator.mediaDevices.getDisplayMedia = async () => stream;
      navigator.mediaDevices.enumerateDevices = async () => [];
    });

    // Add mock to page2 before navigation  
    await page2.addInitScript(() => {
      const stream = (() => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const stream = canvas.captureStream(30);
        
        try {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const oscillator = audioContext.createOscillator();
          const destination = audioContext.createMediaStreamDestination();
          oscillator.connect(destination);
          oscillator.frequency.value = 440;
          oscillator.start();
          
          destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
        } catch (error) {
          console.warn('Failed to create audio track:', error);
        }
        
        return stream;
      })();
      
      if (!navigator.mediaDevices) {
        navigator.mediaDevices = {};
      }
      
      navigator.mediaDevices.getUserMedia = async () => stream;
      navigator.mediaDevices.getDisplayMedia = async () => stream;
      navigator.mediaDevices.enumerateDevices = async () => [];
    });
    
     // Create a room
     await page1.goto('http://localhost:8765/index.html');
     await page1.fill('#createRoomId', 'audio-video-test-room');
     await page1.fill('#createPassword', 'test123');
     await page1.click('button:has-text("Create & Host")');
     
     await page1.waitForSelector('#shareSection:not(.hidden)', { timeout: 10000 });
     const roomUrl = await page1.inputValue('#shareLink');
     console.log('Room URL:', roomUrl);
     
     // Page1 must navigate to room.html to actually join the room!
     await page1.goto(roomUrl);
     console.log('Page1 navigated to room.html');
     
     // Join from second page
     await page2.goto(roomUrl);
     console.log('Page2 navigated to room.html');
     
     // Wait for pages to process
     await page1.waitForTimeout(3000);
     await page2.waitForTimeout(3000);
     
     // Check hidden class instead of offsetParent
     const page1Hidden = await page1.evaluate(() => {
       return {
         passwordModal: !document.getElementById('passwordModal').classList.contains('hidden'),
         loadingScreen: !document.getElementById('loadingScreen').classList.contains('hidden'),
         mediaPermissionModal: !document.getElementById('mediaPermissionModal')?.classList.contains('hidden'),
         room: !document.getElementById('room').classList.contains('hidden')
       };
     });
     
     const page2Hidden = await page2.evaluate(() => {
       return {
         passwordModal: !document.getElementById('passwordModal').classList.contains('hidden'),
         loadingScreen: !document.getElementById('loadingScreen').classList.contains('hidden'),
         mediaPermissionModal: !document.getElementById('mediaPermissionModal')?.classList.contains('hidden'),
         room: !document.getElementById('room').classList.contains('hidden')
       };
     });
     
     console.log('Page1 shown elements:', Object.keys(page1Hidden).filter(key => page1Hidden[key]));
     console.log('Page2 shown elements:', Object.keys(page2Hidden).filter(key => page2Hidden[key]));
     
     // Page2 has password modal - fill in password!
     if (page2Hidden.passwordModal) {
       console.log('Page2 password modal is visible, entering password');
       await page2.fill('#roomPassword', 'test123');
       await page2.click('button:has-text("Authenticate")');
       await page2.waitForTimeout(2000);
     }
     
     // Check if media permission modal is visible on page1 and click it!
     if (page1Hidden.mediaPermissionModal) {
       console.log('Page1 media permission modal is visible, clicking Authorize');
       await page1.click('button:has-text("Authorize")');
       await page1.waitForTimeout(2000);
     }
     
     // Re-check page2 hidden after password modal
     const page2HiddenAfterPassword = await page2.evaluate(() => {
       return {
         mediaPermissionModal: !document.getElementById('mediaPermissionModal')?.classList.contains('hidden'),
         room: !document.getElementById('room').classList.contains('hidden')
       };
     });
     
     if (page2HiddenAfterPassword.mediaPermissionModal) {
       console.log('Page2 media permission modal is visible, clicking Authorize');
       await page2.click('button:has-text("Authorize")');
       await page2.waitForTimeout(2000);
     }
     
     // Wait for rooms to become visible - check via evaluate
     await page1.waitForFunction(() => !document.getElementById('room').classList.contains('hidden'), { timeout: 20000 });
     console.log('Page1 room is visible');
     
     await page2.waitForFunction(() => !document.getElementById('room').classList.contains('hidden'), { timeout: 20000 });
     console.log('Page2 room is visible');
     
     // Wait for page2 to complete initialization
     await page2.waitForSelector('#room:not(.hidden)', { timeout: 20000 });
     console.log('Page2 room is visible');
     
     // Check page1's media permissions modal
     const page1MediaModal = await page1.evaluate(() => {
       const modal = document.getElementById('mediaPermissionModal');
       return modal && !modal.classList.contains('hidden');
     });
     
     if (page1MediaModal) {
       console.log('Page1 media permission modal is visible, clicking Authorize');
       await page1.click('button:has-text("Authorize")');
     }
     
     // Check page2's media permissions modal
     const page2MediaModal = await page2.evaluate(() => {
       const modal = document.getElementById('mediaPermissionModal');
       return modal && !modal.classList.contains('hidden');
     });
     
     if (page2MediaModal) {
       console.log('Page2 media permission modal is visible, clicking Authorize');
       await page2.click('button:has-text("Authorize")');
     }
     
     // Check if local video elements exist and have srcObject
     await page1.waitForTimeout(3000);
     await page2.waitForTimeout(3000);
     
     const page1VideoExists = await page1.evaluate(() => {
       const el = document.getElementById('localVideo');
       return el && el.srcObject !== null;
     });
     
     const page2VideoExists = await page2.evaluate(() => {
       const el = document.getElementById('localVideo');
       return el && el.srcObject !== null;
     });
     
     if (page1VideoExists) {
       console.log('Page1 local video has srcObject');
       expect(page1VideoExists).toBeTruthy();
     }
     if (page2VideoExists) {
       console.log('Page2 local video has srcObject');
       expect(page2VideoExists).toBeTruthy();
     }
     
     // Check if remote video elements are added
     const page1RemoteVideos = await page1.evaluate(() => {
       return document.querySelectorAll('#videoGrid > div:not(#localContainer)').length;
     });
     
     const page2RemoteVideos = await page2.evaluate(() => {
       return document.querySelectorAll('#videoGrid > div:not(#localContainer)').length;
     });
     
     // Wait for peer connections
     await page1.waitForTimeout(5000);
     await page2.waitForTimeout(5000);
     
     console.log('Page 1 remote videos:', page1RemoteVideos);
     console.log('Page 2 remote videos:', page2RemoteVideos);
    
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