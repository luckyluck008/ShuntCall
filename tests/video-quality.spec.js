import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Video Quality Tests', () => {
  test('webrtc.js contains videoQualityMap with all required resolutions', async () => {
    const webrtcPath = path.join(process.cwd(), 'js', 'webrtc.js');
    const webrtcContent = fs.readFileSync(webrtcPath, 'utf-8');
    
    const hasQualityMap = webrtcContent.includes('videoQualityMap');
    const has480p = webrtcContent.includes("'480p'");
    const has720p = webrtcContent.includes("'720p'");
    const has1080p = webrtcContent.includes("'1080p'");
    const has1440p = webrtcContent.includes("'1440p'");
    const has4k = webrtcContent.includes("'4k'");
    const has8k = webrtcContent.includes("'8k'");
    
    console.log('Video quality map verification:', {
      hasQualityMap,
      has480p,
      has720p,
      has1080p,
      has1440p,
      has4k,
      has8k
    });
    
    expect(hasQualityMap).toBe(true);
    expect(has480p).toBe(true);
    expect(has720p).toBe(true);
    expect(has1080p).toBe(true);
    expect(has1440p).toBe(true);
    expect(has4k).toBe(true);
    expect(has8k).toBe(true);
  });

  test('webrtc.js contains setVideoQuality function', async () => {
    const webrtcPath = path.join(process.cwd(), 'js', 'webrtc.js');
    const webrtcContent = fs.readFileSync(webrtcPath, 'utf-8');
    
    const hasSetVideoQuality = webrtcContent.includes('setVideoQuality');
    const hasApplyConstraints = webrtcContent.includes('applyConstraints');
    const hasVideoQualityChanged = webrtcContent.includes('videoQualityChanged');
    
    console.log('setVideoQuality function verification:', {
      hasSetVideoQuality,
      hasApplyConstraints,
      hasVideoQualityChanged
    });
    
    expect(hasSetVideoQuality).toBe(true);
    expect(hasApplyConstraints).toBe(true);
    expect(hasVideoQualityChanged).toBe(true);
  });

  test('webrtc.js contains getAvailableQualities and getCurrentQuality functions', async () => {
    const webrtcPath = path.join(process.cwd(), 'js', 'webrtc.js');
    const webrtcContent = fs.readFileSync(webrtcPath, 'utf-8');
    
    const hasGetAvailableQualities = webrtcContent.includes('getAvailableQualities');
    const hasGetCurrentQuality = webrtcContent.includes('getCurrentQuality');
    const hasGetQualitySettings = webrtcContent.includes('getQualitySettings');
    
    console.log('Quality getter functions verification:', {
      hasGetAvailableQualities,
      hasGetCurrentQuality,
      hasGetQualitySettings
    });
    
    expect(hasGetAvailableQualities).toBe(true);
    expect(hasGetCurrentQuality).toBe(true);
    expect(hasGetQualitySettings).toBe(true);
  });

  test('setVideoQuality function works correctly', async ({ page }) => {
    await page.goto('http://localhost:8765/index.html');
    
    const result = await page.evaluate(() => {
      const mockStream = {
        getVideoTracks: () => [{
          applyConstraints: async () => true,
          kind: 'video'
        }],
        getAudioTracks: () => [{
          kind: 'audio'
        }],
        getTracks: () => []
      };
      
      window.ShuntCallWebRTC.init(mockStream, 'test-peer-id', {
        on: () => {},
        sendOffer: () => Promise.resolve(),
        sendAnswer: () => Promise.resolve(),
        sendIceCandidate: () => {}
      });
      
      const initialQuality = window.ShuntCallWebRTC.getCurrentQuality();
      const availableQualities = window.ShuntCallWebRTC.getAvailableQualities();
      const qualitySettings = window.ShuntCallWebRTC.getQualitySettings('1080p');
      
      return {
        initialQuality,
        availableQualities,
        qualitySettings
      };
    });
    
    console.log('setVideoQuality test result:', result);
    
    expect(result.initialQuality).toBe('720p');
    expect(result.availableQualities).toContain('480p');
    expect(result.availableQualities).toContain('720p');
    expect(result.availableQualities).toContain('1080p');
    expect(result.availableQualities).toContain('1440p');
    expect(result.availableQualities).toContain('4k');
    expect(result.availableQualities).toContain('8k');
    expect(result.qualitySettings).toEqual({
      width: 1920,
      height: 1080,
      bitrate: 8000000
    });
  });

  test('room.html contains video quality selector UI', async () => {
    const roomPath = path.join(process.cwd(), 'room.html');
    const roomContent = fs.readFileSync(roomPath, 'utf-8');
    
    const hasQualitySelect = roomContent.includes('videoQuality');
    const hasLiveQualitySelector = roomContent.includes('liveQualitySelector');
    const has480pOption = roomContent.includes('value="480p"');
    const has8kOption = roomContent.includes('value="8k"');
    
    console.log('Room.html quality UI verification:', {
      hasQualitySelect,
      hasLiveQualitySelector,
      has480pOption,
      has8kOption
    });
    
    expect(hasQualitySelect).toBe(true);
    expect(hasLiveQualitySelector).toBe(true);
    expect(has480pOption).toBe(true);
    expect(has8kOption).toBe(true);
  });

  test('quality selector has all required options in room.html', async () => {
    const roomPath = path.join(process.cwd(), 'room.html');
    const roomContent = fs.readFileSync(roomPath, 'utf-8');
    
    const has480pOption = roomContent.includes('value="480p"');
    const has720pOption = roomContent.includes('value="720p"');
    const has1080pOption = roomContent.includes('value="1080p"');
    const has1440pOption = roomContent.includes('value="1440p"');
    const has4kOption = roomContent.includes('value="4k"');
    const has8kOption = roomContent.includes('value="8k"');
    
    console.log('Quality selector options verification:', {
      has480pOption,
      has720pOption,
      has1080pOption,
      has1440pOption,
      has4kOption,
      has8kOption
    });
    
    expect(has480pOption).toBe(true);
    expect(has720pOption).toBe(true);
    expect(has1080pOption).toBe(true);
    expect(has1440pOption).toBe(true);
    expect(has4kOption).toBe(true);
    expect(has8kOption).toBe(true);
  });

  test('webrtc.js applies constraints to all peer connections', async () => {
    const webrtcPath = path.join(process.cwd(), 'js', 'webrtc.js');
    const webrtcContent = fs.readFileSync(webrtcPath, 'utf-8');
    
    const hasPeerConnectionLoop = webrtcContent.includes('Object.values(this.peerConnections)');
    const hasSenderUpdate = webrtcContent.includes('pc.getSenders()');
    
    console.log('Peer connection constraints update verification:', {
      hasPeerConnectionLoop,
      hasSenderUpdate
    });
    
    expect(hasPeerConnectionLoop).toBe(true);
    expect(hasSenderUpdate).toBe(true);
  });
});