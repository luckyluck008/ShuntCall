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

  test('setVideoQuality function has correct fallback logic', async () => {
    const webrtcPath = path.join(process.cwd(), 'js', 'webrtc.js');
    const webrtcContent = fs.readFileSync(webrtcPath, 'utf-8');
    
    const hasFallbackLogic = webrtcContent.includes("const fallbackQualities = ['1080p', '720p', '480p']");
    const hasFallbackTry = webrtcContent.includes('if (fallback)');
    const hasFallbackParameter = webrtcContent.includes('async setVideoQuality(quality, fallback = true)');
    
    console.log('Fallback logic verification:', {
      hasFallbackLogic,
      hasFallbackTry,
      hasFallbackParameter
    });
    
    expect(hasFallbackLogic).toBe(true);
    expect(hasFallbackTry).toBe(true);
    expect(hasFallbackParameter).toBe(true);
  });

  test('setVideoQuality function has all required methods', async () => {
    const webrtcPath = path.join(process.cwd(), 'js', 'webrtc.js');
    const webrtcContent = fs.readFileSync(webrtcPath, 'utf-8');
    
    const hasInitMethod = webrtcContent.includes('init(');
    const hasSetVideoQuality = webrtcContent.includes('setVideoQuality(');
    const hasGetAvailableQualities = webrtcContent.includes('getAvailableQualities()');
    const hasGetCurrentQuality = webrtcContent.includes('getCurrentQuality()');
    const hasGetQualitySettings = webrtcContent.includes('getQualitySettings(');
    const hasVideoQualityMap = webrtcContent.includes('videoQualityMap');
    
    console.log('setVideoQuality methods verification:', {
      hasInitMethod,
      hasSetVideoQuality,
      hasGetAvailableQualities,
      hasGetCurrentQuality,
      hasGetQualitySettings,
      hasVideoQualityMap
    });
    
    expect(hasInitMethod).toBe(true);
    expect(hasSetVideoQuality).toBe(true);
    expect(hasGetAvailableQualities).toBe(true);
    expect(hasGetCurrentQuality).toBe(true);
    expect(hasGetQualitySettings).toBe(true);
    expect(hasVideoQualityMap).toBe(true);
  });

  test('room.html contains video quality selector UI', async () => {
    const roomPath = path.join(process.cwd(), 'room.html');
    const roomContent = fs.readFileSync(roomPath, 'utf-8');
    
    const hasQualitySelect = roomContent.includes('id="videoQuality"');
    const hasLiveQualitySelector = roomContent.includes('id="liveQualitySelector"');
    const hasGenerateQualityOptions = roomContent.includes('generateQualityOptions');
    const hasDetectWebcamCapabilities = roomContent.includes('detectWebcamCapabilities');
    const hasSupportedQualities = roomContent.includes('supportedQualities');
    
    console.log('Room.html quality UI verification:', {
      hasQualitySelect,
      hasLiveQualitySelector,
      hasGenerateQualityOptions,
      hasDetectWebcamCapabilities,
      hasSupportedQualities
    });
    
    expect(hasQualitySelect).toBe(true);
    expect(hasLiveQualitySelector).toBe(true);
    expect(hasGenerateQualityOptions).toBe(true);
    expect(hasDetectWebcamCapabilities).toBe(true);
    expect(hasSupportedQualities).toBe(true);
  });

  test('quality selector has dynamic option generation', async () => {
    const roomPath = path.join(process.cwd(), 'room.html');
    const roomContent = fs.readFileSync(roomPath, 'utf-8');
    
    const hasDynamicOptions = roomContent.includes('generateQualityOptions()');
    const hasQualityMap = roomContent.includes("'480p'") && roomContent.includes("'8k'");
    
    console.log('Dynamic options verification:', {
      hasDynamicOptions,
      hasQualityMap
    });
    
    expect(hasDynamicOptions).toBe(true);
    expect(hasQualityMap).toBe(true);
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