#!/usr/bin/env python3
"""生成 PWA 图标：蓝底圆角方块 + 白色日历图形（纯标准库，无外部依赖）。
输出：icon-512.png / icon-192.png / apple-touch-icon.png(180)"""
import zlib, struct, math, os

ACCENT = (0x00, 0x7A, 0xFF, 255)   # iOS 系统蓝
WHITE  = (0xFF, 0xFF, 0xFF, 255)

def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))

def rounded_rect_sdf(px, py, cx, cy, hw, hh, r):
    """点到圆角矩形的有向距离（负=内部）"""
    qx = abs(px - cx) - (hw - r)
    qy = abs(py - cy) - (hh - r)
    ax, ay = max(qx, 0.0), max(qy, 0.0)
    return math.hypot(ax, ay) + min(max(qx, qy), 0.0) - r

def circle_sdf(px, py, cx, cy, r):
    return math.hypot(px - cx, py - cy) - r

def alpha_from(d):
    """1px 抗锯齿：距离 -0.5..0.5 → alpha 1..0"""
    return clamp(0.5 - d, 0.0, 1.0)

def make_icon(size):
    px = bytearray()  # 每行 [filter=0] + RGBA
    for y in range(size):
        px.append(0)
        for x in range(size):
            u, v = x + 0.5, y + 0.5
            # 背景：蓝底圆角方块（圆角 ≈ 22%）
            bg_d = rounded_rect_sdf(u, v, size/2, size/2, size/2, size/2, size * 0.22)
            bg_a = alpha_from(bg_d)
            if bg_a <= 0:
                px += bytes((0, 0, 0, 0)); continue
            # 白色日历框：外框 - 内框
            frame_d = max(
                rounded_rect_sdf(u, v, size/2, size/2, size*0.40, size*0.36, size*0.07),
                -rounded_rect_sdf(u, v, size/2, size/2, size*0.30, size*0.26, size*0.045),
            )
            frame_a = alpha_from(frame_d) * bg_a
            # 顶部提手孔：两个小圆点（蓝色挖空）
            hole1 = circle_sdf(u, v, size*0.40, size*0.155, size*0.028)
            hole2 = circle_sdf(u, v, size*0.60, size*0.155, size*0.028)
            hole_a = alpha_from(hole1) + alpha_from(hole2)
            # 内部日期点阵：3 行 x 4 列 白色圆点
            dots_a = 0.0
            for row in range(3):
                for col in range(4):
                    cx = size * (0.28 + 0.147 * col)
                    cy = size * (0.50 + 0.125 * row)
                    dots_a = max(dots_a, alpha_from(circle_sdf(u, v, cx, cy, size * 0.035)))
            # 合成：白框（去掉孔）+ 白点
            white_a = clamp(frame_a - hole_a + dots_a, 0.0, 1.0) * bg_a
            r = ACCENT[0] * (1 - white_a) + WHITE[0] * white_a
            g = ACCENT[1] * (1 - white_a) + WHITE[1] * white_a
            b = ACCENT[2] * (1 - white_a) + WHITE[2] * white_a
            a = int(round(bg_a * 255))
            px += bytes((int(round(r * bg_a / (bg_a or 1))), int(round(g * bg_a / (bg_a or 1))), int(round(b * bg_a / (bg_a or 1))), a))
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
