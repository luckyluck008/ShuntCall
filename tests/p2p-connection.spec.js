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

test.describe('Manual P2P Connection Tests', () => {
  test('host can create room and generates link', async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ['camera', 'microphone']
    });
    
    const page = await context.newPage();
    
    page.on('console', msg => console.log('Host:', msg.text()));
    
    await page.goto('http://localhost:8765/index.html');
    await mockMediaDevices(page);
    
    await page.fill('#createRoomId', 'test-room');
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
  
  test('guest can join via link', async ({ browser }) => {
    const context1 = await browser.newContext({
      permissions: ['camera', 'microphone']
    });
    const context2 = await browser.newContext({
      permissions: ['camera', 'microphone']
    });
    
    const page1 = await context1.newPage();
    page1.on('console', msg => console.log('P1:', msg.text()));
    
    await page1.goto('http://localhost:8765/index.html');
    await mockMediaDevices(page1);
    await page1.fill('#createRoomId', 'test-room-2');
    await page1.fill('#createPassword', 'test123');
    await page1.click('button:has-text("Create & Host")');
    
    await page1.waitForSelector('#shareSection:not(.hidden)', { timeout: 10000 });
    const roomUrl = await page1.inputValue('#shareLink');
    console.log('Room URL:', roomUrl);
    
    const page2 = await context2.newPage();
    page2.on('console', msg => console.log('P2:', msg.text()));
    
    await page2.goto(roomUrl);
    await mockMediaDevices(page2);
    
    // Wait for password modal
    await page2.waitForSelector('#passwordModal', { timeout: 5000 });
    
    // Enter password
    await page2.fill('#roomPassword', 'test123');
     await page2.click('button:has-text("Authenticate")');
    
    // Wait for media permission modal and accept
    await page2.waitForSelector('#mediaPermissionModal', { timeout: 5000 });
     await page2.click('button:has-text("Authorize")');
    
    // Wait for room to be visible
    await page2.waitForSelector('#room:not(.hidden)', { timeout: 15000 });
    
    const roomVisible = await page2.locator('#room').isVisible();
    console.log('Room visible for guest:', roomVisible);
    
    expect(roomVisible).toBeTruthy();
    
    await context1.close();
    await context2.close();
  });
});
