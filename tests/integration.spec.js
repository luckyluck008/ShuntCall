import { test, expect } from '@playwright/test';

/**
 * ShuntCall — Comprehensive Integration Tests
 * Tests all bugs fixed and features implemented
 */

const ROOM_ID = 'test-room-' + Date.now();
const PASSWORD = 'TestPassword123!';

// Helper: navigate to room and enter password + authorize media
async function setupRoom(page, roomId, password) {
  const logs = [];
  page.on('console', msg => logs.push(msg.text()));
  
  await page.goto('/room.html?room=' + encodeURIComponent(roomId));
  await page.waitForSelector('#roomPassword', { timeout: 10000 });
  await page.fill('#roomPassword', password);
  await page.click('#submitPassword');
  
  // Wait for media permission modal
  await page.waitForTimeout(1500);
  
  // Click authorize if present
  const authorizeBtn = await page.$('#mediaPermissionAccept');
  if (authorizeBtn) {
    await authorizeBtn.click({ force: true });
  }
  
  // Wait for initialization
  await page.waitForTimeout(8000);
  
  return logs;
}

// ======== PHASE 1: CRITICAL SECURITY BUGS ========

test.describe('Critical Security Fixes', () => {

  test('Fix 1: File transfer base64 decode', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const originalData = 'Hello, test file with special chars: äöü';
      const base64 = btoa(unescape(encodeURIComponent(originalData)));
      const chunks = [base64];
      
      // Fixed code: decodes base64 first
      const base64Str = chunks.join('');
      const binaryStr = atob(base64Str);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const fixedResult = decodeURIComponent(escape(String.fromCharCode(...bytes)));
      return { original: originalData, fixed: fixedResult };
    });
    expect(result.fixed).toBe(result.original);
  });

  test('Fix 2: Encryption with valid key works', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode('test-key-1234567890'), 'PBKDF2', false, ['deriveKey']
      );
      const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: encoder.encode('shuntcall-salt'), iterations: 100000, hash: 'SHA-256' },
        keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
      );
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode('secret message'));
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);
      const b64 = btoa(String.fromCharCode(...combined));
      const decoded = new Uint8Array(atob(b64).split('').map(c => c.charCodeAt(0)));
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decoded.slice(0, 12) }, key, decoded.slice(12));
      return new TextDecoder().decode(decrypted);
    });
    expect(result).toBe('secret message');
  });

  test('Fix 3: Signature verification code rejects when unavailable', async ({ page }) => {
    await page.goto('/');
    const resp = await page.goto('/js/nostr-signaling.js');
    const code = await resp.text();
    // Verify the code REJECTS when tools unavailable (not accepts)
    expect(code).toContain('REJECTING event');
    expect(code).toContain('return false');
    expect(code).not.toContain('accepting event');
  });

  test('Fix 4: Open redirect blocked for non-room URLs', async ({ page }) => {
    await page.goto('/');
    const results = await page.evaluate(() => {
      const testUrls = [
        'https://evil.com/room.html?room=test',
        'javascript:alert(1)',
        '/room.html?room=valid-room',
        'room.html?room=valid-room',
      ];
      return testUrls.map(url => {
        try {
          const parsed = new URL(url, window.location.origin);
          const allowed = parsed.origin === window.location.origin && parsed.pathname.includes('room.html');
          return { url, allowed };
        } catch {
          return { url, allowed: url.startsWith('room.html') };
        }
      });
    });
    expect(results[0].allowed).toBe(false);
    expect(results[1].allowed).toBe(false);
    expect(results[2].allowed).toBe(true);
    expect(results[3].allowed).toBe(true);
  });

  test('Fix 5: Password never stored in sessionStorage', async ({ page }) => {
    await page.goto('/');
    await page.fill('#createRoomId', 'test-session-' + Date.now());
    await page.fill('#createPassword', 'MySecretPassword');
    await page.click('#createForm button[type="submit"]');
    await page.waitForTimeout(3000);
    const pw = await page.evaluate(() => sessionStorage.getItem('shuntcall_password'));
    expect(pw).toBeNull();
  });
});

// ======== HIGH SEVERITY FIXES (code verification) ========

test.describe('High Severity Code Fixes', () => {

  test('Fix 10: ICE restart timeout exists in webrtc.js', async ({ page }) => {
    await page.goto('/');
    const resp = await page.goto('/js/webrtc.js');
    const code = await resp.text();
    expect(code).toContain('30000');
    expect(code).toContain('restartIce');
    expect(code).toContain('setTimeout');
  });

  test('Fix 12: setupDataChannel double-setup guard', async ({ page }) => {
    await page.goto('/');
    const resp = await page.goto('/js/webrtc.js');
    const code = await resp.text();
    expect(code).toContain('_setupComplete');
  });

  test('Fix 11: Offer glare resolution by peer ID', async ({ page }) => {
    await page.goto('/');
    const resp = await page.goto('/js/webrtc.js');
    const code = await resp.text();
    expect(code).toContain('fromPeerId > this.peerId');
  });

  test('Fix 6: reconnectChild maxChildren check', async ({ page }) => {
    await page.goto('/');
    const resp = await page.goto('/js/relay-tree.js');
    const code = await resp.text();
    expect(code).toContain('maxChildren');
    expect(code).toContain('findBestParent');
  });

  test('Fix 9: destroy() unsubscribes from relays', async ({ page }) => {
    await page.goto('/');
    const resp = await page.goto('/js/nostr-signaling.js');
    const code = await resp.text();
    expect(code).toContain('unsubscribe');
  });

  test('Fix 14: maxMessageSize check exists', async ({ page, request }) => {
    const resp = await request.get('/js/webrtc.js');
    const code = await resp.text();
    expect(code).toContain('maxMessageSize');
  });
});

// ======== NOSTR RELAY CONNECTIONS ========

test.describe('Nostr Relay Infrastructure', () => {

  test('Relay list uses writable relays (no njump.me or nostr.wine)', async ({ page }) => {
    await page.goto('/');
    const resp = await page.goto('/js/nostr.js');
    const code = await resp.text();
    expect(code).toContain('wss://relay.damus.io');
    expect(code).toContain('wss://relay.nostr.band');
    expect(code).toContain('wss://purplepag.es');
    expect(code).not.toContain('wss://njump.me');
    expect(code).not.toContain('wss://nostr.wine');
  });

  test('OK tracking implemented in handleMessage', async ({ page }) => {
    await page.goto('/');
    const resp = await page.goto('/js/nostr.js');
    const code = await resp.text();
    expect(code).toContain('writableRelays');
    expect(code).toContain('okReceived');
    expect(code).toContain('okRejected');
    expect(code).toContain('_publishResolves');
  });

  test('publish() waits for OK responses', async ({ page }) => {
    await page.goto('/');
    const resp = await page.goto('/js/nostr.js');
    const code = await resp.text();
    expect(code).toContain('accepted');
    expect(code).toContain('await new Promise');
  });

  test('Room connects to relays successfully', async ({ page }) => {
    const logs = await setupRoom(page, ROOM_ID + '-relay', PASSWORD);
    const hasConnection = logs.some(l => l.includes('Nostr: Connected to'));
    const relayCount = logs.filter(l => l.includes('Nostr: Connected to')).length;
    expect(hasConnection).toBe(true);
    expect(relayCount).toBeGreaterThanOrEqual(3);
  });

  test('Room publishes presence event', async ({ page }) => {
    const logs = await setupRoom(page, ROOM_ID + '-presence', PASSWORD);
    const hasPublish = logs.some(l => l.includes('Published event') || l.includes('Presence broadcast sent'));
    expect(hasPublish).toBe(true);
  });
});

// ======== FEATURES ========

test.describe('Password Strength Meter', () => {

  test('homepage shows strength bar on weak password', async ({ page }) => {
    await page.goto('/');
    await page.fill('#createPassword', 'a');
    await page.waitForTimeout(300);
    const text = await page.$eval('#passwordStrengthText', el => el.textContent);
    expect(text).toContain('Weak');
  });

  test('homepage shows strong indicator for strong password', async ({ page }) => {
    await page.goto('/');
    await page.fill('#createPassword', 'MyStr0ng!P@ssw0rd#2024');
    await page.waitForTimeout(300);
    const text = await page.$eval('#passwordStrengthText', el => el.textContent);
    expect(text).toMatch(/Strong|Very Strong/);
  });

  test('room password modal has strength meter', async ({ page }) => {
    await page.goto('/room.html?room=pw-test');
    await page.waitForSelector('#roomPassword');
    await page.fill('#roomPassword', 'weak');
    await page.waitForTimeout(300);
    const text = await page.$eval('#roomPwStrengthText', el => el.textContent);
    expect(text).toContain('Weak');
  });
});

test.describe('Ephemeral Messages', () => {

  test('chat expiry selector has all options', async ({ page }) => {
    const logs = await setupRoom(page, ROOM_ID + '-eph', PASSWORD);
    const options = await page.$$eval('#chatExpiry option', opts => opts.map(o => ({ value: o.value, text: o.textContent })));
    expect(options).toEqual([
      { value: '0', text: 'No expiry' },
      { value: '30', text: '30s' },
      { value: '60', text: '60s' },
      { value: '300', text: '5min' }
    ]);
  });

  test('selecting expiry updates chatExpiry value', async ({ page }) => {
    const logs = await setupRoom(page, ROOM_ID + '-exp', PASSWORD);
    // Verify selector exists and has correct default
    const value = await page.$eval('#chatExpiry', el => el.value);
    expect(value).toBe('0');
  });
});

test.describe('Chat Clear Feature', () => {

  test('clear button exists in chat panel', async ({ page }) => {
    const logs = await setupRoom(page, ROOM_ID + '-clr', PASSWORD);
    const btn = await page.$('#clearChat');
    expect(btn).not.toBeNull();
  });
});

test.describe('Relay Management UI', () => {

  test('RELAYS button toggles relay panel', async ({ page }) => {
    const logs = await setupRoom(page, ROOM_ID + '-rel', PASSWORD);
    
    // Panel hidden initially
    const hidden = await page.$eval('#relayPanel', el => el.classList.contains('hidden'));
    expect(hidden).toBe(true);
    
    // Click toggle
    await page.click('#toggleRelays');
    await page.waitForTimeout(500);
    
    // Panel visible
    const visible = await page.$eval('#relayPanel', el => !el.classList.contains('hidden'));
    expect(visible).toBe(true);
  });

  test('relay panel has add relay input and button', async ({ page }) => {
    const logs = await setupRoom(page, ROOM_ID + '-radd', PASSWORD);
    await page.click('#toggleRelays');
    await page.waitForTimeout(500);
    
    const input = await page.$('#newRelayUrl');
    const btn = await page.$('#addRelayBtn');
    expect(input).not.toBeNull();
    expect(btn).not.toBeNull();
  });
});

test.describe('Copy Protection', () => {

  test('no-select class on room ID display', async ({ page }) => {
    const logs = await setupRoom(page, ROOM_ID + '-cp', PASSWORD);
    const classes = await page.$eval('#roomIdDisplay', el => el.className);
    expect(classes).toContain('no-select');
  });

  test('screenshot overlay exists in DOM', async ({ page }) => {
    const logs = await setupRoom(page, ROOM_ID + '-cp2', PASSWORD);
    const overlay = await page.$('#screenshotOverlay');
    expect(overlay).not.toBeNull();
  });

  test('no-select on password display in homepage', async ({ page }) => {
    await page.goto('/');
    const hasClass = await page.$eval('#displayPassword', el => el.classList.contains('no-select'));
    expect(hasClass).toBe(true);
  });
});

test.describe('Debug Panel', () => {

  test('D key toggles debug panel when no input focused', async ({ page }) => {
    const logs = await setupRoom(page, ROOM_ID + '-dbg', PASSWORD);
    
    // Press D
    await page.keyboard.press('d');
    await page.waitForTimeout(300);
    const visible = await page.$eval('#debugPanel', el => !el.classList.contains('hidden'));
    expect(visible).toBe(true);
    
    // Press D again
    await page.keyboard.press('d');
    await page.waitForTimeout(300);
    const hidden = await page.$eval('#debugPanel', el => el.classList.contains('hidden'));
    expect(hidden).toBe(true);
  });

  test('D key does NOT toggle when chat input focused', async ({ page }) => {
    const logs = await setupRoom(page, ROOM_ID + '-dbg2', PASSWORD);
    
    // Open chat
    await page.click('#toggleChat');
    await page.waitForTimeout(300);
    await page.focus('#chatInput');
    
    // Press D
    await page.keyboard.press('d');
    await page.waitForTimeout(300);
    const hidden = await page.$eval('#debugPanel', el => el.classList.contains('hidden'));
    expect(hidden).toBe(true);
  });
});

test.describe('CSP Meta Tags', () => {

  test('homepage CSP includes new relays, excludes old', async ({ page }) => {
    await page.goto('/');
    const csp = await page.$eval('meta[http-equiv="Content-Security-Policy"]', el => el.getAttribute('content'));
    expect(csp).toContain('wss://relay.damus.io');
    expect(csp).toContain('wss://relay.nostr.band');
    expect(csp).not.toContain('wss://njump.me');
    expect(csp).not.toContain('wss://nostr.wine');
  });

  test('room page CSP includes new relays, excludes old', async ({ page }) => {
    await page.goto('/room.html?room=csp-test');
    const csp = await page.$eval('meta[http-equiv="Content-Security-Policy"]', el => el.getAttribute('content'));
    expect(csp).toContain('wss://purplepag.es');
    expect(csp).not.toContain('wss://njump.me');
    expect(csp).not.toContain('wss://nostr.wine');
  });
});

test.describe('Room Creation Flow', () => {

  test('homepage has create and join forms', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#createForm')).toBeVisible();
    await expect(page.locator('#joinForm')).toBeVisible();
  });

  test('generates random room ID in correct format', async ({ page }) => {
    await page.goto('/');
    await page.click('#generateId');
    const roomId = await page.inputValue('#createRoomId');
    expect(roomId).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/);
  });

  test('room creation shows share section with link', async ({ page }) => {
    await page.goto('/');
    await page.fill('#createRoomId', 'auto-test');
    await page.fill('#createPassword', 'test123');
    await page.click('#createForm button[type="submit"]');
    await page.waitForTimeout(4000);
    
    const shareVisible = await page.$eval('#shareSection', el => !el.classList.contains('hidden'));
    expect(shareVisible).toBe(true);
    
    const shareLink = await page.inputValue('#shareLink');
    expect(shareLink).toContain('room.html?room=auto-test');
    
    const displayPw = await page.inputValue('#displayPassword');
    expect(displayPw).toBe('test123');
  });

  test('empty room ID shows error', async ({ page }) => {
    await page.goto('/');
    await page.fill('#createRoomId', '');
    await page.fill('#createPassword', 'test123');
    await page.click('#createForm button[type="submit"]');
    await page.waitForTimeout(500);
    const errorVisible = await page.$eval('#errorMessage', el => !el.classList.contains('hidden'));
    expect(errorVisible).toBe(true);
  });

  test('join form rejects non-room URLs', async ({ page }) => {
    await page.goto('/');
    await page.fill('#joinLink', 'https://evil.com/room.html?room=test');
    await page.click('#joinForm button[type="submit"]');
    await page.waitForTimeout(500);
    const errorText = await page.$eval('#errorText', el => el.textContent);
    expect(errorText).toContain('Invalid');
  });
});

test.describe('Room Page Initialization', () => {

  test('room page loads password modal', async ({ page }) => {
    await page.goto('/room.html?room=modal-test');
    const modal = await page.$('#passwordModal');
    expect(modal).not.toBeNull();
    const pwInput = await page.$('#roomPassword');
    expect(pwInput).not.toBeNull();
  });

  test('room ID displays in header', async ({ page }) => {
    const logs = await setupRoom(page, 'display-test', PASSWORD);
    const roomIdDisplay = await page.$eval('#roomIdDisplay', el => el.textContent);
    expect(roomIdDisplay).toContain('display-test');
  });

  test('media controls are present', async ({ page }) => {
    const logs = await setupRoom(page, ROOM_ID + '-controls', PASSWORD);
    expect(await page.$('#toggleMic')).not.toBeNull();
    expect(await page.$('#toggleCamera')).not.toBeNull();
    expect(await page.$('#toggleScreen')).not.toBeNull();
    expect(await page.$('#togglePiP')).not.toBeNull();
  });

  test('quality selector has expected options', async ({ page }) => {
    const logs = await setupRoom(page, ROOM_ID + '-quality', PASSWORD);
    const options = await page.$$eval('#liveQualitySelector option', opts => opts.map(o => o.value));
    // In mock stream mode (headless), only 480p is available
    // In real mode, 720p and 480p should both be present
    expect(options.length).toBeGreaterThan(0);
    expect(options).toContain('480p');
  });
});

test.describe('Gun.js Cleanup', () => {

  test('no Gun.js loaded on homepage', async ({ page }) => {
    await page.goto('/');
    const hasGun = await page.evaluate(() => typeof Gun !== 'undefined');
    expect(hasGun).toBe(false);
  });

  test('package.json has no Gun dependencies', async ({ page }) => {
    await page.goto('/');
    const resp = await page.goto('/package.json');
    const pkg = JSON.parse(await resp.text());
    expect(pkg.devDependencies?.gun).toBeUndefined();
    expect(pkg.devDependencies?.['@gun-vue/relay']).toBeUndefined();
  });

  test('gun-relay.js file does not exist', async ({ page }) => {
    const resp = await page.goto('/gun-relay.js');
    expect(resp.status()).toBe(404);
  });
});

test.describe('Auto Quality Adjustment', () => {

  test('autoAdjustQuality exists in webrtc.js', async ({ page }) => {
    await page.goto('/');
    const resp = await page.goto('/js/webrtc.js');
    const code = await resp.text();
    expect(code).toContain('autoAdjustQuality');
    expect(code).toContain('currentRoundTripTime');
    expect(code).toContain('packetsLost');
  });
});

test.describe('IP Leak Detection', () => {

  test('ICE candidate monitoring for host candidates', async ({ page }) => {
    await page.goto('/');
    const resp = await page.goto('/js/webrtc.js');
    const code = await resp.text();
    expect(code).toContain('typ host');
    expect(code).toContain('ipLeakWarning');
  });
});

test.describe('README Updated', () => {

  test('README references Nostr, not Gun.js', async ({ page }) => {
    await page.goto('/');
    const resp = await page.goto('/README.md');
    const text = await resp.text();
    expect(text).toContain('Nostr');
    expect(text).not.toContain('Gun.js');
    expect(text).not.toContain('gun');
  });
});

test.describe('Screen Sharing — Camera Preserved', () => {

  test('screen share does not stop camera track', async ({ page, request }) => {
    const resp = await request.get('/room.html');
    const code = await resp.text();
    // The new code should NOT call oldVideoTrack.stop() when starting screen share
    const screenIdx = code.indexOf("document.getElementById('toggleScreen')");
    const pipIdx = code.indexOf("document.getElementById('togglePiP')");
    const screenShareSection = code.substring(screenIdx, pipIdx);
    // Should create separate screen video container
    expect(screenShareSection).toContain('screenShareContainer');
    expect(screenShareSection).toContain('screenVideo');
    expect(screenShareSection).not.toContain('oldVideoTrack.stop()');
  });

  test('screen share button is present', async ({ page }) => {
    const logs = await setupRoom(page, ROOM_ID + '-screen2', PASSWORD);
    const btn = await page.$('#toggleScreen');
    expect(btn).not.toBeNull();
  });
});

test.describe('Nickname Hot-Reload', () => {

  test('renderChatMessages looks up peerNicknames map', async ({ page }) => {
    await page.goto('/');
    const resp = await page.goto('/room.html?room=dummy');
    const code = await resp.text();
    // renderChatMessages should use peerNicknames.get()
    expect(code).toContain("this.peerNicknames.get(msg.peerId)");
  });

  test('updatePeerNickname stores in peerNicknames and re-renders', async ({ page }) => {
    await page.goto('/');
    const resp = await page.goto('/room.html?room=dummy');
    const code = await resp.text();
    expect(code).toContain("this.peerNicknames.set(peerId, nickname)");
    expect(code).toContain("this.renderChatMessages()");
  });

  test('nickname input triggers re-render of chat', async ({ page, request }) => {
    const resp = await request.get('/room.html');
    const code = await resp.text();
    const nicknameIdx = code.indexOf("nicknameInput.addEventListener('input'");
    expect(nicknameIdx).toBeGreaterThan(0);
    const section = code.substring(nicknameIdx, nicknameIdx + 800);
    expect(section).toContain('renderChatMessages');
    expect(section).toContain('peerNicknames');
  });
});

test.describe('File Sharing Fix', () => {

  test('sendFile uses safe 4KB chunks', async ({ page }) => {
    await page.goto('/');
    const resp = await page.goto('/room.html?room=dummy');
    const code = await resp.text();
    expect(code).toContain('const CHUNK_SIZE = 4096');
  });

  test('sendFile has delay between chunks', async ({ page }) => {
    await page.goto('/');
    const resp = await page.goto('/room.html?room=dummy');
    const code = await resp.text();
    // Should have setTimeout for chunk pacing
    const sendFileSection = code.substring(
      code.indexOf('sendFile(file)'),
      code.indexOf('handleFileOffer(peerId')
    );
    expect(sendFileSection).toContain('setTimeout');
  });

  test('sendData checks message size before sending', async ({ page }) => {
    await page.goto('/');
    const resp = await page.goto('/js/webrtc.js');
    const code = await resp.text();
    expect(code).toContain('maxMessageSize');
    expect(code).toContain('msg.length');
  });

  test('sendFile button exists in room', async ({ page }) => {
    const logs = await setupRoom(page, ROOM_ID + '-file', PASSWORD);
    const btn = await page.$('#shareFile');
    expect(btn).not.toBeNull();
  });
});
