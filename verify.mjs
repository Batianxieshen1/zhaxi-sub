// 验证脚本：从 index.html 提取 <script> 内嵌 JS，在 Node 沙箱中执行后跑断言
// 用法：node verify.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL(process.argv[2] || './index.html', import.meta.url), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('❌ 未找到 <script> 块'); process.exit(1); }

// 浏览器 API 桩：让内嵌 JS 在 Node 中可执行（不触发渲染）
const ctx = {
  console,
  document: { addEventListener() {}, getElementById() { return null; } },
  localStorage: {
    _s: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
  },
  crypto: {
    randomUUID: () => 'uuid-test',
    subtle: globalThis.crypto.subtle,
    getRandomValues: (arr) => globalThis.crypto.getRandomValues(arr),
  },
  TextEncoder: globalThis.TextEncoder,
  TextDecoder: globalThis.TextDecoder,
  btoa: globalThis.btoa,
  atob: globalThis.atob,
  fetch: globalThis.fetch,
  alert() {},
  Blob: class {},
  URL: { createObjectURL: () => '', revokeObjectURL() {} },
  FileReader: class { readAsText() {} },
};
vm.createContext(ctx);
// 追加一行导出：const 声明的词法绑定不会自动挂到 context 上，需在沙箱内显式导出
vm.runInContext(
  m[1] + '\n;globalThis.__exports = { calcCosts, calcSunkCost, summarize, fmtMoney, sortSubs, periodText, renewalText, dateDays, nextRenewalDate, kthRenewalDate, unitInfo, dailyAnalogy, normalizeSub, calEventsForMonth, calEndEventsForMonth, upcomingCharges, filterSubs, majorityCurrency, toBaseCurrency, getBaseCurrency, getRates, mergeSubs, hasForeignCurrencies, __setSubs: (l) => { subs = l; }, DEFAULT_DATA, PRESET_SUBS, COMMON_PAYMENTS, loadSyncSettings, saveSyncSettings, encryptData, decryptData, arrayBufferToBase64, base64ToArrayBuffer, pushWebDAV, pullWebDAV, pushGist, pullGist, testSyncConnection, SYNC_SETTINGS_KEY, DEFAULT_SYNC_SETTINGS };',
  ctx
);
const { calcCosts, calcSunkCost, summarize, fmtMoney, sortSubs, periodText, renewalText, dateDays, nextRenewalDate, kthRenewalDate, unitInfo, dailyAnalogy, normalizeSub, calEventsForMonth, calEndEventsForMonth, upcomingCharges, filterSubs, majorityCurrency, toBaseCurrency, getBaseCurrency, getRates, mergeSubs, hasForeignCurrencies, __setSubs, DEFAULT_DATA, PRESET_SUBS, COMMON_PAYMENTS, loadSyncSettings, saveSyncSettings, encryptData, decryptData, arrayBufferToBase64, base64ToArrayBuffer, pushWebDAV, pullWebDAV, pushGist, pullGist, testSyncConnection, SYNC_SETTINGS_KEY, DEFAULT_SYNC_SETTINGS } = ctx.__exports;

function approx(actual, expected, eps = 1e-9) {
  assert.ok(Math.abs(actual - expected) < eps,
    `期望 ${expected}，实际 ${actual}`);
}

console.log('▶ 折算：按年');
let c = calcCosts({ period: 'yearly', amount: 199 });
approx(c.yearly, 199); approx(c.monthly, 199 / 12); approx(c.daily, 199 / 365);

console.log('▶ 折算：按月');
c = calcCosts({ period: 'monthly', amount: 15 });
approx(c.yearly, 180); approx(c.monthly, 15); approx(c.daily, 180 / 365);

console.log('▶ 折算：一次性 + 年限');
c = calcCosts({ period: 'one_time', amount: 698, years: 3 });
approx(c.yearly, 698 / 3); approx(c.daily, 698 / 3 / 365);

console.log('▶ 折算：一次性缺年限 → 0（不参与统计）');
c = calcCosts({ period: 'one_time', amount: 698, years: 0 });
approx(c.yearly, 0); approx(c.daily, 0);

console.log('▶ 汇总：示例数据');
const s = summarize(DEFAULT_DATA);
const expectYearly = 15 * 12 + 68 + 698 / 3 + (30 / 184) * 365; // Netflix + iCloud + 买断 3 年 + 半年卡 184 天
approx(s.total.yearly, expectYearly);
approx(s.total.monthly, expectYearly / 12);
approx(s.total.daily, expectYearly / 365);
assert.equal(s.byCategory['视频'].count, 1);
assert.equal(s.byCategory['工具'].count, 2);
approx(s.byCategory['工具'].yearly, 68 + 698 / 3);
assert.equal(s.byCategory['其他'].count, 1);

console.log('▶ 格式化');
assert.equal(fmtMoney(0.545), '¥0.55');
assert.equal(fmtMoney(1234.567), '¥1234.57');
assert.equal(fmtMoney(0), '¥0.00');
assert.equal(fmtMoney(0.005), '¥0.005');   // 低于 ¥0.01 → 3 位小数，不显示 ¥0.00
assert.equal(fmtMoney(0.0049), '¥0.005');

console.log('▶ 排序：按每日成本降序');
const sortedDaily = sortSubs(DEFAULT_DATA, 'daily');
assert.equal(sortedDaily[0].id, 'demo-3'); // 698/3/365 ≈ 0.64/天，最贵
assert.equal(sortedDaily[2].id, 'demo-2'); // 68/365 ≈ 0.19/天，最便宜

console.log('▶ 排序：按名称（中文拼音）');
const sortedName = sortSubs(DEFAULT_DATA, 'name');
assert.equal(sortedName.length, 4);

console.log('▶ 周期描述');
assert.equal(periodText({ period: 'monthly', amount: 15 }), '¥15.00/月');
assert.equal(periodText({ period: 'yearly', amount: 68 }), '¥68.00/年');
assert.equal(periodText({ period: 'one_time', amount: 698, years: 3 }), '¥698.00 买断 / 3 年');
assert.equal(periodText({ period: 'one_time', amount: 698, years: 0 }), '¥698.00 买断');

console.log('▶ 下次续费日（注入 now 测试）');
const fmtDate = (d) => d ? (d.getMonth() + 1) + '月' + d.getDate() + '日' : '';
assert.equal(fmtDate(nextRenewalDate({ period: 'monthly', start: '2026-08-06' }, '2026-08-06')), '8月6日');    // 当天
assert.equal(fmtDate(nextRenewalDate({ period: 'monthly', start: '2026-08-06' }, '2026-08-10')), '9月6日');    // 已过 → 下月
assert.equal(fmtDate(nextRenewalDate({ period: 'monthly', start: '2026-01-31' }, '2026-02-10')), '2月28日');   // 2 月无 31 号 → 月末
assert.equal(fmtDate(nextRenewalDate({ period: 'monthly', start: '2026-01-31' }, '2026-04-10')), '4月30日');   // 30 天月 rollover
assert.equal(fmtDate(nextRenewalDate({ period: 'yearly', start: '2025-11-15' }, '2026-08-06')), '11月15日');  // 今年
assert.equal(fmtDate(nextRenewalDate({ period: 'yearly', start: '2026-08-06' }, '2026-08-06')), '8月6日');     // 当天
assert.equal(fmtDate(nextRenewalDate({ period: 'yearly', start: '2026-03-01' }, '2026-08-06')), '3月1日');     // 已过 → 明年
assert.equal(nextRenewalDate({ period: 'yearly', start: '' }, '2026-08-06'), null);
assert.equal(renewalText({ period: 'one_time', start: '2026-08-06' }), '');
assert.equal(renewalText({ period: 'custom', start: '2026-03-01', end: '2026-08-31' }), '');
// 续费日必须带年份，避免跨年歧义；可带天数紧迫度后缀（如「 · 6 天后」「 · 今天到期」）
assert.match(renewalText({ period: 'monthly', start: '2026-08-06' }), /^下次续费：\d{4}年\d{1,2}月\d{1,2}日( · (今天到期|明天|\d+ 天后))?$/);
assert.match(renewalText({ period: 'yearly', start: '2026-08-06' }), /^下次续费：\d{4}年\d{1,2}月\d{1,2}日( · (今天到期|明天|\d+ 天后))?$/);

console.log('▶ 边界：金额为 0 / 非法日期');
c = calcCosts({ period: 'yearly', amount: 0 });
approx(c.yearly, 0); approx(c.daily, 0);
assert.equal(renewalText({ period: 'monthly', start: 'not-a-date' }), '');

console.log('▶ 自定义时间段');
// 2026-03-01 ~ 2026-08-31 = 184 天（含头含尾）
assert.equal(dateDays('2026-03-01', '2026-08-31'), 184);
assert.equal(dateDays('2026-03-01', '2026-03-31'), 31);
assert.equal(dateDays('2026-03-01', ''), 0);            // 缺结束日
assert.equal(dateDays('2026-03-01', '2026-02-01'), 0);  // 结束早于开始
c = calcCosts({ period: 'custom', amount: 30, start: '2026-03-01', end: '2026-08-31' });
approx(c.daily, 30 / 184);                  // 每天成本 = 金额 ÷ 实际天数
approx(c.monthly, (30 / 184) * 365 / 12);
approx(c.yearly, (30 / 184) * 365);
assert.equal(
  periodText({ period: 'custom', amount: 30, start: '2026-03-01', end: '2026-08-31' }),
  '¥30.00 / 2026-03-01 ~ 2026-08-31（184 天）'
);
assert.equal(renewalText({ period: 'custom', start: '2026-03-01', end: '2026-08-31' }), '');
// 缺日期的自定义时间段 → 0（不参与统计）
c = calcCosts({ period: 'custom', amount: 30, start: '2026-03-01', end: '' });
approx(c.yearly, 0);

console.log('▶ 每日成本类比');
assert.equal(dailyAnalogy(30), '≈ 一天一顿火锅');
assert.equal(dailyAnalogy(10), '≈ 一天一杯奶茶');
assert.equal(dailyAnalogy(2.5), '≈ 一天一瓶饮料');
assert.equal(dailyAnalogy(1.48), '≈ 一天一个包子');
assert.equal(dailyAnalogy(0.2), '≈ 一天不到五毛钱');

console.log('▶ 导入规范化');
const dirty = [
  { name: '   ', period: 'hack', amount: 'abc' },                        // 全脏
  { name: '正常', period: 'monthly', amount: '15', category: ' 工具 ' }, // 字符串数字 + 空白
  { period: 'yearly', amount: -5 },                                      // 负金额 + 缺 name/id
];
const clean = dirty.map(normalizeSub);
assert.equal(clean[0].name, '未命名');
assert.equal(clean[0].period, 'yearly');     // 非法周期 → 按年
assert.equal(clean[0].amount, 0);            // 非数字金额 → 0
assert.ok(clean[0].id.startsWith('imp-'));   // 补 id
assert.equal(clean[1].amount, 15);           // '15' → 15
assert.equal(clean[1].category, '工具');     // 去空白
assert.equal(clean[1].years, null);          // 非一次性 → years 置空
assert.equal(clean[2].amount, 0);            // 负金额 → 0
const once = normalizeSub({ name: 'x', period: 'one_time', amount: 10, years: '3' });
assert.equal(once.years, 3);                 // 一次性 → years 转数字

console.log('▶ 源码结构（防回归）');
// 历史 bug：subs 曾声明在 init() 内部（局部变量），onSubmit 引用时抛 ReferenceError，点保存无反应
assert.match(m[1], /let subs = \[\];/);                                        // 顶层声明
assert.doesNotMatch(m[1], /function init\(\) \{\n\s+let subs = loadSubs\(\)/); // init 内不得再声明
// 历史 bug：开关「计入统计」保存映射写反（checked=true → active=false → 新订阅默认被划掉）
assert.match(m[1], /active:\s*f\('fActive'\)\.checked/);          // 勾选=计入统计（正面语义）
assert.doesNotMatch(m[1], /active:\s*!f\('fActive'\)\.checked/);  // 禁止取反

console.log('▶ 提醒日历：续费事件分布');
__setSubs([
  { id: 'm1', name: '月付A', period: 'monthly', amount: 15, start: '2026-08-06' },     // 每月 6 号
  { id: 'y1', name: '年付B', period: 'yearly', amount: 68, start: '2026-03-01' },      // 每年 3/1
  { id: 'y2', name: '年付C', period: 'yearly', amount: 99, start: '2025-08-06' },      // 每年 8/6
  { id: 'o1', name: '买断D', period: 'one_time', amount: 698, years: 3, start: '2026-01-01' }, // 无续费日
  { id: 'c1', name: '时段E', period: 'custom', amount: 30, start: '2026-03-01', end: '2026-08-31' }, // 无续费日
  { id: 'm2', name: '月末付F', period: 'monthly', amount: 10, start: '2026-01-31' },  // 31 号 → 2 月落到 28
]);
let ev = calEventsForMonth(2026, 7); // 2026 年 8 月
assert.ok(ev[6] && ev[6].length === 2, '8 月 6 日应有 2 笔（月付A + 年付C）');
assert.equal(ev[1], undefined, '8 月 1 日不应有年付B（它是 3 月的）');
assert.ok(!ev[6].some((s) => s.id === 'o1' || s.id === 'c1'), '一次性/自定义不产生事件');
ev = calEventsForMonth(2026, 2); // 3 月
assert.ok(ev[1] && ev[1].length === 1 && ev[1][0].id === 'y1', '3 月 1 日只有年付B');
ev = calEventsForMonth(2026, 1); // 2 月
assert.ok(ev[28] && ev[28].some((s) => s.id === 'm2'), '31 号月付在 2 月落到 28 日');
assert.ok(!ev[6] || !ev[6].some((s) => s.id === 'm1'), '8 月才开始的月付A 在 2 月不应有事件（修复后）');

console.log('▶ 取消订阅：统计与提醒排除');
__setSubs([
  { id: 'a1', name: '正常A', period: 'monthly', amount: 15, start: '2026-08-06' },
  { id: 'a2', name: '取消B', period: 'monthly', amount: 50, start: '2026-08-06', active: false },
  { id: 'a3', name: '年付C', period: 'yearly', amount: 120, start: '2026-08-06' },
]);
let s2 = summarize([
  { id: 'x', name: '正常', period: 'yearly', amount: 100 },
  { id: 'y', name: '取消', period: 'yearly', amount: 999, active: false },
]);
approx(s2.total.yearly, 100); // 已取消的不计入统计
approx(s2.total.monthly, 100 / 12);
s2 = summarize([{ id: 'z', name: '老数据', period: 'yearly', amount: 100 }]);
approx(s2.total.yearly, 100); // 无 active 字段的老数据照常计入
ev = calEventsForMonth(2026, 7);
assert.ok(ev[6] && ev[6].length === 2, '已取消的订阅不产生日历事件/提醒');
const sorted = sortSubs([
  { id: 'n', name: '正常', period: 'yearly', amount: 1 },
  { id: 'c', name: '取消', period: 'yearly', amount: 999, active: false },
], 'daily');
assert.equal(sorted[0].id, 'n'); // 已取消的排最后
assert.equal(normalizeSub({ name: 'x', amount: 1 }).active, true);          // 默认未取消
assert.equal(normalizeSub({ name: 'x', amount: 1, active: false }).active, false);

console.log('▶ 日历回归：开始日期之前的月份不得出现续费事件');
__setSubs([
  { id: 'r1', name: '月付R', period: 'monthly', amount: 15, start: '2026-08-06' },
  { id: 'r2', name: '年付R', period: 'yearly', amount: 68, start: '2026-08-06' },
]);
ev = calEventsForMonth(2026, 1); // 2026 年 2 月（早于开始月 8 月）
assert.equal(Object.keys(ev).length, 0, '开始前的月份不应有任何续费事件');
ev = calEventsForMonth(2025, 7); // 2025 年 8 月（年付的开始月但是往年）
assert.equal(Object.keys(ev).length, 0, '年付在往年同月也不应出现事件');
ev = calEventsForMonth(2026, 7); // 开始月当月
assert.ok(ev[6] && ev[6].length === 2, '开始月当月应有事件（首次扣费）');
ev = calEventsForMonth(2027, 7); // 次年 8 月
assert.ok(ev[6] && ev[6].some((s) => s.id === 'r1'), '开始后月份月付继续续费');
assert.ok(ev[6] && ev[6].some((s) => s.id === 'r2'), '年付次年同月续费');

console.log('▶ 新周期折算：周/季/半年/每N月');
c = calcCosts({ period: 'weekly', amount: 10 });
approx(c.yearly, 10 * 365 / 7, 1e-9);
c = calcCosts({ period: 'quarterly', amount: 60 });
approx(c.yearly, 240); approx(c.monthly, 20);
c = calcCosts({ period: 'half_yearly', amount: 120 });
approx(c.yearly, 240);
c = calcCosts({ period: 'every_n', amount: 30, count: 2 });
approx(c.yearly, 180); // 每 2 个月付 30 → 每年 6 次
assert.equal(unitInfo({ period: 'every_n', count: 2 }).count, 2);
assert.equal(unitInfo({ period: 'one_time' }), null);

console.log('▶ 新周期续费日');
// 季付：1/31 开始 → 4/30、7/31、10/31（月末 clamp 后恢复锚定日）
assert.equal(fmtDate(kthRenewalDate({ period: 'quarterly', start: '2026-01-31' }, 1)), '4月30日');
assert.equal(fmtDate(kthRenewalDate({ period: 'quarterly', start: '2026-01-31' }, 2)), '7月31日');
// 周付：每 7 天
assert.equal(fmtDate(kthRenewalDate({ period: 'weekly', start: '2026-08-06' }, 1)), '8月13日');
// 每 2 个月：8/6 → 10/6
assert.equal(fmtDate(kthRenewalDate({ period: 'every_n', count: 2, start: '2026-08-06' }, 1)), '10月6日');
assert.equal(fmtDate(nextRenewalDate({ period: 'quarterly', start: '2026-01-31' }, '2026-08-06')), '10月31日');
assert.equal(fmtDate(nextRenewalDate({ period: 'weekly', start: '2026-08-06' }, '2026-08-10')), '8月13日');

console.log('▶ 币种：字段规范化与格式化');
assert.equal(normalizeSub({ name: 'x', currency: 'USD' }).currency, 'USD');
assert.equal(normalizeSub({ name: 'x', currency: 'hack' }).currency, 'CNY');
assert.equal(normalizeSub({ name: 'x' }).currency, 'CNY'); // 老数据默认人民币
assert.equal(fmtMoney(15, 'USD'), '$15.00');
assert.equal(fmtMoney(15, 'EUR'), '€15.00');
assert.equal(fmtMoney(15), '¥15.00');
assert.equal(fmtMoney(15, 'HKD'), 'HK$15.00');
assert.equal(periodText({ period: 'monthly', amount: 15, currency: 'USD' }), '$15.00/月');
assert.equal(periodText({ period: 'every_n', amount: 30, count: 2 }), '¥30.00 / 每2个月');
// 混币种汇总符号：取最多的币种
assert.equal(majorityCurrency([
  { currency: 'USD' }, { currency: 'USD' }, { currency: 'CNY' },
]), 'USD');

console.log('▶ 新周期日历事件分布');
__setSubs([
  { id: 'q1', name: '季付Q', period: 'quarterly', amount: 60, start: '2026-08-06' },
]);
ev = calEventsForMonth(2026, 10); // 2026 年 11 月：8/6 起每 3 月 → 11/6
assert.ok(ev[6] && ev[6].length === 1 && ev[6][0].id === 'q1', '季付在 11/6 有事件');
ev = calEventsForMonth(2026, 8); // 2026 年 9 月：无事件
assert.equal(Object.keys(ev).length, 0, '季付在 9 月无事件');

console.log('▶ 未来扣款清单（C1）');
const _now = new Date();
const _d10 = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate() + 10); // 10 天后
const _fmt = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
__setSubs([
  { id: 'u1', name: '月付U', period: 'monthly', amount: 15, start: '2026-01-06' },
  { id: 'u2', name: '年付U', period: 'yearly', amount: 68, start: _fmt(_d10) },
  { id: 'u3', name: '停用U', period: 'monthly', amount: 999, start: '2026-01-01', active: false },
  { id: 'u4', name: '买断U', period: 'one_time', amount: 698, years: 3, start: '2026-01-01' },
]);
// 注：upcomingCharges 用真实“今天”，只验证结构性质
const up = upcomingCharges(90);
assert.ok(Array.isArray(up));
assert.ok(up.every((e) => e.date && typeof e.date.getTime === 'function' && e.sub));
assert.ok(!up.some((e) => e.sub.id === 'u3'), '停用的订阅不进入扣款清单');
assert.ok(!up.some((e) => e.sub.id === 'u4'), '一次性/自定义不进入扣款清单');
for (let i = 1; i < up.length; i++) assert.ok(up[i].date >= up[i - 1].date, '按日期升序');
const upNames = new Set(up.map((e) => e.sub.id));
assert.ok(upNames.has('u1'), '月付在 90 天内有扣款');
assert.ok(upNames.has('u2'), '年付在 90 天内有扣款');

console.log('▶ 搜索过滤（C2）');
const fl = filterSubs([
  { name: 'Netflix 视频', category: '视频' },
  { name: '健身房', category: '生活' },
], 'net');
assert.equal(fl.length, 1);
assert.equal(fl[0].name, 'Netflix 视频');
assert.equal(filterSubs([
  { name: 'A', category: '学习' }, { name: 'B', category: '工具' },
], '工具').length, 1); // 按类别过滤
assert.equal(filterSubs([{ name: 'A' }], '').length, 1); // 空查询不过滤

console.log('▶ 生命周期字段（C4）');
const norm = normalizeSub({ name: 'x', trialEnd: '2026-09-01', cancelAt: '2026-10-01' });
assert.equal(norm.trialEnd, '2026-09-01');
assert.equal(norm.cancelAt, '2026-10-01');
assert.equal(normalizeSub({ name: 'x' }).trialEnd, ''); // 老数据无字段 → 空
__setSubs([
  { id: 't1', name: '试用T', period: 'monthly', amount: 15, start: '2026-08-01', trialEnd: '2026-09-01' },
  { id: 't2', name: '取消T', period: 'yearly', amount: 100, start: '2026-01-01', cancelAt: '2026-10-15', active: false },
]);
let ends = calEndEventsForMonth(2026, 8); // 9 月：试用结束
assert.ok(ends[1] && ends[1].length === 1 && ends[1][0].sub.id === 't1' && ends[1][0].label === '试用结束');
ends = calEndEventsForMonth(2026, 9); // 10 月：服务截止
assert.ok(ends[15] && ends[15][0].sub.id === 't2' && ends[15][0].label === '服务截止');
ends = calEndEventsForMonth(2026, 7); // 8 月：无
assert.equal(Object.keys(ends).length, 0);

console.log('▶ 多币种汇率折算与基准汇总');
approx(toBaseCurrency(10, 'USD', 'CNY'), 72.5); // 10 * 7.25 = 72.5
approx(toBaseCurrency(1000, 'JPY', 'CNY'), 48); // 1000 * 0.048 = 48
approx(toBaseCurrency(100, 'CNY', 'CNY'), 100);
const multiSubs = [
  { id: 'us1', name: 'Netflix US', period: 'monthly', amount: 10, currency: 'USD' }, // 10 * 12 * 7.25 = 870 CNY/year
  { id: 'cn1', name: 'iCloud CN', period: 'yearly', amount: 68, currency: 'CNY' },  // 68 CNY/year
];
const multiSum = summarize(multiSubs, 'CNY');
approx(multiSum.total.yearly, 870 + 68);
approx(multiSum.total.monthly, (870 + 68) / 12);
approx(multiSum.total.daily, (870 + 68) / 365);
assert.equal(hasForeignCurrencies(multiSubs), true);
assert.equal(hasForeignCurrencies([{ currency: 'CNY' }]), false);

console.log('▶ 改进1：汇率表更新日期与币种显示口径分离');
const ratesObj = getRates();
assert.ok(ratesObj.updatedAt, '汇率表必须包含更新日期字段 updatedAt');
assert.match(ratesObj.updatedAt, /^\d{4}-\d{2}-\d{2}$/, 'updatedAt 必须为 YYYY-MM-DD 格式');
assert.match(html, /id="rateUpdatedAt"/, '设置弹窗中必须可见更新日期');
assert.doesNotMatch(m[1], /convDailyStr/, '单项列表必须保持原币种，不得混入折算后金额标签');

console.log('▶ 超长历史订阅日历推算（消除 500 循环截断 Bug）');
__setSubs([
  // 2016 年开始的周付，距 2026 年超过 10 年（> 520 周，原算法 guard<500 会提前截断消失）
  { id: 'w-old', name: '老周付', period: 'weekly', amount: 10, start: '2016-01-01' },
]);
const evOld = calEventsForMonth(2026, 9); // 2026 年 10 月
assert.ok(Object.keys(evOld).length >= 4, '10 年前的周付在 2026 年 10 月依然应有 4~5 个续费日');
const nextOld = nextRenewalDate({ period: 'weekly', start: '2016-01-01' }, '2026-10-04');
assert.ok(nextOld && nextOld >= new Date('2026-10-04T00:00:00'));

console.log('▶ 用例①：14 个月前开始的日付订阅必须出现在当月日历（改进2）');
__setSubs([
  // 2025-08-01 开始的日付，距 2026 年 10 月逾 14 个月（>425 天，原 500 护栏即将耗尽/不支持日付）
  { id: 'd-14m', name: '老日付', period: 'daily', amount: 1, start: '2025-08-01' },
]);
const evDaily14m = calEventsForMonth(2026, 9); // 2026 年 10 月
assert.equal(Object.keys(evDaily14m).length, 31, '14 个月前开始的日付订阅必须出现在当月日历的所有 31 天');
for (let d = 1; d <= 31; d++) {
  assert.ok(evDaily14m[d] && evDaily14m[d].some((s) => s.id === 'd-14m'), `10月${d}日必须有老日付事件`);
}

console.log('▶ 用例②：cancelAt 之后的周期不得生成事件（覆盖日历、扣款清单、nextRenewalDate 三处）');
// ① 日历：月中截止的日付订阅，截止日之后不得生成事件
__setSubs([
  { id: 'd-mid-cancel', name: '月中截止日付', period: 'daily', amount: 2, start: '2026-10-01', cancelAt: '2026-10-10' },
]);
const evMidCancel = calEventsForMonth(2026, 9); // 2026 年 10 月
for (let d = 1; d <= 10; d++) {
  assert.ok(evMidCancel[d] && evMidCancel[d].some((s) => s.id === 'd-mid-cancel'), `10月${d}日（截止前）应有事件`);
}
for (let d = 11; d <= 31; d++) {
  assert.ok(!evMidCancel[d] || !evMidCancel[d].some((s) => s.id === 'd-mid-cancel'), `10月${d}日（cancelAt 之后）不得生成事件`);
}

// ② nextRenewalDate：下次周期若超出 cancelAt 则返回 null
const nextPastCancel = nextRenewalDate({ period: 'monthly', start: '2026-01-20', cancelAt: '2026-10-15' }, '2026-10-01');
assert.equal(nextPastCancel, null, '下次周期（10-20）晚于 cancelAt（10-15）时，nextRenewalDate 必须返回 null');

const nextDailyPast = nextRenewalDate({ period: 'daily', start: '2026-10-01', cancelAt: '2026-10-05' }, '2026-10-06');
assert.equal(nextDailyPast, null, '当前时间晚于 cancelAt 时，日付 nextRenewalDate 必须返回 null');

// ③ upcomingCharges：cancelAt 之后的扣款事件不得出现
const _dNow = new Date();
const _dPlus3 = new Date(_dNow.getTime() + 3 * 86400000);
const _dPlus10 = new Date(_dNow.getTime() + 10 * 86400000);
const _fmtD = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
__setSubs([
  { id: 'up-cancel-test', name: '即将截止扣款', period: 'daily', amount: 5, start: _fmtD(_dNow), cancelAt: _fmtD(_dPlus3) },
]);
const upCharges = upcomingCharges(30);
const upCancelEvents = upCharges.filter((e) => e.sub.id === 'up-cancel-test');
assert.ok(upCancelEvents.length > 0, 'cancelAt 前应有扣款事件');
for (const e of upCancelEvents) {
  assert.ok(e.date <= new Date(_fmtD(_dPlus3) + 'T23:59:59'), `扣款日期 ${e.date} 不得晚于 cancelAt`);
}

console.log('▶ 服务截止（cancelAt）边界拦截');
const nextCanceled = nextRenewalDate({ period: 'monthly', start: '2026-01-01', cancelAt: '2026-05-01' }, '2026-06-01');
assert.equal(nextCanceled, null, '当前时间晚于 cancelAt 时不应再有下次续费日');
__setSubs([
  { id: 'c-stop', name: '截止服务', period: 'monthly', amount: 30, start: '2026-01-15', cancelAt: '2026-05-15' },
]);
const evPastCancel = calEventsForMonth(2026, 6); // 2026 年 7 月（晚于截止日）
assert.equal(Object.keys(evPastCancel).length, 0, '超过 cancelAt 的月份不得出现续费扣费事件');

console.log('▶ 备份合并去重（mergeSubs 严格按 id 去重 + 字段清洗）');
const baseList = [
  { id: 's1', name: 'A', period: 'monthly', amount: 10, start: '2026-01-01' },
  { id: 's2', name: 'B', period: 'yearly', amount: 50, start: '2026-02-01' },
  { id: 's-dup1', name: '同名同期同日', period: 'monthly', amount: 10, start: '2026-03-01' },
];
const incomingList = [
  { id: 's2', name: 'B 更新', period: 'yearly', amount: 60, start: '2026-02-01' }, // 相同 id 更新
  { id: 's3', name: '  C 脏数据  ', period: 'monthly', amount: '25', start: ' 2026-03-01 ' }, // 全新 + 字段待清洗
  { id: 's-dup2', name: '同名同期同日', period: 'monthly', amount: 20, start: '2026-03-01' }, // 相同名/期/日但不同 id：严格按 id 区分，不误覆盖
];
const merged = mergeSubs(baseList, incomingList);
assert.equal(merged.added, 2);
assert.equal(merged.updated, 1);
assert.equal(merged.list.length, 5);
assert.equal(merged.list.find((s) => s.id === 's2').amount, 60);
const cClean = merged.list.find((s) => s.id === 's3');
assert.equal(cClean.name, 'C 脏数据');
assert.equal(cClean.amount, 25);
assert.equal(cClean.start, '2026-03-01');
// 验证同名同期同日不同 id 的项均被完整保留
assert.equal(merged.list.find((s) => s.id === 's-dup1').amount, 10);
assert.equal(merged.list.find((s) => s.id === 's-dup2').amount, 20);

console.log('▶ ICS 导出标准闹钟组件（VALARM）');
assert.match(m[1], /BEGIN:VALARM/);
assert.match(m[1], /TRIGGER:-P1D/);
assert.match(m[1], /ACTION:DISPLAY/);
assert.match(m[1], /明天「/);

console.log('▶ Phase 1: 快捷服务预设库（PRESET_SUBS）');
assert.ok(Array.isArray(PRESET_SUBS), 'PRESET_SUBS 应为数组');
assert.ok(PRESET_SUBS.length >= 24, '预设库至少包含 24 款主流服务，实际 ' + PRESET_SUBS.length);
for (const p of PRESET_SUBS) {
  assert.ok(p.name && typeof p.name === 'string', '预设项须有名称');
  assert.ok(typeof p.amount === 'number' && p.amount > 0, `预设项 ${p.name} 金额须为正数`);
  assert.ok(['daily', 'yearly', 'monthly', 'weekly', 'quarterly', 'half_yearly', 'every_n', 'one_time', 'custom'].includes(p.period), `预设项 ${p.name} 周期合法`);
  assert.ok(['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'HKD', 'KRW'].includes(p.currency), `预设项 ${p.name} 币种合法`);
  assert.ok(p.iconColor && p.iconColor.startsWith('#'), `预设项 ${p.name} 须有品牌色`);
}

console.log('▶ Phase 1: 支付渠道打标与清洗（payment）');
assert.ok(Array.isArray(COMMON_PAYMENTS) && COMMON_PAYMENTS.length >= 6, '包含常用支付渠道');
assert.ok(COMMON_PAYMENTS.includes('微信代扣') && COMMON_PAYMENTS.includes('支付宝免密'), '包含主流代扣免密渠道');
const subWithPay = normalizeSub({ name: 'ChatGPT', period: 'monthly', amount: 20, payment: '  招商信用卡  ' });
assert.equal(subWithPay.payment, '招商信用卡', '自动去除支付渠道首尾空格');
const subWithoutPay = normalizeSub({ name: 'Netflix', period: 'monthly', amount: 15 });
assert.equal(subWithoutPay.payment, '', '未指定支付渠道时默认为空字符串');
const subWithBadPay = normalizeSub({ name: 'App', period: 'yearly', amount: 10, payment: 12345 });
assert.equal(subWithBadPay.payment, '', '非字符串支付渠道容错清洗为空');

console.log('▶ Phase 1: 合并备份中支付渠道保留');
const payMerged = mergeSubs(
  [{ id: 'p1', name: 'A', period: 'monthly', amount: 10, payment: '微信代扣' }],
  [{ id: 'p2', name: 'B', period: 'yearly', amount: 50, payment: '支付宝免密' }]
);
assert.equal(payMerged.list.find((s) => s.id === 'p1').payment, '微信代扣');
assert.equal(payMerged.list.find((s) => s.id === 'p2').payment, '支付宝免密');

console.log('▶ Phase 1: CSV 导出包含扣款渠道');
assert.match(m[1], /'扣款渠道'/);
assert.match(m[1], /s\.payment \|\| ''/);

console.log('▶ Phase 1: 隐私隐匿模式（Privacy Mask）');
assert.match(html, /id="btnMask"/, '页面顶栏包含隐私切换按钮');
assert.match(html, /id="maskIcon"/, '隐私切换按钮包含图标');
assert.match(html, /\.privacy-mode/, '包含隐私打码样式类');
assert.match(html, /filter:\s*blur\(6px\)/, '隐私打码使用毛玻璃模糊');
assert.match(m[1], /PRIVACY_KEY/, 'JS 包含隐私模式持久化键');
assert.match(m[1], /togglePrivacyMode/, '包含隐私模式切换函数');

console.log('▶ Phase 2: 累计沉没成本与在订时长透视（calcSunkCost）');
// 1. 未来的订阅 -> 尚未开始，扣费次数为 0，金额为 0
const sunkFuture = calcSunkCost({ period: 'monthly', amount: 15, start: '2099-01-01' }, '2026-10-01');
assert.equal(sunkFuture.count, 0);
assert.equal(sunkFuture.totalAmount, 0);
assert.equal(sunkFuture.textDuration, '尚未开始');

// 2. 过去 6 个月的月付订阅（2026-04-01 至 2026-10-01：04-01, 05-01, 06-01, 07-01, 08-01, 09-01, 10-01 共 7 次扣款）
const sunkMonth = calcSunkCost({ period: 'monthly', amount: 15, start: '2026-04-01' }, '2026-10-01');
assert.equal(sunkMonth.count, 7);
assert.equal(sunkMonth.totalAmount, 105);
assert.ok(sunkMonth.days >= 180);
assert.match(sunkMonth.textDuration, /个月|天/);

// 3. 过去 2 年的年付订阅（2024-05-15 至 2026-10-01：2024-05-15, 2025-05-15, 2026-05-15 共 3 次扣款）
const sunkYear = calcSunkCost({ period: 'yearly', amount: 100, start: '2024-05-15' }, '2026-10-01');
assert.equal(sunkYear.count, 3);
assert.equal(sunkYear.totalAmount, 300);
assert.match(sunkYear.textDuration, /2 年/);

// 4. cancelAt 截断测试：提前取消的订阅，沉没成本停止在 cancelAt 前
const sunkCancel = calcSunkCost({ period: 'monthly', amount: 20, start: '2026-01-01', cancelAt: '2026-04-15' }, '2026-10-01');
assert.equal(sunkCancel.count, 4); // 01-01, 02-01, 03-01, 04-01 共 4 次
assert.equal(sunkCancel.totalAmount, 80);

// 5. 买断与自定义时间段
const sunkBuyout = calcSunkCost({ period: 'one_time', amount: 698, start: '2025-01-01' }, '2026-10-01');
assert.equal(sunkBuyout.count, 1);
assert.equal(sunkBuyout.totalAmount, 698);

// 6. 异常输入防御
assert.equal(calcSunkCost(null), null);
assert.equal(calcSunkCost({ start: '' }), null);
assert.equal(calcSunkCost({ start: 'not-a-date' }), null);

console.log('▶ Phase 2: 断舍离必要性评级（importance）');
assert.equal(normalizeSub({ name: 'A', importance: 'idle' }).importance, 'idle');
assert.equal(normalizeSub({ name: 'B', importance: 'optional' }).importance, 'optional');
assert.equal(normalizeSub({ name: 'C', importance: 'essential' }).importance, 'essential');
assert.equal(normalizeSub({ name: 'D' }).importance, 'essential', '默认评级为刚需日常 essential');
assert.equal(normalizeSub({ name: 'E', importance: 'unknown' }).importance, 'essential', '非法值回退 essential');

const impMerged = mergeSubs(
  [{ id: 'imp-1', name: 'A', importance: 'idle' }],
  [{ id: 'imp-2', name: 'B', importance: 'optional' }]
);
assert.equal(impMerged.list.find((s) => s.id === 'imp-1').importance, 'idle');
assert.equal(impMerged.list.find((s) => s.id === 'imp-2').importance, 'optional');

console.log('▶ Phase 2: CSV 导出包含必要性评估列');
assert.match(m[1], /'必要性'/);
assert.match(m[1], /impLabelMap/);
assert.match(m[1], /刚需日常/);
assert.match(m[1], /考虑降级/);
assert.match(m[1], /疑似闲置/);

console.log('▶ Phase 2: OLED 纯黑深色模式与主题持久化');
assert.match(html, /id="btnTheme"/, '顶栏包含主题切换按钮');
assert.match(html, /id="themeSeg"/, '设置抽屉包含主题分段切换器');
assert.match(html, /\[data-theme="dark"\]/, '包含 data-theme="dark" 样式');
assert.match(html, /--bg:\s*#000000;/, '暗黑模式背景为 OLED 极致纯黑');
assert.match(m[1], /THEME_KEY/, 'JS 包含主题持久化键名');
assert.match(m[1], /applyTheme/, 'JS 包含主题生效函数');
assert.match(m[1], /toggleTheme/, 'JS 包含主题循环切换函数');

console.log('▶ Phase 2: 断舍离闲置止血预警横幅与沉没成本 UI');
assert.match(html, /id="idleBanner"/, 'DOM 包含闲置止血预警横幅');
assert.match(html, /id="btnFilterIdle"/, 'DOM 包含查看闲置过滤按钮');
assert.match(html, /id="sunkCard"/, 'DOM 包含累计沉没成本卡片');
assert.match(html, /id="importanceSeg"/, 'DOM 包含必要性评级切换组件');
assert.match(html, /\.badge-idle/, '包含闲置高亮徽章样式');
assert.match(html, /\.idle-banner/, '包含预警横幅动画与布局样式');

console.log('▶ Phase 3: 云端同步配置与持久化（loadSyncSettings / saveSyncSettings）');
const initialSync = loadSyncSettings();
assert.equal(initialSync.provider, 'none');
assert.equal(initialSync.e2eeEnabled, false);
saveSyncSettings({ provider: 'webdav', davUrl: 'https://dav.example.com/', davUser: 'user1', davPass: 'p123', e2eeEnabled: true, e2eePassword: 'pass' });
const loadedSync = loadSyncSettings();
assert.equal(loadedSync.provider, 'webdav');
assert.equal(loadedSync.davUrl, 'https://dav.example.com/');
assert.equal(loadedSync.davUser, 'user1');
assert.equal(loadedSync.e2eeEnabled, true);

console.log('▶ Phase 3: Base64 与 ArrayBuffer 互转无损性');
const sampleBytes = new Uint8Array([0, 1, 255, 128, 64, 32, 16, 8, 4, 2, 1]);
const b64 = arrayBufferToBase64(sampleBytes.buffer);
const restoredBytes = new Uint8Array(base64ToArrayBuffer(b64));
assert.deepEqual(Array.from(sampleBytes), Array.from(restoredBytes));

console.log('▶ Phase 3: 端对端 AES-256 加密与解密（E2EE 零知识保障）');
const originalSecret = JSON.stringify({ note: '敏感财务数据', amount: 9999, currency: 'USD' });
const masterPass = 'SuperStrongMasterPassword!#123';
const encryptedPayload = await encryptData(originalSecret, masterPass);
const encryptedObj = JSON.parse(encryptedPayload);
assert.equal(encryptedObj._e2ee, true);
assert.ok(encryptedObj.salt && encryptedObj.iv && encryptedObj.ciphertext);
assert.ok(!encryptedPayload.includes('敏感财务数据'), '密文中绝不能泄露明文内容');

// 密码正确解密
const decryptedSecret = await decryptData(encryptedPayload, masterPass);
assert.equal(decryptedSecret, originalSecret, '正确主密码应无损解密出原始内容');

// 密码错误防御拦截
await assert.rejects(
  async () => {
    await decryptData(encryptedPayload, 'WrongPassword');
  },
  /端对端解密失败/
);

// 未加密的数据容错处理
const plainInput = JSON.stringify({ plain: true });
assert.equal(await decryptData(plainInput, ''), plainInput);

console.log('▶ Phase 3: WebDAV 客户端与地址规整（pushWebDAV / pullWebDAV）');
// 模拟 fetch 拦截
let davRequests = [];
ctx.fetch = async (url, opts) => {
  davRequests.push({ url, method: opts.method, headers: opts.headers, body: opts.body });
  if (opts.method === 'PUT') {
    return { ok: true, status: 200, statusText: 'OK' };
  }
  if (opts.method === 'GET') {
    return { ok: true, status: 200, statusText: 'OK', text: async () => '{"version":1,"subs":[]}' };
  }
  return { ok: true, status: 200 };
};

// 地址以 / 结尾时自动拼接 zhaxi-backup.json
await pushWebDAV({ davUrl: 'https://dav.jianguoyun.com/dav/myfolder/', davUser: 'me@example.com', davPass: 'app-pass' }, '{"test":1}');
assert.equal(davRequests[0].url, 'https://dav.jianguoyun.com/dav/myfolder/zhaxi-backup.json');
assert.equal(davRequests[0].method, 'PUT');
assert.ok(davRequests[0].headers.Authorization.startsWith('Basic '));

// 读取测试
const davGot = await pullWebDAV({ davUrl: 'https://dav.jianguoyun.com/dav/myfolder/', davUser: 'me@example.com', davPass: 'app-pass' });
assert.equal(davGot, '{"version":1,"subs":[]}');

console.log('▶ Phase 3: GitHub Gist 客户端（pushGist / pullGist）');
let gistRequests = [];
ctx.fetch = async (url, opts) => {
  gistRequests.push({ url, method: opts?.method || 'GET', headers: opts?.headers, body: opts?.body });
  if (url === 'https://api.github.com/gists' && opts.method === 'POST') {
    return { ok: true, status: 201, json: async () => ({ id: 'new-gist-id-888' }) };
  }
  if (url === 'https://api.github.com/gists/new-gist-id-888' && opts.method === 'PATCH') {
    return { ok: true, status: 200, json: async () => ({ id: 'new-gist-id-888' }) };
  }
  if (url === 'https://api.github.com/gists/new-gist-id-888' && (!opts || !opts.method || opts.method === 'GET')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        files: {
          'dawn_ledger_backup.json': { content: '{"version":1,"subs":[{"id":"g1","name":"GistSub"}]}' }
        }
      })
    };
  }
  if (url === 'https://api.github.com/user') {
    return { ok: true, status: 200, json: async () => ({ login: 'octocat' }) };
  }
  return { ok: false, status: 404 };
};

// 首次上传自动创建 Gist
const gistRes1 = await pushGist({ gistToken: 'ghp_testtoken', gistId: '' }, '{"version":1}');
assert.equal(gistRes1.gistId, 'new-gist-id-888');

// 读取 Gist
const gistGot = await pullGist({ gistToken: 'ghp_testtoken', gistId: 'new-gist-id-888' });
assert.match(gistGot, /GistSub/);

// 测试连接验证
const testConnRes = await testSyncConnection({ provider: 'gist', gistToken: 'ghp_testtoken' });
assert.ok(testConnRes.ok);
assert.match(testConnRes.msg, /@octocat/);

console.log('▶ Phase 3: 多端云同步 DOM 与更多菜单联动');
assert.match(html, /id="syncDialog"/, '页面包含云端同步弹窗');
assert.match(html, /id="syncStatusCard"/, '弹窗包含同步状态指示卡片');
assert.match(html, /id="syncProviderSeg"/, '弹窗包含 WebDAV / Gist 服务切换器');
assert.match(html, /id="syncDavSec"/, '包含 WebDAV 地址与授权配置区');
assert.match(html, /id="syncGistSec"/, '包含 GitHub Token 与 Gist ID 配置区');
assert.match(html, /id="syncE2eeSec"/, '包含端对端 AES-256 主密码加密选项');
assert.match(html, /data-menu="sync-settings"/, '更多菜单包含云端同步入口');

console.log('✅ 全部断言通过（' + DEFAULT_DATA.length + ' 条示例数据）');
