import { test, expect } from '@playwright/test';

test.describe('Manual P2P Connection Tests', () => {
  test('host can create room and generates link with data', async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ['camera', 'microphone']
    });
    
    const page = await context.newPage();
    
    page.on('console', msg => console.log('Host:', msg.text()));
    
    await page.goto('http://localhost:8765/index.html');
    
    await page.fill('#createRoomId', 'test-room');
    await page.fill('#createPassword', 'test123');
    
    await page.click('button:has-text("Raum erstellen")');
    
    await page.waitForURL(/room\.html/, { timeout: 10000 });
    
    const url = page.url();
    console.log('Created room URL:', url);
    
    expect(url).toContain('data=');
    expect(url).toContain('room=');
    expect(url).toContain('hash=');
    
    await context.close();
  });
  
  test('guest can join via link with data param', async ({ browser }) => {
    const context1 = await browser.newContext({
      permissions: ['camera', 'microphone']
    });
    const context2 = await browser.newContext({
      permissions: ['camera', 'microphone']
    });
    
    const page1 = await context1.newPage();
    page1.on('console', msg => console.log('P1:', msg.text()));
    
    await page1.goto('http://localhost:8765/index.html');
    await page1.fill('#createRoomId', 'test-room-2');
    await page1.fill('#createPassword', 'test123');
    await page1.click('button:has-text("Raum erstellen")');
    
    await page1.waitForURL(/room\.html\?.*data=/, { timeout: 10000 });
    const roomUrl = page1.url();
    console.log('Room URL with data:', roomUrl);
    
    const page2 = await context2.newPage();
    page2.on('console', msg => console.log('P2:', msg.text()));
    
    await page2.goto(roomUrl);
    
    await page2.waitForSelector('#room:not(.hidden)', { timeout: 15000 });
    
    const roomVisible = await page2.locator('#room').isVisible();
    console.log('Room visible for guest:', roomVisible);
    
    expect(roomVisible).toBeTruthy();
    
    await context1.close();
    await context2.close();
  });
});
