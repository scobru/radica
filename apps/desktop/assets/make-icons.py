# Desktop icons from the web app's icon (python3 make-icons.py ../../../ui/public/icon-512.png .): rounded corners,
# then an .ico (Windows), a 512 px PNG (macOS bundle) and raw 64 px RGBA (the Linux window icon, read without an
# image decoder).
import io, struct, sys
from PIL import Image, ImageDraw
src, out = sys.argv[1], sys.argv[2]
big = Image.open(src).convert("RGBA").resize((1024, 1024), Image.LANCZOS)
mask = Image.new("L", big.size, 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, 1023, 1023], radius=228, fill=255)
big.putalpha(mask)
at = lambda n: big.resize((n, n), Image.LANCZOS)

def bmp_entry(im):
    n = im.width
    px = im.tobytes("raw", "BGRA")
    rows = [px[y * n * 4:(y + 1) * n * 4] for y in range(n)][::-1]  # bottom-up
    and_row = b"\x00" * (((n + 31) // 32) * 4)  # alpha carries the shape: an empty AND mask
    return struct.pack("<IiiHHIIiiII", 40, n, n * 2, 1, 32, 0, 0, 0, 0, 0, 0) + b"".join(rows) + and_row * n

def png_entry(im):
    b = io.BytesIO(); im.save(b, "PNG", optimize=True); return b.getvalue()

sizes = [16, 24, 32, 48, 64, 256]
blobs = [png_entry(at(n)) if n == 256 else bmp_entry(at(n)) for n in sizes]
head = struct.pack("<HHH", 0, 1, len(sizes))
offset = 6 + 16 * len(sizes)
for n, blob in zip(sizes, blobs):
    head += struct.pack("<BBBBHHII", n % 256, n % 256, 0, 0, 1, 32, len(blob), offset)
    offset += len(blob)
open(f"{out}/radica.ico", "wb").write(head + b"".join(blobs))
at(512).save(f"{out}/icon-512.png", optimize=True)
open(f"{out}/icon-64.rgba", "wb").write(at(64).tobytes())
