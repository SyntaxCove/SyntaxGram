// Empirical probe: which Chromium switch (if any) actually removes the
// WebAuthn surface (PublicKeyCredential / navigator.credentials) from the
// renderer? Run with a display (Xvfb :99):
//   DISPLAY=:99 ./node_modules/.bin/electron scripts/webauthn_probe.mjs <variant>
// variants: none | blink-pkc | blink-cred | feat-wa | feat-wa2 | feat-wa3
import { app, BrowserWindow } from 'electron';

const variant = process.argv[2] ?? 'none';

switch (variant) {
  case 'blink-pkc':
    app.commandLine.appendSwitch('disable-blink-features', 'PublicKeyCredential');
    break;
  case 'blink-cred':
    app.commandLine.appendSwitch('disable-blink-features', 'CredentialManagement');
    break;
  case 'feat-wa':
    app.commandLine.appendSwitch('disable-features', 'WebAuthentication');
    break;
  case 'feat-wa2':
    app.commandLine.appendSwitch('disable-features', 'WebAuthn');
    break;
  case 'feat-wa3':
    app.commandLine.appendSwitch('disable-features', 'WebAuthenticationAPI');
    break;
}

app.whenReady()
  .then(async () => {
    const url = process.argv[3] ?? 'https://example.com/';
    const win = new BrowserWindow({ show: false });
    win.webContents.on('console-message', (_e, _lvl, message) => {
      console.log(`[renderer] ${message}`);
    });
    await win.loadURL(url);
    let res;
    try {
      res = await win.webContents.executeJavaScript(
        "typeof PublicKeyCredential + '|' + typeof navigator.credentials + '|' + typeof (navigator.credentials && navigator.credentials.get)",
      );
    } catch (e) {
      res = `EXECUTE_JS_ERROR: ${e && e.message}`;
    }
    console.log(`RESULT ${variant} ${res}`);
    app.exit(0);
  })
  .catch((e) => {
    console.log(`RESULT ${variant} APP_ERROR: ${e && e.message}`);
    app.exit(1);
  });
