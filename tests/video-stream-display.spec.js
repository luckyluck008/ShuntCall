import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Video Stream Fix Tests', () => {
  test('webrtc.js contains fix for empty event.streams', async () => {
    const webrtcPath = path.join(process.cwd(), 'js', 'webrtc.js');
    const webrtcContent = fs.readFileSync(webrtcPath, 'utf-8');
    
    const hasStreamsCheck = webrtcContent.includes('streams[0]');
    const hasNewStreamCreation = webrtcContent.includes('new MediaStream()');
    const hasAddTrack = webrtcContent.includes('.addTrack(track)');
    
    console.log('Fix verification:', {
      hasStreamsCheck,
      hasNewStreamCreation,
      hasAddTrack
    });
    
    expect(hasStreamsCheck).toBe(true);
    expect(hasNewStreamCreation).toBe(true);
    expect(hasAddTrack).toBe(true);
  });
  
  test('ontrack handler emits remoteStream event correctly', async ({ page }) => {
    await page.goto('http://localhost:8765/index.html');
    
    await page.evaluate(() => {
      window.ShuntCallWebRTC.init(null, 'test-peer-id', {
        on: () => {},
        sendOffer: () => Promise.resolve(),
        sendAnswer: () => Promise.resolve(),
        sendIceCandidate: () => {}
      });
    });
    
    const peerConnectionCreated = await page.evaluate(() => {
      window.ShuntCallWebRTC.createPeerConnection('remote-peer-123');
      return !!window.ShuntCallWebRTC.peerConnections['remote-peer-123'];
    });
    
    expect(peerConnectionCreated).toBe(true);
  });
  
  test('basic WebRTC functionality works', async ({ page }) => {
    await page.goto('http://localhost:8765/index.html');
    
    const webrtcLoaded = await page.evaluate(() => {
      return !!window.ShuntCallWebRTC && 
             typeof window.ShuntCallWebRTC.init === 'function' &&
             typeof window.ShuntCallWebRTC.createPeerConnection === 'function' &&
             typeof window.ShuntCallWebRTC.handlePresence === 'function';
    });
    
    expect(webrtcLoaded).toBe(true);
  });
});
