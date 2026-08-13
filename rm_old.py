#!/usr/bin/env python3
import os
p = 'webview-artifact/app-debug.apk'
if os.path.exists(p):
    os.remove(p)
    print('removed')
