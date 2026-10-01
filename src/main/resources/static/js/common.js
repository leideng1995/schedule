/* 登录页和主页面共用的工具。页面与接口同源,登录状态靠服务端会话 Cookie。 */
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');

/* ---------- 时间 ---------- */
/* 接口返回 "2026-10-06T09:00:00"(本地时间,无时区),按本地时间解析 */
const toDate = (v) => (v ? new Date(String(v).replace(' ', 'T')) : null);
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const fmtTime = (v) => { const d = toDate(v); return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : ''; };
const fmtDay = (v) => {
  const d = toDate(v);
  if (!d) return '—';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - today) / 86400000);
  const rel = { 0: '今天', 1: '明天', 2: '后天', '-1': '昨天' }[diff];
  const ymd = d.getFullYear() === today.getFullYear() ? `${d.getMonth() + 1}月${d.getDate()}日` : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  return `${ymd} ${WEEK[d.getDay()]}${rel ? ' · ' + rel : ''}`;
};
/* "10月6日 周一 09:00-10:30";跨天时结束也带日期 */
const fmtSpan = (start, end) => {
  const s = toDate(start), e = toDate(end);
  const sameDay = s.toDateString() === e.toDateString();
  const day = (d) => `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}`;
  return `${day(s)} ${fmtTime(start)} - ${sameDay ? '' : day(e) + ' '}${fmtTime(end)}`;
};
/* Date → datetime-local 输入框的值 "2026-10-06T09:00" */
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
/* 时长:90 → "1.5 小时" */
const fmtDur = (min) => {
  if (min < 60) return `${min} 分钟`;
  if (min >= 1440 && min % 1440 === 0) return `${min / 1440} 天`;
  const h = min / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} 小时`;
};
/* 距现在多久:"35 分钟后" / "2 小时 10 分后" / "3 天后" */
const fromNow = (v) => {
  const ms = toDate(v) - new Date();
  if (ms <= 0) return '已开始';
  const m = Math.ceil(ms / 60000); // 还差几秒时显示"1 分钟后",不要提前显示"已开始"
  if (m < 60) return `${m} 分钟后`;
  if (m < 1440) return `${Math.floor(m / 60)} 小时${m % 60 ? ` ${m % 60} 分` : ''}后`;
  return `${Math.floor(m / 1440)} 天后`;
};

/* 头像:取姓名首字,颜色按姓名固定 */
const avatar = (name, cls = '') => {
  const s = String(name || '?');
  let h = 0;
  for (const c of s) h = (h * 31 + c.codePointAt(0)) % 360;
  const ch = [...s][0].toUpperCase();
  return `<span class="avatar ${cls}" style="background:hsl(${h},55%,52%)" title="${esc(s)}">${esc(ch)}</span>`;
};

/* ---------- 接口 ---------- */
/*
 * 统一的接口调用:失败时抛出带中文说明的 Error。
 * 时间冲突(409 且带 conflicts)时 Error 上带 conflicts 数组,由 withConflictCheck 处理。
 */
async function api(method, path, body) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error('无法连接到服务器,请确认后端已启动');
  }
  if (!res.ok) {
    let data = {};
    try { data = await res.json(); } catch (e) { /* 没有 JSON 内容 */ }
    // 会话过期:回登录页,登录后再回来(登录接口自己的 401 是"密码错误",不跳转)
    if (res.status === 401 && path !== '/auth/login') {
      goLogin();
    }
    const err = new Error(data.message || ({ 400: '提交的内容不正确', 403: '没有权限执行此操作', 404: '数据不存在,可能已被删除' })[res.status]
      || `请求失败(${res.status})`);
    err.status = res.status;
    if (res.status === 409 && Array.isArray(data.conflicts)) err.conflicts = data.conflicts;
    throw err;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function goLogin() {
  const next = location.pathname + location.search;
  location.replace('/login.html' + (next && next !== '/' && next !== '/index.html' ? '?next=' + encodeURIComponent(next) : ''));
}

/*
 * 带冲突提示的提交:先正常提交;后端返回时间冲突时,列出冲突明细让用户确认,
 * 确认后带 force=true 再提交一次。用户放弃时返回 null。
 * send(force) 负责实际调用接口。
 */
async function withConflictCheck(send, actionText) {
  try {
    return await send(false);
  } catch (e) {
    if (!e.conflicts) throw e;
    const go = await confirmConflicts(e.message, e.conflicts, actionText);
    return go ? send(true) : null;
  }
}

function confirmConflicts(message, conflicts, actionText = '仍然继续') {
  // 按人分组:张三 → [行程1, 行程2]
  const byUser = new Map();
  for (const c of conflicts) {
    if (!byUser.has(c.userId)) byUser.set(c.userId, { name: c.displayName, items: [] });
    byUser.get(c.userId).items.push(c);
  }
  const me = window.ME;
  const list = [...byUser.entries()].map(([uid, u]) => `<li>
      <strong>${me && uid === me.userId ? '你自己' : esc(u.name)}</strong> 已有:
      ${u.items.map((c) => `<div>「${esc(c.title)}」 ${esc(fmtSpan(c.startTime, c.endTime))}</div>`).join('')}
    </li>`).join('');
  return new Promise((resolve) => {
    openDialog({
      title: '行程时间冲突',
      body: `<p class="note">${esc(message || '以下用户在该时间段已有行程')}:</p><ul class="conflicts">${list}</ul>
        <p class="note">可以返回修改时间,也可以忽略冲突继续。</p>`,
      submit: actionText,
      cancel: '返回修改',
      danger: true,
      onSubmit: () => resolve(true),
      onClose: () => resolve(false),
    });
  });
}

/* ---------- 对话框 ---------- */
/*
 * 打开一个对话框。
 * opts: { title, body(HTML), submit(按钮文字,不传则只有关闭), cancel, danger, wide,
 *         locked(不能关闭:没有关闭按钮、Esc 无效;cancel 按钮改为调用 onCancel),
 *         onOpen(dlg), onSubmit(formData, dlg)(抛错则显示在对话框里、不关闭), onClose() }
 */
function openDialog(opts) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<form novalidate>
      <div class="dlg-head"><h3>${esc(opts.title)}</h3><button type="button" class="close" aria-label="关闭">×</button></div>
      <div class="dlg-body">${opts.body}<p class="error" role="alert"></p></div>
      <div class="dlg-foot">
        <button type="button" data-cancel>${esc(opts.cancel || (opts.submit ? '取消' : '关闭'))}</button>
        ${opts.submit ? `<button class="${opts.danger ? 'danger' : 'primary'}" type="submit">${esc(opts.submit)}</button>` : ''}
      </div>
    </form>`;
  if (opts.wide) dlg.style.width = 'min(720px, calc(100vw - 32px))';
  document.body.appendChild(dlg);
  let submitted = false, done = false;
  // 关闭时立即清理;按 Esc 关闭走 close 事件,也到这里(只执行一次)
  const close = () => {
    if (done) return;
    done = true;
    if (dlg.open) dlg.close();
    dlg.remove();
    if (!submitted && opts.onClose) opts.onClose();
  };
  dlg.addEventListener('close', close);
  dlg.dismiss = close; // 供调用方主动关闭
  if (opts.locked) {
    $('.close', dlg).remove();
    dlg.addEventListener('cancel', (e) => e.preventDefault()); // 禁止 Esc 关闭
    $('[data-cancel]', dlg).onclick = () => opts.onCancel && opts.onCancel();
  } else {
    $('.close', dlg).onclick = close;
    $('[data-cancel]', dlg).onclick = close;
  }
  $('form', dlg).onsubmit = async (ev) => {
    ev.preventDefault();
    if (!opts.onSubmit) return close();
    const btn = $('button[type=submit]', dlg);
    const err = $('.error', dlg);
    err.textContent = '';
    btn.disabled = true;
    try {
      const keep = await opts.onSubmit(formData(ev.target), dlg);
      if (keep !== false) { submitted = true; close(); }
    } catch (e) {
      err.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  };
  dlg.showModal();
  if (opts.onOpen) opts.onOpen(dlg);
  return dlg;
}

/* 表单内容;多选框(同名多个)收集为数组 */
function formData(form) {
  const d = {};
  for (const [k, v] of new FormData(form)) {
    if (k in d) d[k] = [].concat(d[k], v);
    else d[k] = v;
  }
  for (const box of $$('input[type=checkbox][data-multi]', form)) {
    d[box.name] = [].concat(d[box.name] ?? []).filter((x) => x !== undefined);
  }
  return d;
}

/*
 * 修改自己的密码。force=true:密码被管理员重置过,必须改完才能继续使用(对话框不能关闭,只能退出登录)。
 * 改成功后调用 after(新的用户信息)。
 */
function openChangePassword(force, after) {
  openDialog({
    title: force ? '请修改密码' : '修改密码',
    locked: force,
    cancel: force ? '退出登录' : '取消',
    onCancel: async () => {
      try { await api('POST', '/auth/logout'); } catch (e) { /* 已过期也无妨 */ }
      location.replace('/login.html');
    },
    body: `${force ? '<div class="warn-box">你的密码已被管理员重置。为了账号安全,请先设置自己的新密码再继续使用。</div>' : ''}
      <div class="field"><label for="pw_old">${force ? '当前密码' : '原密码'}</label>
        <input id="pw_old" name="oldPassword" type="password" required autocomplete="current-password">
        ${force ? '<span class="help">即管理员重置后的密码(123456)</span>' : ''}</div>
      <div class="field"><label for="pw_new">新密码</label>
        <input id="pw_new" name="newPassword" type="password" required maxlength="64" autocomplete="new-password">
        <span class="help">8~64 位,同时包含字母和数字</span></div>
      <div class="field"><label for="pw_new2">确认新密码</label>
        <input id="pw_new2" name="confirm" type="password" required autocomplete="new-password"></div>`,
    submit: '保存新密码',
    onOpen: (dlg) => $('#pw_old', dlg).focus(),
    onSubmit: async (d) => {
      if (!d.oldPassword || !d.newPassword) throw new Error('请填写完整');
      if (d.newPassword !== d.confirm) throw new Error('两次输入的新密码不一致');
      const me = await api('PUT', '/auth/password', { oldPassword: d.oldPassword, newPassword: d.newPassword });
      toast('密码已修改');
      if (after) await after(me);
    },
  });
}

/* 简单确认框 */
function confirmBox(title, message, okText = '确定', danger = false) {
  return new Promise((resolve) => {
    openDialog({
      title, body: `<p>${esc(message)}</p>`, submit: okText, danger,
      onSubmit: () => resolve(true), onClose: () => resolve(false),
    });
  });
}

/*
 * 用户多选控件的 HTML。users: [{userId, displayName, username}];
 * name 为表单字段名,选中的 userId 收集为数组。
 */
function userPickerHtml(name, users, emptyText = '没有可选的用户') {
  if (!users.length) return `<div class="picker"><div class="none">${esc(emptyText)}</div></div>`;
  return `<div class="picker">
    <input type="search" placeholder="搜索姓名或用户名" data-picker-search aria-label="搜索用户">
    <div class="list">${users.map((u) => `<label data-key="${esc((u.displayName + ' ' + u.username).toLowerCase())}">
        <input type="checkbox" name="${esc(name)}" value="${u.userId}" data-multi>
        ${avatar(u.displayName, 'xs')}<span>${esc(u.displayName)} <span class="muted">@${esc(u.username)}</span></span>
      </label>`).join('')}
      <div class="none" hidden data-picker-none>没有匹配的用户</div>
    </div>
  </div>`;
}
/* 搜索框过滤(对话框打开后调用) */
function bindPickers(root) {
  for (const input of $$('[data-picker-search]', root)) {
    const picker = input.closest('.picker');
    input.oninput = () => {
      const q = input.value.trim().toLowerCase();
      let shown = 0;
      for (const l of $$('label', picker)) {
        const hit = !q || l.dataset.key.includes(q);
        l.hidden = !hit;
        if (hit) shown++;
      }
      $('[data-picker-none]', picker).hidden = shown > 0;
    };
    // 在搜索框里回车不提交表单
    input.onkeydown = (e) => { if (e.key === 'Enter') e.preventDefault(); };
  }
}
const ids = (v) => [].concat(v ?? []).map(Number).filter(Boolean);

/* ---------- 提示 ---------- */
let toastTimer;
function toast(msg) {
  let t = $('#toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.remove('show');
  void t.offsetWidth; // 连续提示时重新触发动画
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

const badge = (text, cls) => `<span class="badge ${cls}">${esc(text)}</span>`;
const INVITE = {
  PENDING: ['待确认', 'warn'],
  ACCEPTED: ['已同意', 'ok'],
  DECLINED: ['已拒绝', 'idle'],
};
const inviteBadge = (s) => badge(...(INVITE[s] || [s || '—', 'idle']));
