#!/usr/bin/env python3
"""生成「朝夕」应用图标 v2（Abstract Editorial 风格，复杂版）：
暖象牙白天空 + 深墨太阳 + 日晷主竖笔 + 从属细竖笔 + 三条错位柔色带。
纯标准库手写 PNG。输出：icon-512/192/apple-touch-icon.png"""
import zlib, struct, math, os

# 调色板（muted palette）
IVORY = (242, 237, 227, 255)   # 暖象牙白
INK   = (58, 59, 64, 255)      # 深墨
MIST  = (143, 163, 184, 255)   # 雾蓝
SAND  = (216, 195, 154, 255)   # 沙色
CLAY  = (196, 138, 110, 255)   # 陶土

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

def stroke_alpha(x, y, cx, y0, y1, half_w):
    """竖笔（矩形）带 1px 抗锯齿：宽 2*half_w，从 y0 到 y1"""
    dx = clamp(0.5 - (abs(x - cx) - half_w), 0.0, 1.0)
    if dx <= 0:
        return 0.0
    dy = min(clamp(0.5 - (y0 - y), 0.0, 1.0), clamp(0.5 - (y - y1), 0.0, 1.0))
    return dx * dy

def band_color(x, y, size):
    """三条错位色带：雾蓝 / 沙色（左缺口）/ 陶土"""
    u, v = x / size, y / size
    if 0.60 <= v < 0.71:
        return MIST
    if 0.71 <= v < 0.82:
        return SAND if u >= 0.12 else None
    if 0.82 <= v < 0.93:
        return CLAY
    return None

def make_icon(size):
    px = bytearray()
    cx_sun, cy_sun, r_sun = size * 0.5, size * 0.47, size * 0.13
    for y in range(size):
        px.append(0)
        for x in range(size):
            u, v = x + 0.5, y + 0.5
            bg_d = rounded_rect_sdf(u, v, size / 2, size / 2, size / 2, size / 2, size * 0.22)
            bg_a = alpha_from(bg_d)
            if bg_a <= 0:
                px += bytes((0, 0, 0, 0))
                continue
            # 太阳（最后判定，覆盖主笔顶端，形成"指针从太阳垂下"）
            sun_a = alpha_from(circle_sdf(u, v, cx_sun, cy_sun, r_sun)) * bg_a
            if sun_a > 0:
                px += bytes((INK[0], INK[1], INK[2], int(round(sun_a * 255))))
                continue
            # 从属竖笔 → 主竖笔（深墨，从属更细更短）
            sub_a = stroke_alpha(u, v, size * 0.72, size * 0.66, size * 0.88, size * 0.010) * bg_a
            main_a = stroke_alpha(u, v, size * 0.5, size * 0.47, size * 0.96, size * 0.0175) * bg_a
            if sub_a > 0:
                px += bytes((INK[0], INK[1], INK[2], int(round(sub_a * 255))))
                continue
            if main_a > 0:
                px += bytes((INK[0], INK[1], INK[2], int(round(main_a * 255))))
                continue
            # 色带 / 天空
            c = band_color(u, v, size) or IVORY
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
