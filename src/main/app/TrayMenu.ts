// System tray integration (spec §39).
//
// Bug fix: the tray used to show an EMPTY SQUARE. Two causes:
// 1. In packaged builds the `resources/` folder was never shipped (electron-
//    builder only uses buildResources at build time), so createFromPath()
//    returned an empty image. Fixed via `extraResources` in
//    electron-builder.yml.
// 2. In dev mode the path depended on process.cwd(); it now derives from the
//    bundle location (dist/main -> project resources). The menu also walks a
//    fallback chain (tray.png -> icon.png -> icon.ico -> embedded data URL)
//    so a visible icon is guaranteed in every launch mode.
import { Menu, nativeImage, Tray } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export interface TrayActions {
  openPage(page: string): void;
  pauseAll(): void;
  resumeAll(): void;
  quit(): void;
}

/** 16x16 PNG of the app icon, embedded so the tray is never blank even if
 * every resource file is missing on disk. */
const FALLBACK_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAC8klEQVR42lWTPWjdZRTGf+e8H/+b3MTcW0iTILYVESSCIkgsOIggODioiOAHaAepQzu5OoRsgoMOVrAqpQSHQiEoFFwslYLWdCi1FjpVh4I21kqT3Nx7/+/HcUgoOBzOGZ7n4ZyH88gyy7rCSv34qa8Ozna6r7gyWnCMaCxLsEykJdRCQ7JJKpNSbm+2298uXfv0prGsAnBiafWlrgunOtTZSCJapiERba/I9+eGhK/t3VR23nv46ok1+eLZ0wcky/Vp1amat3JjWaIWIplQ9wSkEC0RSku0ZDNOfJLxsIb2Ca+5vj6tzVTJ93JD8dFVdGuA5DFhQgmWcDsDvKs0XU+ohaGk3JtwE9tmb3hf83xUtWpZoqvo5jZzhx/i4JtPI22LWsE1ga1vzpN++g3tR5AqeDOlzGkjucS9tXVrl7z44YvcXVtnfPMv8h8bDM5eZOGjd+k+vwijLbSpaCgioRTf1CyNCIWMpDGH3lni1iffM3P4ESb6HaQU2LfIvS/P8cCRF7izvo4EhwYQS+IDmQjkmgiTiuyMmHpsnu7+LreOfk6sYxZOHsP2dbDtAa4XEU1IEKQWfKQlmqGWCCTUKl4NSqWpY9S1WK3opAMxJBTEF9TLLjbUQlRBpeC2B7huw/DaTazXMPfZ+5gVpA5pf71BfPwQtFvoZAcJhtaCNiS7/yS+srl6ntkPXmZ04Qr5zw3snzsMf7jEzPG3GH53Do0ViRn1BY3FfLDkoplJaWm6nnTxKv/6xPTbz2GjMaJGXDzA9qlV2l9+xvU7oC0SxKjJ+Shpo8FELFmoBe1Hxpeu0F6+jJsJSMjQDtBYcP0Oogl8MQ0iUuqGSs5ncxrszDjxaMpIKtqLRftNkVCK+Fq01xTtxYK2BZ/z5AR+YONWOvWMAPz+5LFXp6N+7ZvSx2dcKLtuh91b/9dDoWja3Knt0d7JC2dkN5Ir9fozRx7dH+Nr1af54lpxIYM3dI9MyDSxWIx2++/RaO3B0z/esOVl/Q/v0okKWnKg8QAAAABJRU5ErkJggg==';

function firstExisting(dir: string, names: string[]): string | null {
  for (const name of names) {
    try {
      const p = path.join(dir, name);
      if (p && fs.existsSync(p) && fs.statSync(p).size > 0) return p;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

export function createTray(resourcesDir: string, actions: TrayActions): Tray {
  const iconPath = firstExisting(resourcesDir, ['tray.png', 'icon.png', 'icon.ico']);
  let icon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  if (icon.isEmpty()) icon = nativeImage.createFromDataURL(FALLBACK_ICON_DATA_URL);
  // Tray targets are tiny; resize the (possibly 512px) source and keep the
  // aspect ratio. template images would ignore our colored icon.
  const sized = icon.resize({ width: 16, height: 16, quality: 'best' });
  const tray = new Tray(sized.isEmpty() ? icon : sized);
  tray.setToolTip('SyntaxGram');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Instagram', click: () => actions.openPage('instagram') },
      { label: 'Open Downloads', click: () => actions.openPage('downloads') },
      { type: 'separator' },
      { label: 'Pause All', click: () => actions.pauseAll() },
      { label: 'Resume All', click: () => actions.resumeAll() },
      { type: 'separator' },
      { label: 'Quit', click: () => actions.quit() },
    ]),
  );
  tray.on('click', () => actions.openPage('instagram'));
  return tray;
}
