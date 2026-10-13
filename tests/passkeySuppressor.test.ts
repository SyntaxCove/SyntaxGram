// Passkey prompt suppression (v0.2.3, user report: a native "Sign in with a
// passkey" Windows Security modal popped up on the login page inside the app,
// while the regular browser showed nothing). Covers BOTH install forms:
// the typed `installPasskeySuppressor()` used by the injection layer and the
// shipped `passkeySuppressorSource()` string that the preload evaluates in
// the page's main world (and the main process evaluates in child frames).
import { describe, expect, it } from 'vitest';
import { installPasskeySuppressor, passkeySuppressorSource } from '../src/shared/passkeySuppressor';

interface FakeCredentials {
  get: (options?: { mediation?: string }) => Promise<unknown>;
  create: () => Promise<unknown>;
}

interface FakeScope {
  navigator: { credentials: FakeCredentials | null };
  PublicKeyCredential?: { isUserVerifyingPlatformAuthenticatorAvailable: () => Promise<boolean> };
  __igdPasskeyPatched?: boolean;
}

/** Builds a scope that mimics a real page: real-looking WebAuthn surface. */
function makeScope(): FakeScope {
  return {
    navigator: {
      credentials: {
        get: () => Promise.reject(new Error('real WebAuthn request (would open the OS modal)')),
        create: () => Promise.reject(new Error('real WebAuthn request (would open the OS modal)')),
      },
    },
    PublicKeyCredential: { isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(true) },
  };
}

describe('installPasskeySuppressor', () => {
  it('patches the WebAuthn surface and reports success once', () => {
    const scope = makeScope();
    expect(installPasskeySuppressor(scope as unknown as Window)).toBe(true);
    expect(scope.__igdPasskeyPatched).toBe(true);
    // Second install is a no-op (idempotency marker).
    expect(installPasskeySuppressor(scope as unknown as Window)).toBe(false);
  });

  it('rejects non-conditional get() with NotAllowedError (no OS modal)', async () => {
    const scope = makeScope();
    installPasskeySuppressor(scope as unknown as Window);
    await expect(scope.navigator.credentials!.get({ mediation: 'required' })).rejects.toMatchObject({
      name: 'NotAllowedError',
    });
    await expect(scope.navigator.credentials!.get()).rejects.toMatchObject({ name: 'NotAllowedError' });
  });

  it('resolves conditional mediation with null (Chrome-like silent no-op)', async () => {
    const scope = makeScope();
    installPasskeySuppressor(scope as unknown as Window);
    await expect(scope.navigator.credentials!.get({ mediation: 'conditional' })).resolves.toBeNull();
  });

  it('rejects create() so passkey registration prompts cannot appear', async () => {
    const scope = makeScope();
    installPasskeySuppressor(scope as unknown as Window);
    await expect(scope.navigator.credentials!.create()).rejects.toMatchObject({ name: 'NotAllowedError' });
  });

  it('hides the platform authenticator from Instagram UI logic', async () => {
    const scope = makeScope();
    installPasskeySuppressor(scope as unknown as Window);
    await expect(scope.PublicKeyCredential!.isUserVerifyingPlatformAuthenticatorAvailable()).resolves.toBe(false);
  });

  it('returns false (and does not throw) when navigator.credentials is missing', () => {
    const scope: FakeScope = { navigator: { credentials: null } };
    expect(installPasskeySuppressor(scope as unknown as Window)).toBe(false);
    expect(scope.__igdPasskeyPatched).toBeUndefined();
  });
});

describe('passkeySuppressorSource', () => {
  // Evaluates the exact string that ships to the page, so the tested artifact
  // is the deployed artifact (not just the typed twin).
  function evalSource(scope: FakeScope): void {
    new Function('window', 'navigator', 'PublicKeyCredential', passkeySuppressorSource())(
      scope,
      scope.navigator,
      scope.PublicKeyCredential,
    );
  }

  it('evaluated source patches the same way as the typed function', async () => {
    const scope = makeScope();
    evalSource(scope);
    expect(scope.__igdPasskeyPatched).toBe(true);
    await expect(scope.navigator.credentials!.get({ mediation: 'required' })).rejects.toMatchObject({
      name: 'NotAllowedError',
    });
    await expect(scope.navigator.credentials!.get({ mediation: 'conditional' })).resolves.toBeNull();
    await expect(scope.navigator.credentials!.create()).rejects.toMatchObject({ name: 'NotAllowedError' });
    await expect(scope.PublicKeyCredential!.isUserVerifyingPlatformAuthenticatorAvailable()).resolves.toBe(false);
  });

  it('is idempotent — a second evaluation is a no-op', async () => {
    const scope = makeScope();
    evalSource(scope);
    const patchedGet = scope.navigator.credentials!.get;
    evalSource(scope);
    // Same patched function is still in place (not double-wrapped), and the
    // guard still behaves identically.
    expect(scope.navigator.credentials!.get).toBe(patchedGet);
    await expect(scope.navigator.credentials!.get({ mediation: 'conditional' })).resolves.toBeNull();
  });

  it('does nothing (without throwing) on scopes without a credentials container', () => {
    const scope: FakeScope = { navigator: { credentials: null } };
    expect(() => evalSource(scope)).not.toThrow();
    expect(scope.__igdPasskeyPatched).toBeUndefined();
  });
});
