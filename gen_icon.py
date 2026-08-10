#!/usr/bin/env python3
"""生成「朝夕」应用图标 v3（破晓风，高辨识度）：
深蓝紫夜空渐变 + 晨光太阳（橙黄渐变+光晕）+ 荧光青破晓线 + 深色大地 + 星光。
纯标准库手写 PNG。输出：icon-512/192/apple-touch-icon.png"""
import zlib, struct, math, os

# 调色板
NIGHT_TOP = (21, 34, 66)      # 深蓝夜
NIGHT_BOT = (61, 44, 99)      # 深紫
SUN_TOP   = (255, 226, 154)   # 晨光亮黄
SUN_BOT   = (255, 126, 51)    # 落日橙
GLOW      = (255, 170, 80)    # 光晕橙
DAWN_LINE = (94, 234, 212)    # 荧光青（破晓线）
LAND      = (14, 22, 38)      # 深墨蓝大地
STAR      = (255, 255, 255)   # 星光

def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))

def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

def rounded_rect_sdf(px, py, cx, cy, hw, hh, r):
    qx = abs(px - cx) - (hw - r)
    qy = abs(py - cy) - (hh - r)
    ax, ay = max(qx, 0.0), max(qy, 0.0)
    return math.hypot(ax, ay) + min(max(qx, qy), 0.0) - r

def circle_sdf(px, py, cx, cy, r):
    return math.hypot(px - cx, py - cy) - r

def alpha_from(d):
    return clamp(0.5 - d, 0.0, 1.0)

def make_icon(size):
    px = bytearray()
    cx_sun, cy_sun, r_sun = size * 0.5, size * 0.52, size * 0.19
    glow_w = size * 0.11
    # 星光：三颗小白点
    stars = [(0.22, 0.22), (0.74, 0.16), (0.62, 0.32)]
    for y in range(size):
        px.append(0)
        for x in range(size):
            u, v = x + 0.5, y + 0.5
            bg_d = rounded_rect_sdf(u, v, size / 2, size / 2, size / 2, size / 2, size * 0.22)
            bg_a = alpha_from(bg_d)
            if bg_a <= 0:
                px += bytes((0, 0, 0, 0))
                continue
            t = v / size
            col = lerp(NIGHT_TOP, NIGHT_BOT, t)  # 夜空垂直渐变
            # 大地（底部）
            if v >= size * 0.80:
                col = LAND
            # 破晓青线（地平线上方一条细光）
            elif size * 0.765 <= v <= size * 0.795:
                col = DAWN_LINE
            else:
                # 星光
                for (sx, sy) in stars:
                    if alpha_from(circle_sdf(u, v, size * sx, size * sy, size * 0.008)) > 0:
                        col = STAR
                        break
                # 太阳光晕（半透明橙，柔和衰减）
                glow_d = circle_sdf(u, v, cx_sun, cy_sun, r_sun + glow_w)
                glow_a = alpha_from(glow_d) if glow_d < 0 else 0.0
                # 简化：晕圈 alpha 随距离衰减
                d_sun = circle_sdf(u, v, cx_sun, cy_sun, r_sun)
                if d_sun < glow_w * 1.2:
                    g = clamp(1.0 - max(d_sun - r_sun, 0.0) / glow_w, 0.0, 1.0) * 0.5
                    col = lerp(col, GLOW, g)
                # 太阳（橙黄渐变，顶部亮黄 → 底部落日橙）
                if d_sun < 0:
                    tt = clamp((v - (cy_sun - r_sun)) / (2 * r_sun), 0.0, 1.0)
                    col = lerp(SUN_TOP, SUN_BOT, tt)
            a = int(round(bg_a * 255))
            px += bytes((col[0], col[1], col[2], a))
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
