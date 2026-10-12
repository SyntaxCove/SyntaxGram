# Generates the application icon (Instagram-style gradient + camera glyph):
#   resources/icon.png  (512px, used for dev/window icon)
#   resources/icon.ico  (multi-size, used by electron-builder for the exe/installer)
#   resources/tray.png  (32px)
from PIL import Image, ImageDraw
import os

S = 512
MARGIN = 16
RADIUS = 120
STROKE = 26

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
grad = Image.new("RGBA", (S, S))
top = (131, 58, 180)    # #833AB4
mid = (225, 48, 108)    # #E1306C
bot = (247, 119, 55)    # #F77737

px = grad.load()
for y in range(S):
    for x in range(S):
        t = (x + y) / (2 * S)
        if t < 0.5:
            k = t / 0.5
            c = tuple(int(top[i] + (mid[i] - top[i]) * k) for i in range(3))
        else:
            k = (t - 0.5) / 0.5
            c = tuple(int(mid[i] + (bot[i] - mid[i]) * k) for i in range(3))
        px[x, y] = (*c, 255)

mask = Image.new("L", (S, S), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([MARGIN, MARGIN, S - MARGIN, S - MARGIN], radius=RADIUS, fill=255)
img.paste(grad, (0, 0), mask)

d = ImageDraw.Draw(img)
white = (255, 255, 255, 255)
# camera body
d.rounded_rectangle([136, 136, S - 136, S - 136], radius=96, outline=white, width=STROKE)
# lens
c = S // 2
d.ellipse([c - 74, c - 74, c + 74, c + 74], outline=white, width=STROKE)
# flash dot
d.ellipse([330, 178, 358, 206], fill=white)

out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "resources")
os.makedirs(out, exist_ok=True)
img.save(os.path.join(out, "icon.png"))
img.save(
    os.path.join(out, "icon.ico"),
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
img.resize((32, 32), Image.LANCZOS).save(os.path.join(out, "tray.png"))
print("icons written to", out)
