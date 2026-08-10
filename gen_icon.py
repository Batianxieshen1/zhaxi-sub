#!/usr/bin/env python3
"""生成「朝夕」应用图标（Abstract Editorial 风格）：
暖象牙白天空 + 深墨太阳 + 两条柔和色带（雾蓝/陶土）。
纯标准库手写 PNG，无外部依赖。输出：icon-512/192/apple-touch-icon.png"""
import zlib, struct, math, os

# 调色板（muted palette，低饱和）
IVORY   = (242, 237, 227, 255)   # 暖象牙白（天空/面板）
INK     = (58, 59, 64, 255)      # 深墨（太阳）
MIST    = (143, 163, 184, 255)   # 雾蓝（色带 1）
CLAY    = (196, 138, 110, 255)   # 陶土（色带 2）

def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))

def rounded_rect_sdf(px, py, cx, cy, hw, hh, r):
    qx = abs(px - cx) - (hw - r)
    qy = abs(py - cy) - (hh - r)
    ax, ay = max(qx, 0.0), max(qy, 0.0)
    return math.hypot(ax, ay) + min(max(qx, qy), 0.0) - r

def circle_sdf(px, py, cx, cy, r):
    return math.hypot(px - cx, py - cy) - r

def alpha_from(d):
    return clamp(0.5 - d, 0.0, 1.0)

def band_color(y, size):
    """水平色带：雾蓝在上、陶土在下（y 为 0..size 像素坐标）"""
    u = y / size
    if 0.62 <= u < 0.79:
        return MIST
    if 0.79 <= u < 0.96:
        return CLAY
    return None  # 天空/留白

def make_icon(size):
    px = bytearray()
    cx_sun, cy_sun, r_sun = size * 0.5, size * 0.53, size * 0.135
    for y in range(size):
        px.append(0)
        for x in range(size):
            u, v = x + 0.5, y + 0.5
            bg_d = rounded_rect_sdf(u, v, size / 2, size / 2, size / 2, size / 2, size * 0.22)
            bg_a = alpha_from(bg_d)
            if bg_a <= 0:
                px += bytes((0, 0, 0, 0))
                continue
            # 深墨太阳优先（压在地平线上）
            sun_d = circle_sdf(u, v, cx_sun, cy_sun, r_sun)
            sun_a = alpha_from(sun_d) * bg_a
            if sun_a > 0:
                px += bytes((INK[0], INK[1], INK[2], int(round(sun_a * 255))))
                continue
            # 色带 / 天空
            c = band_color(v, size) or IVORY
            a = int(round(bg_a * 255))
            px += bytes((c[0], c[1], c[2], a))
    return px

def write_png(path, size, raw):
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    with open(path, 'wb') as f:
        f.write(sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b''))

for size, name in [(512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png')]:
    write_png(name, size, make_icon(size))
    print(f'OK {name} ({size}x{size}, {os.path.getsize(name)} bytes)')
