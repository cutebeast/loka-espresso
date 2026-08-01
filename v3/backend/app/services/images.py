"""Server-side image compression for uploads.

All upload endpoints pass image bytes through `compress_image` before saving:
resize to a sane maximum edge and re-encode (progressive JPEG for opaque
images, optimized PNG for transparency). Animated GIFs pass through
untouched (re-encoding would drop frames). Undecodable input is returned
unchanged — the caller's magic-byte validation is the gate, this is an
optimizer, not a validator.
"""

from __future__ import annotations

import io
import logging

logger = logging.getLogger(__name__)

# Max pixel edge per upload kind
MAX_EDGE_DEFAULT = 1600   # banners, promos, menu, content images
MAX_EDGE_AVATAR = 400     # customer avatars (shown ≤96px)
MAX_EDGE_EQUIPMENT = 1200  # staff equipment photos


def compress_image(contents: bytes, ext: str, max_edge: int = MAX_EDGE_DEFAULT, quality: int = 80) -> tuple[bytes, str]:
    """Compress *contents* and return ``(bytes, ext)`` — the extension may
    change (opaque PNG/WebP → .jpg) so callers must use the returned ext for
    the filename.
    """
    if ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        return contents, ext  # not an image we optimize

    try:
        from PIL import Image
    except ImportError:  # pragma: no cover — pillow is a hard dep
        logger.warning("Pillow unavailable — saving upload uncompressed")
        return contents, ext

    # Decompression-bomb guard: a small compressed PNG can decode to GBs of
    # RAM. Make Pillow hard-error past the pixel budget and reject oversize
    # images ourselves (returned unchanged — this is an optimizer, not a
    # validator).
    Image.MAX_IMAGE_PIXELS = 40_000_000

    try:
        img = Image.open(io.BytesIO(contents))
        w, h = img.size
        if w * h > Image.MAX_IMAGE_PIXELS:
            logger.warning("Oversize image (%dx%d pixels) — saving unchanged", w, h)
            return contents, ext
        img.load()
    except Exception:
        return contents, ext  # not decodable — save as-is

    # Animated GIF: keep as-is (re-encoding drops frames)
    if ext == ".gif" and getattr(img, "is_animated", False):
        return contents, ext

    # Resize down to max_edge (never upscale)
    w, h = img.size
    if max(w, h) > max_edge:
        ratio = max_edge / max(w, h)
        img = img.resize((max(1, round(w * ratio)), max(1, round(h * ratio))), Image.LANCZOS)

    has_alpha = img.mode in ("RGBA", "LA", "PA") and (img.mode != "PA" or "transparency" in img.info)

    out = io.BytesIO()
    if has_alpha and ext == ".png":
        img.save(out, format="PNG", optimize=True)
        return out.getvalue(), ".png"

    # Opaque (or alpha on a non-png source) → progressive JPEG on white
    if img.mode not in ("RGB", "L"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if has_alpha:
            background.paste(img.convert("RGBA"), mask=img.convert("RGBA").split()[-1])
        else:
            background.paste(img.convert("RGB"))
        img = background
    img.save(out, format="JPEG", quality=quality, progressive=True, optimize=True)
    return out.getvalue(), ".jpg"
