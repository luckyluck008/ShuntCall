import { test, expect } from '@playwright/test';

test('webrtc.js module loads without syntax errors', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  
  await page.goto('https://luckyluck008.github.io/ShuntCall/room.html?room=test-room');
  
  await page.waitForTimeout(3000);
  
  console.log('Console errors:', errors);
  
  const syntaxErrors = errors.filter(e => e.includes('SyntaxError') || e.includes('unexpected token'));
  expect(syntaxErrors).toHaveLength(0);
});

test('webcam capabilities detection works', async ({ page }) => {
  await page.goto('https://luckyluck008.github.io/ShuntCall/room.html?room=test-room');
  
  await page.waitForTimeout(2000);
  
  const webcamInfo = await page.evaluate(() => {
    const log = window.webcamInfo;
    return log;
  });
  
  console.log('Webcam info from console:', webcamInfo);
});

test('NostrSignaling module loads correctly', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  
  await page.goto('https://luckyluck008.github.io/ShuntCall/room.html?room=test-room');
  
  await page.waitForTimeout(3000);
  
  const signalingDefined = await page.evaluate(() => {
    return typeof window.NostrSignaling !== 'undefined';
  });
  
  console.log('NostrSignaling defined:', signalingDefined);
  console.log('Errors:', errors);
  
  expect(signalingDefined).toBe(true);
});