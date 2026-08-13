#!/usr/bin/env python3
"""部署新 WebView APK 到 dl/"""
import os, shutil, zipfile

BASE = os.getcwd()
src = os.path.join(BASE, 'webview-artifact', 'app-debug.apk')
print('size:', os.path.getsize(src))

with zipfile.ZipFile(src) as z:
    bad = z.testzip()
    print('zip完整:', 'OK' if not bad else bad)

dst = os.path.join(BASE, 'dl', 'Dawn-Ledger-WebView.apk')
shutil.copyfile(src, dst)
print('deployed:', dst, os.path.getsize(dst))
