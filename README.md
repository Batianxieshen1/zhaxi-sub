# 🌅 朝夕 · 订阅每日成本

> 把年费细算到每一天，提醒每个订阅的到期日 —— 自用的苹果风 PWA 小工具。

在线使用：[https://batianxieshen1.github.io/zhaxi-sub/](https://batianxieshen1.github.io/zhaxi-sub/)

## ✨ 功能特性

- **双成本视角**：每天 / 每月 / 每年成本总览，财报式大数字排版
- **四种计费周期**：按年、按月、一次性买断（按年限摊销）、自定义时间段（按实际天数）
- **提醒日历**：月视图标记所有订阅到期日，点击查看当天明细，显示本月预计支出
- **今日到期横幅**：打开页面即提示今天有哪些订阅到期
- **取消订阅状态**：停用不删除，统计与提醒自动排除，随时可恢复
- **数据管理**：导出 JSON / CSV（Excel 可开）、导入自动修复脏数据、跨标签页实时同步
- **实时时钟**：年月日星期 + 时分
- **苹果风 UI**：毛玻璃顶栏、分段控件、iOS 开关、弹簧弹窗、卡片错峰入场、数字滚动动画，支持 `prefers-reduced-motion`
- **PWA**：离线可用、主屏幕图标、全屏模式

## 🚀 快速开始

### 在线使用

手机或电脑浏览器打开上面的链接，点击「添加到主屏幕」（iOS Safari 分享按钮 / Android Chrome 菜单）即可像 App 一样使用。

### 本地运行

```bash
# 任意静态服务器即可（或直接双击 index.html）
python -m http.server 8000
# 打开 http://localhost:8000
```

### 数据说明

数据存储在**浏览器本地**（localStorage），不上传任何服务器，换设备时用「导出 → 导入」迁移。

## 🧪 开发

```bash
# 逻辑回归测试（23 组断言，含防回归源码检查）
node verify.mjs

# 重新生成应用图标（纯 Python 标准库，无依赖）
python gen_icon.py
```

- `index.html`：全部应用代码（单文件，零外部依赖）
- `sw.js`：Service Worker（在线时网络优先保证最新版，离线时缓存兜底）
- `verify.mjs`：折算/日历/排序/导入等纯逻辑测试
- `gen_icon.py`：图标生成器（破晓风：夜空 + 晨光太阳）
- `logo-preview.html`：文字 logo 笔画创意方案预览

## 📦 部署

推送到 GitHub 后由 GitHub Pages 自动构建发布：

```bash
git add . && git commit -m "改动说明" && git push
```

## 🛠 技术栈

原生 HTML/CSS/JS（零依赖）、SVG、Service Worker、GitHub Pages。

## 📄 许可证

[MIT](LICENSE)
