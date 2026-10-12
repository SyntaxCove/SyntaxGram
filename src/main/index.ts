// Application entry point (main process).
import { app, Menu } from 'electron';
import path from 'node:path';
import { DownloadManager } from './core/DownloadManager';
import { HistoryManager } from './core/HistoryStore';
import { SettingsManager } from './core/SettingsStore';
import { MainWindowController } from './app/MainWindow';
import { createTray } from './app/TrayMenu';
import { registerIpc } from './ipc/registerIpc';

const SMOKE =
  process.env.IGD_SMOKE === '1' || process.argv.includes('--igd-smoke');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let controller: MainWindowController | null = null;
  let settings: SettingsManager | null = null;
  let downloads: DownloadManager | null = null;
  let history: HistoryManager | null = null;

  app.on('second-instance', () => controller?.showPage('instagram'));

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);

    if (SMOKE) {
      process.on('uncaughtException', (e) => {
        console.error('SMOKE_FAIL', e);
        app.exit(1);
      });
      process.on('unhandledRejection', (e) => {
        console.error('SMOKE_FAIL', e);
        app.exit(1);
      });
    }

    const userData = app.getPath('userData');
    settings = new SettingsManager(path.join(userData, 'settings.json'));
    history = new HistoryManager(path.join(userData, 'history.json'));

    controller = new MainWindowController({
      getMinimizeToTray: () => settings!.get().minimizeToTray,
      getTheme: () => settings!.get().theme,
      getUserAgent: () => settings!.get().userAgent,
    });
    controller.create();

    const emit = (channel: string, payload: unknown) => {
      try {
        controller?.win?.webContents.send(channel as never, payload as never);
      } catch {
        /* window may be gone during shutdown */
      }
    };

    downloads = new DownloadManager({
      settings: settings!,
      history: history!,
      session: controller.igSession,
      getUserAgent: () => controller!.userAgent,
      userDataPath: userData,
      emit,
    });
    downloads.init();
    registerIpc({ controller, settings: settings!, downloads, history: history! });

    // Bundled app: process.resourcesPath contains extraResources. In dev,
    // derive the resources dir from the bundle location (dist/main/../..)
    // instead of process.cwd(), which depends on how the app was launched.
    const resourcesDir = app.isPackaged
      ? process.resourcesPath
      : path.resolve(__dirname, '../../resources');
    let tray: ReturnType<typeof createTray> | null = null;
    try {
      tray = createTray(resourcesDir, {
        openPage: (page) => controller?.showPage(page),
        pauseAll: () => downloads?.pauseAll(),
        resumeAll: () => downloads?.resumeAll(),
        quit: () => {
          controller?.markQuitting();
          app.quit();
        },
      });
    } catch (e) {
      console.error('[tray] creation failed', e);
    }

    app.on('before-quit', () => {
      controller?.markQuitting();
      downloads?.flush();
      tray?.destroy();
    });

    app.on('window-all-closed', () => {
      app.quit();
    });

    if (SMOKE) {
      setTimeout(() => {
        console.log('IGD_SMOKE_OK');
        const snap = downloads!.snapshot();
        console.log('IGD_SMOKE_STATS', JSON.stringify(snap.stats));
        app.exit(0);
      }, 6000);
    }
  });
}
