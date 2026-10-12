# SyntaxGram

یک کلاینت دسکتاپ Windows-first برای **نسخه واقعی و رسمی وب اینستاگرام** با امکانات جانبی دانلود، صف مدیریت‌شده و Keyboard Shortcuts.

این برنامه اینستاگرام را از صفر بازسازی نمی‌کند؛ بلکه `https://www.instagram.com` را داخل یک `WebContentsView` امن اجرا می‌کند و لایه‌های جانبی (دکمه دانلود، صف، تاریخچه، تنظیمات) را در کنار آن اضافه می‌کند. **Login دقیقاً توسط خود اینستاگرام انجام می‌شود** و برنامه هیچ فرم ورود یا ذخیره‌سازی رمز عبور / 2FA ندارد.

---

## ویژگی‌ها

- **تجربه مرورگر اختصاصی اینستاگرام** — Home، Explore، Reels، Stories، پست‌ها، Login/Logout با session دائمی (پس از بستن و بازکردن برنامه، لاگین باقی می‌ماند)
- **تم روشن به‌عنوان ظاهر پیش‌فرض** — با گزینه Dark در Settings برای محیط کم‌نور (+ تم dialog ها و toast های داخل صفحه اینستاگرام هم روشن است)
- **دکمه Download روی پست‌ها** (در همان ردیف و بلافاصله کنار دکمه Like)، **دکمه Download شناور در گوشه** روی Story/Reel و مودال **Download Carousel** (اسلاید فعلی / همه اسلایدها)
- **Keyboard Shortcuts قابل تغییر در Settings** — پیش‌فرض‌ها: `L` لایک، `D` دانلود همه، `Ctrl+D` دانلود اسلاید فعلی؛ هر سه از بخش Settings → Keyboard shortcuts با کلیک روی **Change** و فشردن کلیدهای جدید قابل تغییرند (بررسی تداخل خودکار، بدون نیاز به reload؛ روی Feed، پست، Reel و Story کار می‌کند — حتی وقتی فوکوس کیبورد روی پوسته اپ است — و هرگز هنگام تایپ)
- **User-Agent اختیاری** — از Settings → Application؛ خالی = پیش‌فرض داخلی حفظ می‌شود، مقدار سفارشی پس از یک reload خودکار اعمال می‌شود
- **صف دانلود حرفه‌ای** — FIFO با قابلیت reorder، تعداد دانلود همزمان قابل تنظیم (۱ تا ۱۰)، Pause/Resume/Cancel/Retry/Delete
- **تاریخچه و Failed Downloads** با دلیل خطا و تعداد تلاش
- **نام‌گذاری استاندارد** — `<username>-<unix_timestamp>.<ext>` و مدیریت collision با پسوند `-01`، `-02`
- **ساختار پوشه** — `<DownloadRoot>/<username>/images|videos`
- **تنظیمات کامل** — تم روشن/تیره، پوشه دانلود (Native Folder Picker)، تعداد دانلود همزمان، تعداد Retry، رفتار فایل تکراری، نوتیفیکیشن، Start with Windows، Minimize to Tray، تغییر Keyboard Shortcuts و User-Agent سفارشی
- **Windows Integration** — نصب‌کننده NSIS، Start Menu، Tray، Notification های نیتیو، Open File/Folder

## امنیت و حریم خصوصی

- `contextIsolation: true` و `nodeIntegration: false` و `sandbox: true` در همه window ها
- Renderer هیچ دسترسی‌ای به Node.js / fs / shell ندارد؛ فقط یک API تایپ‌دار محدود (`window.instagramApp`)
- هر پیام IPC در Main با validator سخت‌گیرانه بررسی می‌شود
- URL ها فقط از هاست‌های رسمی `*.instagram.com / *.cdninstagram.com / *.fbcdn.net` با scheme ‌های `https` پذیرفته می‌شوند؛ `javascript:` / `data:` / `file:` / `blob:` رد می‌شوند
- مسیر مقصد همیشه داخل Download Root تعیین‌شده توسط backend تصحیح (canonicalize) می‌شود؛ path traversal غیرممکن است
- فایل‌ها به‌صورت atomic ذخیره می‌شوند (ابتدا `.part`، سپس rename) و با magic bytes اعتبارسنجی می‌شوند
- **هیچ bypass، API خصوصی، دور زدن anti-bot/rate-limit یا DRM انجام نمی‌شود.** اگر مدیایی فقط با دور زدن مکانیزم‌های حفاظتی قابل دریافت باشد، آن آیتم `Failed/Unsupported` گزارش می‌شود
- هیچ Credential logging وجود ندارد

## استک فناوری

| بخش | فناوری |
|---|---|
| Shell | Electron 44 (Main + WebContentsView) |
| UI | React 19 + Tailwind CSS 4 + Zustand + Lucide |
| Build | Vite 8 (۴ باندل مجزا: main / preload / injection / renderer) |
| زبان | TypeScript 5.9 (strict) |
| تست | Vitest |
| بسته‌بندی | electron-builder (NSIS) |
| Storage | JSON store داخلی با نوشتن atomic (بدون dependency بومی) |

## پیش‌نیازها

- **Node.js ≥ 22.12** و npm
- Windows 10/11 برای build نهایی (توسعه روی Linux/macOS هم ممکن است)

## راه‌اندازی (Development)

```bash
npm install
npm run dev
```

`npm run dev` سه باندل main/preload/injection را در حالت watch می‌سازد، dev-server رندرر را روی پورت 5173 بالا می‌آورد و Electron را اجرا می‌کند.

## تست و بررسی

```bash
npm run typecheck   # دو tsconfig مجزا (node/web)
npm run test        # Vitest: صف، نام‌گذاری، URL guard، path guard، mime، خطاها، shortcut ها
npm run lint
```

## ساخت نصب‌کننده Windows

```bash
npm run icon        # تولید resources/icon.png / icon.ico / tray.png (نیاز به Python + Pillow)
npm run dist        # typecheck + build + electron-builder --win (NSIS x64)
```

خروجی در پوشه `release/` قرار می‌گیرد: `SyntaxGram Setup 0.2.2.exe`

## ساختار پروژه

```
src/
├── shared/          ← تایپ‌ها، کانال‌های IPC، validator ها (قرارداد واحد همه لایه‌ها)
├── main/            ← Main Process
│   ├── app/         ← MainWindow + WebContentsView، Tray
│   ├── core/        ← DownloadQueue (pure)، Downloader (استریمی)، DownloadManager،
│   │                   MediaRegistry، JsonStore، Settings، History، urlGuard، pathGuard…
│   └── ipc/         ← ثبت handler ها با validation کامل
├── preload/         ← window.instagramApp (رندرر) + window.instagramBridge (ویو اینستاگرام)
├── injection/       ← لایه بهبود اینستاگرام: Adapters + Resolvers + UI (بدون Node.js)
└── renderer/        ← UI اپلیکیشن (Dashboard، Instagram، Downloads، Queue، Failed، History، Settings)
```

### معماری دانلود

```
UI / Injection Layer
        ↓  (validated payload)
DownloadManager  ←  تنها نقطه ورود دانلود (§29)
        ↓
DownloadQueue (FIFO + concurrency + retry/backoff)
        ↓
Downloader (net.request روی session اینستاگرام، استریمی، .part → rename)
        ↓
File Writer + magic-byte validation + native notification
```

### MediaResolver (§10)

ترتیب اولویت: `DOMResolver` → `MetadataResolver` → `ResourceResolver` → `NetworkResourceResolver` — هیچ‌کدام به یک CSS selector واحد وابسته نیستند؛ از ساختار معنایی (`article`، `dialog`، دکمه‌های aria-label دار)، srcset، Open-Graph/JSON-LD و رکوردهای network session استفاده می‌شود. Selector ها تنها در `injection/adapters/selectors.ts` نگهداری می‌شوند (§11/§46).

## محدودیت‌های شناخته‌شده (MVP)

- ویدیوهایی که فقط با MSE/blob پخش می‌شوند تنها زمانی قابل دانلود هستند که URL واقعی mp4 در همان session دیده شده باشد (MediaRegistry)
- URL های CDN اینستاگرام منقضی می‌شوند؛ اگر یک Job مدتی در صف بماند ممکن است با `HTTP_403/404` fail شود — کافی است آن را از Failed دوباره تلاش کنید تا URL تازه از صفحه گرفته شود (Retry آیتم‌های خیلی قدیمی باید از روی صفحه انجام شود)
- Tamper-proof بودن در برابر تغییرات DOM اینستاگرام تضمین صددرصدی نیست؛ چون همه selector ها در یک فایل متمرکزند، نگهداری آسان است

## عیب‌یابی

- **ویندوز SmartScreen هشدار داد:** فایل نصب امضای دیجیتال ندارد؛ «More info → Run anyway» را انتخاب کنید
- **لاگین باز نمی‌شود:** از دکمه Reload در toolbar استفاده کنید؛ session در پارتیشن `persist:instagram` ذخیره می‌شود
- **دکمه دانلود ظاهر نمی‌شود:** لایه injection پس از هر navigation دوباره اجرا می‌شود؛ یک بار Reload کنید
- **خطای DISK_FULL:** فضای دیسک Download Root را بررسی کنید

## لایسنس

کد این پروژه تحت **MIT License** منتشر شده است — استفاده، تغییر و بازنشر آزاد است، **به شرط ذکر منبع**: اعلان کپی‌رایت و این لایسنس باید در همهٔ کپی‌ها حفظ شود و به ریپوی اصلی (<https://github.com/SyntaxCove/SyntaxGram>) ارجاع داده شود (در سورس، مستندات یا بخش About اثر مشتق‌شده).

**نام و برندینگ استثناست:** نام «SyntaxGram»، لوگو، نام نصب‌کننده و همهٔ برندینگ مرتبط تحت لایسنس MIT **منتشر نمی‌شوند** و متعلق به SyntaxCove هستند. هیچ مجوزی برای استفاده از این نام (یا نامی مشابه و گمراه‌کننده) برای fork، اثر مشتق‌شده یا محصول دیگری داده نمی‌شود — اثرهای مشتق‌شده باید با نامی متفاوت منتشر شوند. جزئیات کامل در فایل [LICENSE](./LICENSE).
