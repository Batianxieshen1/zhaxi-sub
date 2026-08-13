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
  crypto: { randomUUID: () => 'uuid-test' },
  alert() {},
  Blob: class {},
  URL: { createObjectURL: () => '', revokeObjectURL() {} },
  FileReader: class { readAsText() {} },
};
vm.createContext(ctx);
// 追加一行导出：const 声明的词法绑定不会自动挂到 context 上，需在沙箱内显式导出
vm.runInContext(
  m[1] + '\n;globalThis.__exports = { calcCosts, summarize, fmtMoney, sortSubs, periodText, renewalText, dateDays, nextRenewalDate, kthRenewalDate, unitInfo, dailyAnalogy, normalizeSub, calEventsForMonth, calEndEventsForMonth, upcomingCharges, filterSubs, majorityCurrency, __setSubs: (l) => { subs = l; }, DEFAULT_DATA };',
  ctx
);
const { calcCosts, summarize, fmtMoney, sortSubs, periodText, renewalText, dateDays, nextRenewalDate, kthRenewalDate, unitInfo, dailyAnalogy, normalizeSub, calEventsForMonth, calEndEventsForMonth, upcomingCharges, filterSubs, majorityCurrency, __setSubs, DEFAULT_DATA } = ctx.__exports;

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

console.log('✅ 全部断言通过（' + DEFAULT_DATA.length + ' 条示例数据）');
