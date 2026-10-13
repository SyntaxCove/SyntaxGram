// Passkey (WebAuthn) prompt suppression for the embedded Instagram view.
//
// Why: Instagram's login page proactively calls `navigator.credentials.get()`.
// Inside the embedded view Chromium surfaces that as a NATIVE Windows Security
// modal ("Sign in with a passkey" / "Insert your security key into the USB
// port") — a prompt the regular browser never shows for the same page
// (user report, v0.2.3). We therefore neutralize WebAuthn inside the
// Instagram view entirely: passkey sign-in is intentionally unavailable in
// the app, while username/password + 2FA login — handled fully by Instagram
// itself — keeps working exactly as before.
//
// Three install points (all idempotent, first one wins):
//   1. preload/instagram.ts evaluates `passkeySuppressorSource()` via
//      webFrame.executeJavaScript — runs in the page's MAIN world BEFORE any
//      Instagram script, so the stub is always in place first.
//   2. injection/index.ts calls `installPasskeySuppressor(window)` when the
//      enhancement layer boots (same main world, safety net).
//   3. main/app/MainWindow.ts injects the same source into every CHILD frame
//      on did-frame-finish-load (the Meta login flow may run inside an iframe
//      whose main world is separate).
//
// Behavior after installation:
//   - `credentials.get()` (non-conditional)  -> rejects NotAllowedError
//     (the request never reaches the OS authenticator layer, so no modal)
//   - `credentials.get({ mediation: 'conditional' })` -> resolves `null`
//     (Chrome-like silent no-op instead of an autofill prompt)
//   - `credentials.create()` -> rejects NotAllowedError (no passkey creation)
//   - `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`
//     -> resolves `false` (so Instagram's UI does not advertise passkeys)

/** Window type augmented with the idempotency marker + WebAuthn surface. */
type PatchedWindow = Window & {
  __igdPasskeyPatched?: boolean;
  PublicKeyCredential?: {
    isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
  };
};

/**
 * Patches WebAuthn entry points on the given window scope. Safe to call on
 * any scope, any number of times — returns true only for the first install.
 * Never throws: any unexpected page context yields `false`.
 */
export function installPasskeySuppressor(scope: Window): boolean {
  try {
    const w = scope as PatchedWindow;
    if (w.__igdPasskeyPatched) return false;
    const creds = w.navigator && w.navigator.credentials;
    if (!creds) return false;
    w.__igdPasskeyPatched = true;

    const denied = (): DOMException =>
      new DOMException('Passkey sign-in is disabled in this app. Log in with your password instead.', 'NotAllowedError');

    // Block passkey CREATION (registration prompts / nags).
    creds.create = ((): Promise<never> => Promise.reject(denied())) as typeof creds.create;

    // Block passkey REQUESTS. Conditional-mediation calls (the silent
    // autofill variant) resolve with `null` so the page can move on.
    creds.get = ((options?: CredentialRequestOptions): Promise<Credential | null> =>
      options && options.mediation === 'conditional'
        ? Promise.resolve(null)
        : Promise.reject(denied())) as unknown as typeof creds.get;

    // Hide the platform authenticator so passkey UI stays hidden.
    const pkc = w.PublicKeyCredential;
    if (pkc && typeof pkc.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      pkc.isUserVerifyingPlatformAuthenticatorAvailable = (): Promise<boolean> => Promise.resolve(false);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * The same guard as a self-contained, plain-JS IIFE string for contexts that
 * cannot import modules: the preload evaluates it in the page's main world,
 * and the main process evaluates it inside child frames. Kept as a string
 * (not compiled output) so it stays readable, auditable and stable regardless
 * of bundler minification. Unit tests evaluate THIS string, so the shipped
 * artifact is what gets tested.
 */
export function passkeySuppressorSource(): string {
  return `(function () {
  try {
    var w = window;
    if (w.__igdPasskeyPatched) return;
    var creds = window.navigator && window.navigator.credentials;
    if (!creds) return;
    w.__igdPasskeyPatched = true;
    var denied = function () {
      try {
        return new DOMException(
          'Passkey sign-in is disabled in this app. Log in with your password instead.',
          'NotAllowedError'
        );
      } catch (e) {
        var err = new Error('Passkey sign-in is disabled in this app. Log in with your password instead.');
        err.name = 'NotAllowedError';
        return err;
      }
    };
    creds.create = function () { return Promise.reject(denied()); };
    creds.get = function (options) {
      if (options && options.mediation === 'conditional') return Promise.resolve(null);
      return Promise.reject(denied());
    };
    try {
      if (
        typeof PublicKeyCredential !== 'undefined' &&
        PublicKeyCredential &&
        typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
      ) {
        PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = function () {
          return Promise.resolve(false);
        };
      }
    } catch (e) { /* ignore */ }
  } catch (e) { /* never break the host page */ }
})();`;
}
