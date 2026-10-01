/*
 * 「我的行程」首页:欢迎区、统计卡片、列表 / 周视图、月历、接下来。
 * 数据用 app.js 里的 EVENTS / GROUPS,操作也调用 app.js 的函数;这里只负责展示和筛选。
 * 注意:onclick 里只传数字 ID,姓名、标题等用户输入的内容不放进 JS 字符串。
 */
const HOME = {
  view: localStorage.getItem('home.view') === 'week' ? 'week' : 'list',
  chip: 'all',
  q: '',
  showPast: false,
  day: null,                         // 月历上选中的日期 'YYYY-MM-DD',null 为不限
  weekStart: startOfWeek(new Date()),
  month: firstOfMonth(new Date()),
};
const HOUR_PX = 44;                  // 周视图每小时的高度

/* ---------- 日期工具 ---------- */
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d) { const x = startOfDay(d); return addDays(x, -((x.getDay() + 6) % 7)); } // 周一为一周开始
function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const keyDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const byStart = (a, b) => toDate(a.startTime) - toDate(b.startTime);
const minutesOf = (e) => Math.round((toDate(e.endTime) - toDate(e.startTime)) / 60000);
function overlaps(e, from, to) { return toDate(e.startTime) < to && toDate(e.endTime) > from; }
function overlapsDay(e, key) { const s = keyDate(key); return overlaps(e, s, addDays(s, 1)); }

/* ---------- 行程分类(决定颜色) ---------- */
/* 我会参加的:我发起的(管理员发起的也算),或我已同意的 */
const iAttend = (e) => e.status === 'ACTIVE' && (isOwner(e) || e.myStatus === 'ACCEPTED');
const isLive = (e) => isOpen(e) && toDate(e.startTime) <= now();
function kindOf(e) {
  if (e.status === 'CANCELLED' || e.myStatus === 'DECLINED' || ended(e)) return 'past';
  if (!isOwner(e) && e.myStatus === 'PENDING') return 'pending';
  if (e.groupId) return 'group';
  return isOwner(e) ? 'mine' : 'joined';
}
const KINDS = {
  mine: '我发起的',
  joined: '我参加的',
  group: '组内邀约',
  pending: '待我确认',
  past: '已结束 / 已取消',
};

const CHIPS = [
  ['all', '全部', () => true],
  ['mine', '我发起的', (e) => isOwner(e)],
  ['joined', '我参加的', (e) => !isOwner(e) && e.myStatus === 'ACCEPTED'],
  ['pending', '待我确认', (e) => !isOwner(e) && e.myStatus === 'PENDING'],
  ['group', '组内邀约', (e) => !!e.groupId],
  ['conflict', '有冲突', (e) => isOpen(e) && myConflicts(e).length > 0],
];

/* 基础范围:默认只看未结束、未取消、未拒绝的;周视图里本周已结束的也显示(灰色) */
function inScope(e, week) {
  if (HOME.showPast) return true;
  return e.status === 'ACTIVE' && e.myStatus !== 'DECLINED' && (week || !ended(e));
}
function matchesSearch(e) {
  const q = HOME.q.trim().toLowerCase();
  return !q || [e.title, e.location, e.ownerName, e.groupName, e.description]
    .some((v) => v && v.toLowerCase().includes(q));
}
function filtered({ week = false } = {}) {
  const chip = (CHIPS.find((c) => c[0] === HOME.chip) || CHIPS[0])[2];
  return EVENTS.filter((e) => inScope(e, week) && chip(e) && matchesSearch(e)
    && (week || !HOME.day || overlapsDay(e, HOME.day)));
}

/* ---------- 绑定(启动时调用一次) ---------- */
function initHome() {
  $$('#viewSwitch button').forEach((b) => {
    b.onclick = () => { HOME.view = b.dataset.view; localStorage.setItem('home.view', HOME.view); renderHome(); };
  });
  $('#eventSearch').oninput = debounce((ev) => { HOME.q = ev.target.value; renderHome(); }, 200);
  $('#showPast').onchange = (ev) => { HOME.showPast = ev.target.checked; renderHome(); };
  $('#eventChips').onclick = (ev) => {
    const b = ev.target.closest('[data-chip]');
    if (b) { HOME.chip = b.dataset.chip; renderHome(); }
  };
  $('#stats').onclick = (ev) => {
    const c = ev.target.closest('[data-stat]');
    if (!c) return;
    const s = c.dataset.stat;
    if (s === 'inbox') return showTab('inbox');
    if (s === 'groups') return showTab('groups');
    if (s === 'today') { HOME.day = dayKey(new Date()); HOME.view = 'list'; HOME.chip = 'all'; }
    if (s === 'week') { HOME.weekStart = startOfWeek(new Date()); HOME.view = 'week'; HOME.day = null; }
    if (s === 'conflict') { HOME.chip = 'conflict'; HOME.view = 'list'; HOME.day = null; }
    if (s === 'pendingMembers') { HOME.chip = 'all'; HOME.view = 'list'; HOME.day = null; }
    renderHome();
  };
  $('#miniCal').onclick = (ev) => {
    const nav = ev.target.closest('[data-month]');
    if (nav) {
      const m = HOME.month;
      HOME.month = nav.dataset.month === 'today' ? firstOfMonth(new Date())
        : new Date(m.getFullYear(), m.getMonth() + Number(nav.dataset.month), 1);
      return renderMiniCal();
    }
    const cell = ev.target.closest('[data-day]');
    if (!cell) return;
    const k = cell.dataset.day;
    HOME.day = HOME.day === k ? null : k;
    if (HOME.day) HOME.weekStart = startOfWeek(keyDate(k));
    renderHome();
  };
  $('#eventList').onclick = (ev) => {
    if (ev.target.closest('[data-clear-filters]')) {
      HOME.chip = 'all'; HOME.q = ''; HOME.day = null; $('#eventSearch').value = '';
      renderHome();
    }
  };
  $('#dayFilter').onclick = (ev) => {
    if (ev.target.closest('[data-clear-day]')) { HOME.day = null; renderHome(); }
  };
  $('#weekView').onclick = onWeekClick;
  // 每分钟刷新一次倒计时和"进行中";有对话框打开时不刷新,避免打断操作
  setInterval(() => {
    if (!$('#tab-events').hidden && !document.querySelector('dialog[open]')) renderHome();
  }, 60000);
}

/* ---------- 总渲染 ---------- */
function renderHome() {
  renderHero();
  renderStats();
  renderChips();
  renderMiniCal();
  renderUpNext();
  $$('#viewSwitch button').forEach((b) => b.classList.toggle('active', b.dataset.view === HOME.view));
  $('#eventList').hidden = HOME.view !== 'list';
  $('#weekView').hidden = HOME.view !== 'week';
  $('#dayFilter').hidden = !(HOME.day && HOME.view === 'list');
  if (HOME.day) {
    $('#dayFilter').innerHTML = `只看 <strong>${esc(fmtDay(toLocalInput(keyDate(HOME.day))))}</strong>
      <button type="button" class="link" data-clear-day>显示全部日期 ×</button>`;
  }
  if (HOME.view === 'list') renderList(); else renderWeek();
}

/* ---------- 欢迎区 ---------- */
function renderHero() {
  const h = new Date().getHours();
  const hi = h < 5 ? '夜深了' : h < 11 ? '早上好' : h < 13 ? '中午好' : h < 18 ? '下午好' : '晚上好';
  const attend = EVENTS.filter((e) => iAttend(e) && !ended(e)).sort(byStart);
  const live = attend.find((e) => toDate(e.startTime) <= now());
  const next = attend.find((e) => toDate(e.startTime) > now());
  let line;
  if (live) {
    line = `正在进行 <strong>「${esc(live.title)}」</strong>,${esc(fmtTime(live.endTime))} 结束`
      + (next ? `;接下来是「${esc(next.title)}」<span class="pill">${esc(fromNow(next.startTime))}</span>` : '');
  } else if (next) {
    line = `下一个行程 <strong>「${esc(next.title)}」</strong>${esc(fmtDay(next.startTime))} ${esc(fmtTime(next.startTime))} 开始
      <span class="pill">${esc(fromNow(next.startTime))}</span>`;
  } else {
    line = isAdmin() ? '目前没有进行中的组内邀约,给组员发起一个吧。' : '近期还没有安排,预约一个行程,或者邀请朋友一起吧。';
  }
  const n = inboxCounts();
  const d = new Date();
  $('#hero').innerHTML = `
    <div class="hero-text">
      <div class="hero-date">${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}</div>
      <h2>${hi},${esc(ME.displayName)}</h2>
      <p>${line}</p>
      <div class="hero-actions">
        <button type="button" class="hero-btn" onclick="openEventForm()">+ ${isAdmin() ? '发起组内邀约' : '预约行程'}</button>
        ${n.total ? `<button type="button" class="hero-btn ghost" onclick="showTab('inbox')">${n.total} 条邀请待回复</button>` : ''}
      </div>
    </div>
    <svg class="hero-art" viewBox="0 0 160 130" aria-hidden="true">
      <rect x="18" y="22" width="112" height="96" rx="12" fill="rgba(255,255,255,.18)"/>
      <rect x="18" y="22" width="112" height="26" rx="12" fill="rgba(255,255,255,.35)"/>
      <rect x="40" y="12" width="8" height="22" rx="4" fill="#fff"/><rect x="100" y="12" width="8" height="22" rx="4" fill="#fff"/>
      ${[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => `<rect x="${32 + c * 22}" y="${58 + r * 18}" width="14" height="10" rx="3"
        fill="rgba(255,255,255,${(r * 4 + c) % 5 === 1 ? '.95' : '.4'})"/>`).join('')).join('')}
      <circle cx="128" cy="104" r="20" fill="#fff"/>
      <path d="M118 104l7 7 13-14" stroke="#4f46e5" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

/* 待我回复的数量(行程邀请 + 入组邀请),和「待我回复」标签页一致 */
function inboxCounts() {
  const events = EVENTS.filter((e) => !isOwner(e) && e.myStatus === 'PENDING' && isOpen(e)).length;
  const groups = GROUPS.filter((g) => !isOwner(g) && g.myStatus === 'PENDING').length;
  return { events, groups, total: events + groups };
}

/* ---------- 统计卡片 ---------- */
function renderStats() {
  const todayKey = dayKey(new Date());
  const ws = startOfWeek(new Date()), we = addDays(ws, 7);
  const stat = (key, icon, color, label, value, sub) => `
    <button type="button" class="stat ${color}" data-stat="${key}">
      <span class="stat-icon">${icon}</span>
      <span class="stat-label">${esc(label)}</span>
      <span class="stat-value">${value}</span>
      <span class="stat-sub">${sub}</span>
    </button>`;
  let html;
  if (isAdmin()) {
    const open = EVENTS.filter((e) => isOwner(e) && isOpen(e));
    const pending = open.reduce((s, e) => s + e.pendingCount, 0);
    const accepted = open.reduce((s, e) => s + e.acceptedCount, 0);
    const groups = ownGroups();
    html = stat('week', '📅', 'blue', '进行中的邀约', open.length, '查看周视图')
      + stat('pendingMembers', '⏳', 'amber', '待成员确认', pending, pending ? '人次还没回复' : '都已回复')
      + stat('pendingMembers', '✅', 'green', '已确认', accepted, '人次同意参加')
      + stat('groups', '👥', 'purple', '我的组', groups.length,
        `共 ${groups.reduce((s, g) => s + g.acceptedCount, 0)} 名成员`);
  } else {
    const attend = EVENTS.filter(iAttend);
    const today = attend.filter((e) => overlapsDay(e, todayKey));
    const left = today.filter((e) => !ended(e)).length;
    const week = attend.filter((e) => overlaps(e, ws, we));
    const weekMin = week.reduce((s, e) => s + minutesOf(e), 0);
    const n = inboxCounts();
    const conflicts = EVENTS.filter((e) => isOpen(e) && myConflicts(e).length).length;
    html = stat('today', '☀️', 'blue', '今日行程', today.length,
      today.length ? (left ? `还有 ${left} 个未结束` : '今天的都结束了') : '今天很轻松')
      + stat('week', '📅', 'green', '本周行程', week.length, week.length ? `共 ${esc(fmtDur(weekMin))}` : '本周还没有安排')
      + stat('inbox', '✉️', 'amber', '待我回复', n.total,
        n.total ? `行程 ${n.events} · 入组 ${n.groups}` : '没有新邀请')
      + stat('conflict', conflicts ? '⚠️' : '👌', conflicts ? 'red' : 'purple', '时间冲突', conflicts,
        conflicts ? '点击查看冲突的行程' : '安排得很合理');
  }
  $('#stats').innerHTML = html;
}

/* ---------- 筛选标签 ---------- */
function renderChips() {
  const base = EVENTS.filter((e) => inScope(e, HOME.view === 'week') && matchesSearch(e));
  $('#eventChips').innerHTML = CHIPS.map(([key, label, fn]) => {
    const n = base.filter(fn).length;
    if (key !== 'all' && !n && HOME.chip !== key) return ''; // 没有内容的标签不显示
    return `<button type="button" class="chip ${HOME.chip === key ? 'active' : ''} ${key === 'conflict' ? 'chip-bad' : ''}"
      data-chip="${key}">${esc(label)}<span class="chip-n">${n}</span></button>`;
  }).join('');
}

/* ---------- 列表视图 ---------- */
function renderList() {
  const list = filtered().sort(byStart);
  const box = $('#eventList');
  if (!list.length) {
    const narrowed = HOME.chip !== 'all' || HOME.q.trim() || HOME.day;
    box.innerHTML = `<div class="empty rich">
      <svg viewBox="0 0 120 90" width="120" aria-hidden="true">
        <rect x="14" y="14" width="92" height="66" rx="10" fill="#eef2ff"/>
        <rect x="14" y="14" width="92" height="18" rx="9" fill="#c7d2fe"/>
        <circle cx="60" cy="56" r="13" fill="none" stroke="#a5b4fc" stroke-width="4"/>
        <path d="M60 49v8l5 4" stroke="#a5b4fc" stroke-width="4" fill="none" stroke-linecap="round"/>
      </svg>
      <p>${narrowed ? '没有符合条件的行程' : isAdmin() ? '还没有发起过组内邀约' : '还没有行程,开始安排你的第一个吧'}</p>
      ${narrowed ? '<button type="button" data-clear-filters>清除筛选</button>'
        : `<button type="button" class="primary" onclick="openEventForm()">${isAdmin() ? '发起组内邀约' : '预约行程'}</button>`}
    </div>`;
    return;
  }
  // 按开始日期分组
  const days = new Map();
  for (const e of list) {
    const k = dayKey(toDate(e.startTime));
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(e);
  }
  const todayKey = dayKey(new Date());
  box.innerHTML = [...days.entries()].map(([k, evs]) => {
    const d = keyDate(k);
    const rel = fmtDay(toLocalInput(d)).split(' · ')[1];
    return `<div class="day-group ${k === todayKey ? 'is-today' : ''} ${d < startOfDay(new Date()) ? 'is-past' : ''}">
      <div class="day-head">
        <span class="day-num">${d.getDate()}</span>
        <span class="day-label"><strong>${d.getMonth() + 1}月 ${WEEK[d.getDay()]}</strong>${rel ? `<span class="day-rel">${esc(rel)}</span>` : ''}</span>
        <span class="day-count">${evs.length} 个行程</span>
      </div>
      ${evs.map((e) => eventCard(e)).join('')}
    </div>`;
  }).join('');
}

/* ---------- 周视图 ---------- */
function renderWeek() {
  const ws = HOME.weekStart, we = addDays(ws, 7);
  const days = [...Array(7)].map((_, i) => addDays(ws, i));
  const evs = filtered({ week: true }).filter((e) => overlaps(e, ws, we));

  // 每个行程按天切成片段(跨天的行程每天一段)
  const segs = days.map(() => []);
  let h0 = 8, h1 = 20;
  for (const e of evs) {
    days.forEach((d, i) => {
      const ds = d.getTime(), de = addDays(d, 1).getTime();
      const s = Math.max(toDate(e.startTime).getTime(), ds), t = Math.min(toDate(e.endTime).getTime(), de);
      if (s >= t) return;
      const g = { e, s: (s - ds) / 60000, t: (t - ds) / 60000 };
      segs[i].push(g);
      h0 = Math.min(h0, Math.floor(g.s / 60));
      h1 = Math.max(h1, Math.ceil(g.t / 60));
    });
  }
  segs.forEach(layoutDay);
  const height = (h1 - h0) * HOUR_PX;
  const top = (min) => (min - h0 * 60) / 60 * HOUR_PX;
  const todayKey = dayKey(new Date());
  const nowMin = (Date.now() - startOfDay(new Date()).getTime()) / 60000;
  const last = addDays(we, -1);
  const range = `${ws.getFullYear()}年${ws.getMonth() + 1}月${ws.getDate()}日 - ${
    last.getFullYear() !== ws.getFullYear() ? last.getFullYear() + '年' : ''}${last.getMonth() + 1}月${last.getDate()}日`;
  const isThisWeek = ws.getTime() === startOfWeek(new Date()).getTime();

  $('#weekView').innerHTML = `
    <div class="wk-bar">
      <button type="button" class="small" data-week="-1" aria-label="上一周">‹</button>
      <button type="button" class="small" data-week="0" ${isThisWeek ? 'disabled' : ''}>本周</button>
      <button type="button" class="small" data-week="1" aria-label="下一周">›</button>
      <strong class="wk-range">${range}</strong>
      <span class="spacer"></span>
      <span class="muted wk-tip">${isAdmin() ? '' : '点击空白时段可快速预约'}</span>
    </div>
    <div class="wk-scroll"><div class="wk">
      <div class="wk-head">
        <div class="wk-corner"></div>
        ${days.map((d) => `<div class="wk-day ${dayKey(d) === todayKey ? 'today' : ''} ${HOME.day === dayKey(d) ? 'selected' : ''}">
          <span>${WEEK[d.getDay()]}</span><strong>${d.getDate()}</strong></div>`).join('')}
      </div>
      <div class="wk-body" data-h0="${h0}" style="height:${height}px">
        <div class="wk-gutter">${[...Array(h1 - h0)].map((_, i) =>
          `<span style="top:${i * HOUR_PX}px">${pad(h0 + i)}:00</span>`).join('')}</div>
        ${days.map((d, i) => `<div class="wk-col ${dayKey(d) === todayKey ? 'today' : ''}" data-col="${dayKey(d)}"
            style="background-size:100% ${HOUR_PX}px">
          ${segs[i].map((g) => {
            const e = g.e, hgt = Math.max(top(g.t) - top(g.s), 20);
            const w = 100 / g.cols;
            return `<div class="wk-ev k-${kindOf(e)} ${isOpen(e) && myConflicts(e).length ? 'conflict' : ''}"
                data-ev="${e.eventId}" title="${esc(e.title)}"
                style="top:${top(g.s)}px;height:${hgt - 2}px;left:calc(${g.col * w}% + 2px);width:calc(${w}% - 4px)">
              <strong>${esc(e.title)}</strong>
              ${hgt >= 36 ? `<span>${esc(fmtTime(e.startTime))}-${esc(fmtTime(e.endTime))}${e.location ? ' · ' + esc(e.location) : ''}</span>` : ''}
            </div>`;
          }).join('')}
          ${dayKey(d) === todayKey && nowMin >= h0 * 60 && nowMin <= h1 * 60
            ? `<div class="wk-now" style="top:${top(nowMin)}px"></div>` : ''}
        </div>`).join('')}
      </div>
    </div></div>
    ${evs.length ? '' : '<p class="muted wk-empty">这一周没有符合条件的行程</p>'}`;
}

/* 同一天重叠的行程并排显示:贪心分列,同一簇里列数相同 */
function layoutDay(segs) {
  segs.sort((a, b) => a.s - b.s || b.t - a.t);
  let cluster = [], clusterEnd = -1;
  const flush = () => {
    const n = Math.max(...cluster.map((x) => x.col)) + 1;
    cluster.forEach((x) => { x.cols = n; });
    cluster = [];
  };
  for (const g of segs) {
    if (cluster.length && g.s >= clusterEnd) { flush(); clusterEnd = -1; }
    const used = new Set(cluster.filter((x) => x.t > g.s).map((x) => x.col));
    let c = 0;
    while (used.has(c)) c++;
    g.col = c;
    cluster.push(g);
    clusterEnd = Math.max(clusterEnd, g.t);
  }
  if (cluster.length) flush();
}

function onWeekClick(ev) {
  const nav = ev.target.closest('[data-week]');
  if (nav) {
    const n = Number(nav.dataset.week);
    HOME.weekStart = n === 0 ? startOfWeek(new Date()) : addDays(HOME.weekStart, n * 7);
    HOME.month = firstOfMonth(HOME.weekStart);
    return renderHome();
  }
  const block = ev.target.closest('[data-ev]');
  if (block) return openEventDetail(Number(block.dataset.ev));
  const col = ev.target.closest('[data-col]');
  if (!col || isAdmin()) return;
  // 点击空白时段:按半小时取整,作为开始时间预约
  const body = col.closest('.wk-body');
  const firstHour = Number(body.dataset.h0);
  const y = ev.clientY - col.getBoundingClientRect().top;
  const start = keyDate(col.dataset.col);
  start.setMinutes(firstHour * 60 + Math.floor(y / HOUR_PX * 2) * 30);
  if (start < now()) return toast('不能预约已经过去的时间');
  openEventForm(undefined, start);
}

/* ---------- 侧栏:月历 ---------- */
function renderMiniCal() {
  const m = HOME.month;
  const first = startOfWeek(m);
  // 每天有几个"我会参加 / 待确认"的行程
  const counts = new Map();
  for (const e of EVENTS) {
    if (e.status !== 'ACTIVE' || e.myStatus === 'DECLINED') continue;
    let d = startOfDay(toDate(e.startTime));
    for (let i = 0; i < 62 && d < toDate(e.endTime); i++, d = addDays(d, 1)) {
      const k = dayKey(d);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  const todayKey = dayKey(new Date());
  const cells = [...Array(42)].map((_, i) => {
    const d = addDays(first, i), k = dayKey(d), n = counts.get(k) || 0;
    const cls = [d.getMonth() !== m.getMonth() ? 'other' : '', k === todayKey ? 'today' : '',
      k === HOME.day ? 'selected' : '', n ? 'has' : ''].join(' ');
    return `<button type="button" class="mc-day ${cls}" data-day="${k}" title="${n ? n + ' 个行程' : ''}">
      ${d.getDate()}<span class="mc-dots">${'<i></i>'.repeat(Math.min(n, 3))}</span></button>`;
  }).join('');
  $('#miniCal').innerHTML = `
    <div class="mc-head">
      <button type="button" class="small" data-month="-1" aria-label="上个月">‹</button>
      <strong>${m.getFullYear()}年${m.getMonth() + 1}月</strong>
      <button type="button" class="small" data-month="1" aria-label="下个月">›</button>
    </div>
    <div class="mc-week">${['一', '二', '三', '四', '五', '六', '日'].map((w) => `<span>${w}</span>`).join('')}</div>
    <div class="mc-grid">${cells}</div>
    <div class="mc-foot"><button type="button" class="link" data-month="today">回到本月</button>
      <span class="muted">点日期只看当天</span></div>`;
}

/* ---------- 侧栏:接下来 + 图例 ---------- */
function renderUpNext() {
  const next = EVENTS.filter((e) => isOpen(e) && e.myStatus !== 'DECLINED').sort(byStart).slice(0, 5);
  $('#upNext').innerHTML = `<h3 class="panel-title">接下来</h3>
    ${next.length ? `<ul class="up">${next.map((e) => `<li class="k-${kindOf(e)}" onclick="openEventDetail(${e.eventId})">
        <i class="dot"></i>
        <span class="up-main"><strong>${esc(e.title)}</strong>
          <span class="muted">${esc(fmtDay(e.startTime).split(' · ')[1] || fmtDay(e.startTime).split(' ')[0])} ${esc(fmtTime(e.startTime))}</span></span>
        <span class="up-when ${isLive(e) ? 'live' : ''}">${isLive(e) ? '进行中' : esc(fromNow(e.startTime))}</span>
      </li>`).join('')}</ul>` : '<p class="muted">暂时没有即将开始的行程</p>'}
    <h3 class="panel-title">颜色说明</h3>
    <ul class="legend">${Object.entries(KINDS).map(([k, label]) => `<li class="k-${k}"><i class="dot"></i>${esc(label)}</li>`).join('')}</ul>`;
}
