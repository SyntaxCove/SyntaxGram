// Runtime verification for the passkey guard (v0.2.3).
// Loads a page in a WebContentsView using the REAL built preload
// (dist/preload/instagram.js) and checks — from the page's MAIN world —
// that the suppressor actually installed.
//   DISPLAY=:99 ./node_modules/.bin/electron scripts/passkey_runtime_probe.mjs [url]
import { app, BrowserWindow, WebContentsView, session } from 'electron';
import path from 'node:path';

app.whenReady()
  .then(async () => {
    const url = process.argv[2] ?? 'https://www.instagram.com/';
    const ses = session.fromPartition('probe');
    const win = new BrowserWindow({ show: false, width: 900, height: 700 });
    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(process.cwd(), 'dist/preload/instagram.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        session: ses,
        spellcheck: false,
      },
    });
    win.contentView.addChildView(view);
    view.setBounds({ x: 0, y: 0, width: 900, height: 700 });
    view.webContents.on('console-message', (_e, _lvl, message) => console.log(`[renderer] ${String(message).slice(0, 160)}`));
    try {
      await Promise.race([view.webContents.loadURL(url), new Promise((_, rej) => setTimeout(() => rej(new Error('load timeout')), 40000))]);
    } catch (e) {
      console.log('LOAD_NOTE', e && e.message, '— checking guard on whatever page is active');
    }
    await new Promise((r) => setTimeout(r, 1200));
    const ask = async (expr) => {
      try {
        return await view.webContents.executeJavaScript(expr);
      } catch (e) {
        return `EXEC_ERR: ${e && e.message}`;
      }
    };
    const patched = await ask('!!window.__igdPasskeyPatched');
    const getType = await ask('typeof (navigator.credentials && navigator.credentials.get)');
    const isUVPAA = await ask(
      "typeof PublicKeyCredential !== 'undefined' && typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function' ? PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(String).catch(() => 'err') : 'no-pkc'",
    );
    console.log(`PASSKEY_PROBE patched=${patched} get=${getType} isUVPAA=${isUVPAA}`);
    app.exit(0);
  })
  .catch((e) => {
    console.log('PASSKEY_PROBE APP_ERROR', e && e.message);
    app.exit(1);
  });
