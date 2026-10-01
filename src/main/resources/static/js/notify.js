/*
 * 站内通知中心:右上角铃铛(未读数)、通知面板(全部 / 未读 / 给我的留言)、活动开始前 5 分钟的弹窗提醒。
 * 每 30 秒轮询一次 /notifications/summary;有新通知时顺便刷新页面数据(新的邀请等会马上出现)。
 * 注意:onclick 里只放数字 ID;通知标题、内容都是用户输入拼出来的,一律转义。
 */
const NOTIFY = {
  items: [],          // 面板里当前显示的通知
  filter: 'all',
  hasMore: false,
  latestId: undefined, // 上次轮询时最新的通知 ID;undefined 表示还没轮询过
  shownReminders: new Set(), // 已经弹过窗的提醒(通知 ID),避免重复弹
};
const NOTIFY_PAGE = 20;
const NOTIFY_ICON = {
  EVENT_INVITED: '📨', EVENT_RESPONDED: '✅', EVENT_UPDATED: '✏️', EVENT_CANCELLED: '🚫', EVENT_REMINDER: '⏰',
  GROUP_INVITED: '👥', GROUP_ADDED: '👥', GROUP_RESPONDED: '👥', COMMENT: '💬', COMMENT_REPLY: '↩️',
};

function initNotify() {
  const bell = $('#bell'), panel = $('#notifyPanel');
  bell.onclick = (ev) => {
    ev.stopPropagation();
    const open = panel.hidden;
    panel.hidden = !open;
    bell.setAttribute('aria-expanded', String(open));
    if (open) loadNotifications(false);
  };
  // 点面板以外的地方关闭
  document.addEventListener('click', (ev) => {
    if (!panel.hidden && !ev.target.closest('.bell-wrap')) { panel.hidden = true; bell.setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !panel.hidden) { panel.hidden = true; bell.focus(); } });
  $$('.np-tabs button', panel).forEach((b) => {
    b.onclick = () => {
      NOTIFY.filter = b.dataset.nf;
      $$('.np-tabs button', panel).forEach((x) => x.classList.toggle('active', x === b));
      loadNotifications(false);
    };
  });
  $('#notifyMore').onclick = () => loadNotifications(true);
  $('#readAll').onclick = async () => {
    try {
      await api('POST', '/notifications/read-all' + (NOTIFY.filter === 'comment' ? '?filter=comment' : ''));
    } catch (e) { return toast(e.message); }
    await loadNotifications(false);
    pollNotify();
  };
  $('#notifyList').onclick = onNotificationClick;
  $('#reminders').onclick = onReminderClick;
  // 浏览器桌面通知:页面在后台标签页时也能看到开始提醒
  const dn = $('#desktopNotify');
  if ('Notification' in window && Notification.permission === 'default') {
    dn.hidden = false;
    dn.onclick = async () => {
      const p = await Notification.requestPermission();
      dn.hidden = true;
      toast(p === 'granted' ? '已开启桌面提醒,活动开始前 5 分钟会在系统通知里提醒你' : '没有开启桌面提醒,仍会在页面里弹窗提醒');
    };
  }
  pollNotify();
  setInterval(pollNotify, 30000);
  // 切回这个标签页时马上检查一次
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pollNotify(); });
}

/* 轮询:未读数、有没有新通知、需要弹窗的开始提醒 */
async function pollNotify() {
  let s;
  try { s = await api('GET', '/notifications/summary'); } catch (e) { return; } // 网络抖动等:下次再试
  const c = $('#bellCount');
  c.hidden = !s.unread;
  c.textContent = s.unread > 99 ? '99+' : s.unread;
  $('#bell').classList.toggle('has-unread', s.unread > 0);
  document.title = (s.unread ? `(${s.unread}) ` : '') + '行程预约';
  // 有新通知:刷新页面数据(新的邀请、变更等),面板开着时也刷新列表
  if (NOTIFY.latestId !== undefined && s.latestId !== NOTIFY.latestId) {
    refresh();
    if (!$('#notifyPanel').hidden) loadNotifications(false);
  }
  NOTIFY.latestId = s.latestId;
  for (const r of s.reminders) showReminder(r);
}

/* 加载通知列表;more=true 时接在后面加载更早的 */
async function loadNotifications(more) {
  const list = $('#notifyList');
  const q = new URLSearchParams({ filter: NOTIFY.filter, limit: NOTIFY_PAGE });
  if (more && NOTIFY.items.length) q.set('beforeId', NOTIFY.items[NOTIFY.items.length - 1].notificationId);
  if (!more) list.innerHTML = '<li class="np-empty">正在加载…</li>';
  let page;
  try { page = await api('GET', '/notifications?' + q); } catch (e) {
    list.innerHTML = `<li class="np-empty">${esc(e.message)}</li>`;
    return;
  }
  NOTIFY.items = more ? NOTIFY.items.concat(page) : page;
  NOTIFY.hasMore = page.length === NOTIFY_PAGE;
  $('#notifyMore').hidden = !NOTIFY.hasMore;
  list.innerHTML = NOTIFY.items.length ? NOTIFY.items.map(notificationHtml).join('')
    : `<li class="np-empty">${{ unread: '没有未读通知', comment: '还没有人给你留言' }[NOTIFY.filter] || '还没有通知'}</li>`;
}

function notificationHtml(n) {
  return `<li class="np-item ${n.readAt ? '' : 'unread'} nt-${esc(n.type)}" data-nid="${n.notificationId}" tabindex="0">
    <span class="np-icon" aria-hidden="true">${NOTIFY_ICON[n.type] || '🔔'}</span>
    <span class="np-main">
      <span class="np-title">${esc(n.title)}</span>
      ${n.content ? `<span class="np-content">${esc(n.content)}</span>` : ''}
      <span class="np-time">${esc(fmtWhen(n.createdAt))}</span>
    </span>
    ${n.readAt ? '' : '<i class="np-dot" title="未读"></i>'}
  </li>`;
}

/* 点一条通知:标记已读,然后跳到相关的行程(留言时定位到那条留言)或组 */
async function onNotificationClick(ev) {
  const li = ev.target.closest('[data-nid]');
  if (!li) return;
  const n = NOTIFY.items.find((x) => x.notificationId === Number(li.dataset.nid));
  if (!n) return;
  if (!n.readAt) {
    n.readAt = new Date().toISOString();
    li.classList.remove('unread');
    $('.np-dot', li)?.remove();
    api('POST', `/notifications/${n.notificationId}/read`).then(pollNotify).catch(() => {});
  }
  $('#notifyPanel').hidden = true;
  if (n.eventId) {
    showTab('events');
    openEventDetail(n.eventId, n.commentId);
  } else if (n.groupId) {
    showTab(n.type === 'GROUP_INVITED' ? 'inbox' : 'groups');
    if (n.type !== 'GROUP_INVITED') openGroupDetail(n.groupId);
  }
}

/* ---------- 活动开始前的弹窗提醒 ---------- */

function showReminder(r) {
  if (NOTIFY.shownReminders.has(r.notificationId)) return;
  NOTIFY.shownReminders.add(r.notificationId);
  const card = document.createElement('div');
  card.className = 'reminder';
  card.dataset.rid = r.notificationId;
  card.setAttribute('role', 'alert');
  card.innerHTML = `
    <div class="rm-head"><span aria-hidden="true">⏰</span> 活动即将开始
      <button type="button" class="rm-close" data-rm-close aria-label="关闭">×</button></div>
    <div class="rm-title">${esc(r.title)}</div>
    <div class="rm-meta">${esc(fmtTime(r.startTime))} - ${esc(fmtTime(r.endTime))}
      <strong data-rm-left></strong>${r.location ? `<br>📍 ${esc(r.location)}` : ''}</div>
    <div class="rm-acts">
      <button type="button" class="small" data-rm-open>查看详情</button>
      <button type="button" class="small primary" data-rm-close>知道了</button>
    </div>`;
  card.reminder = r;
  $('#reminders').appendChild(card);
  updateReminderCountdown(card);
  card.timer = setInterval(() => updateReminderCountdown(card), 15000);
  // 页面在后台时,用系统通知提醒一下
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    const sys = new Notification('活动即将开始:' + r.title, {
      body: `${fmtTime(r.startTime)} 开始${r.location ? ' · ' + r.location : ''}`, tag: 'reminder-' + r.notificationId,
    });
    sys.onclick = () => { window.focus(); sys.close(); };
  }
}

function updateReminderCountdown(card) {
  const ms = toDate(card.reminder.startTime) - new Date();
  $('[data-rm-left]', card).textContent = ms > 0 ? ` · ${Math.ceil(ms / 60000)} 分钟后开始` : ' · 已开始';
}

async function onReminderClick(ev) {
  const card = ev.target.closest('.reminder');
  if (!card) return;
  const open = ev.target.closest('[data-rm-open]');
  if (!open && !ev.target.closest('[data-rm-close]')) return;
  clearInterval(card.timer);
  card.remove();
  // 看过的提醒标为已读,下次轮询就不会再弹
  api('POST', `/notifications/${Number(card.dataset.rid)}/read`).then(pollNotify).catch(() => {});
  if (open) {
    showTab('events');
    openEventDetail(card.reminder.eventId);
  }
}
