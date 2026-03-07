import { test, expect } from '@playwright/test';

test.describe('P2P Connection Tests', () => {
  test('two peers can discover each other via signaling', async ({ browser }) => {
    const context1 = await browser.newContext({
      permissions: ['camera', 'microphone']
    });
    const context2 = await browser.newContext({
      permissions: ['camera', 'microphone']
    });
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    const roomId = 'test-room-' + Date.now();
    const namespace = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    
    await page1.goto(`http://localhost:8765/room.html?room=${roomId}&hash=${namespace}`);
    await page2.goto(`http://localhost:8765/room.html?room=${roomId}&hash=${namespace}`);
    
    await page1.waitForTimeout(2000);
    await page2.waitForTimeout(2000);
    
    const logs1 = [];
    const logs2 = [];
    
    page1.on('console', msg => logs1.push(msg.text()));
    page2.on('console', msg => logs2.push(msg.text()));
    
    await page1.waitForTimeout(8000);
    
    console.log('Page 1 logs:', logs1.filter(l => !l.includes('WebSocket')));
    console.log('Page 2 logs:', logs2.filter(l => !l.includes('WebSocket')));
    
    const peerFound1 = logs1.some(log => log.includes('Found peer') || log.includes('peer:join'));
    const peerFound2 = logs2.some(log => log.includes('Found peer') || log.includes('peer:join'));
    
    expect(peerFound1 || peerFound2).toBeTruthy();
    
    await context1.close();
    await context2.close();
  });
  
  test('two peers attempt WebRTC connection', async ({ browser }) => {
    const context1 = await browser.newContext({
      permissions: ['camera', 'microphone']
    });
    const context2 = await browser.newContext({
      permissions: ['camera', 'microphone']
    });
    
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    
    const roomId = 'test-room-webrtc-' + Date.now();
    const namespace = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    
    const logs1 = [];
    const logs2 = [];
    
    page1.on('console', msg => logs1.push(msg.text()));
    page2.on('console', msg => logs2.push(msg.text()));
    
    await page1.goto(`http://localhost:8765/room.html?room=${roomId}&hash=${namespace}`);
    await page2.goto(`http://localhost:8765/room.html?room=${roomId}&hash=${namespace}`);
    
    await page1.waitForTimeout(10000);
    await page2.waitForTimeout(10000);
    
    const offerSent1 = logs1.filter(l => l.includes('Sending offer')).length;
    const offerSent2 = logs2.filter(l => l.includes('Sending offer')).length;
    const pcCreated1 = logs1.filter(l => l.includes('Peer connection created')).length;
    const pcCreated2 = logs2.filter(l => l.includes('Peer connection created')).length;
    
    console.log('P1 offers sent:', offerSent1, 'PCs created:', pcCreated1);
    console.log('P2 offers sent:', offerSent2, 'PCs created:', pcCreated2);
    
    expect(offerSent1 + offerSent2).toBeGreaterThan(0);
    expect(pcCreated1 + pcCreated2).toBeGreaterThan(0);
    
    await context1.close();
    await context2.close();
  });
});
