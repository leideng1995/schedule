/*
 * 主页面:我的行程、待我回复、我的组、用户管理(管理员)。
 * 权限和冲突检测都在后端;这里只按角色显示/隐藏操作,冲突时用 withConflictCheck 提示后可选择继续。
 */
let ME = null;
let EVENTS = [];   // 我发起的和被邀请的行程
let GROUPS = [];   // 我创建的和被邀请/已加入的组
let USERS = [];    // 普通用户(邀请、加组用),不含自己

const isAdmin = () => ME.role === 'ADMIN';
const now = () => new Date();
const ended = (e) => toDate(e.endTime) < now();
const isOwner = (x) => x.ownerId === ME.userId;
const isOpen = (e) => e.status === 'ACTIVE' && !ended(e);
/* 组内邀约只能用自己创建的组 */
const ownGroups = () => GROUPS.filter(isOwner);

/* ---------- 启动 ---------- */
(async function boot() {
  try {
    ME = await api('GET', '/auth/me');
  } catch (e) {
    if (e.status !== 401) {
      document.body.innerHTML = `<div class="boot-error"><strong>无法打开页面</strong>${esc(e.message)}</div>`;
    }
    return;
  }
  window.ME = ME;
  showWho();
  $$('[data-admin]').forEach((el) => { el.hidden = !isAdmin(); });
  $('#logout').onclick = async () => {
    try { await api('POST', '/auth/logout'); } catch (e) { /* 已过期也无妨 */ }
    location.replace('/login.html');
  };
  $$('.tabs button').forEach((b) => { b.onclick = () => showTab(b.dataset.tab); });
  initHome();
  $('#newEvent').onclick = () => openEventForm();
  $('#newGroup').onclick = openGroupForm;
  $('#newUser').onclick = openUserForm;
  $('#userSearch').oninput = debounce(loadUsersTable, 250);
  $('#changePassword').onclick = () => openChangePassword(false);
  $('#profile').onclick = openProfile;
  if (isAdmin()) $('#newEvent').textContent = '+ 组内邀约';
  // 密码被管理员重置过:后端在改密码前会拒绝其他接口,先强制修改,改完重新加载
  if (ME.mustChangePassword) {
    openChangePassword(true, () => location.reload());
    return;
  }
  await refresh();
  showTab(location.hash.slice(1) || 'events');
  // 早期注册的用户没有邮箱:提醒补上(不强制)
  if (!ME.email) toast('你还没有填写邮箱,可以在「个人信息」里补充,之后就能用邮箱登录');
})();

/* 修改自己的姓名和邮箱 */
function openProfile() {
  openDialog({
    title: '个人信息',
    body: `<dl class="kv"><dt>用户名</dt><dd>${esc(ME.username)}</dd><dt>角色</dt><dd>${esc(ME.roleLabel)}</dd></dl>
      <div class="field"><label for="pf_name">姓名 *</label>
        <input id="pf_name" name="displayName" maxlength="50" required value="${esc(ME.displayName)}"></div>
      <div class="field"><label for="pf_email">邮箱 *</label>
        <input id="pf_email" name="email" type="email" maxlength="100" required value="${esc(ME.email || '')}" autocomplete="email">
        <span class="help">可以用邮箱代替用户名登录;只有你自己和管理员能看到</span></div>`,
    submit: '保存',
    onOpen: (dlg) => $(ME.email ? '#pf_name' : '#pf_email', dlg).focus(),
    onSubmit: async (d) => {
      if (!d.displayName.trim()) throw new Error('请填写姓名');
      if (!d.email.trim()) throw new Error('请填写邮箱');
      ME = await api('PUT', '/auth/profile', { displayName: d.displayName.trim(), email: d.email.trim() });
      window.ME = ME;
      showWho();
      renderHero();
      toast('个人信息已保存');
    },
  });
}

function showWho() {
  $('#who').textContent = `${ME.displayName}(${ME.roleLabel})`;
  $('#whoAvatar').innerHTML = avatar(ME.displayName);
}

function showTab(tab) {
  if (tab === 'users' && !isAdmin()) tab = 'events';
  if (!$('#tab-' + tab)) tab = 'events';
  $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $$('main > section').forEach((s) => { s.hidden = s.id !== 'tab-' + tab; });
  history.replaceState(null, '', '#' + tab);
  if (tab === 'users') loadUsersTable();
}

async function refresh() {
  try {
    [EVENTS, GROUPS, USERS] = await Promise.all([
      api('GET', '/events'), api('GET', '/groups'), api('GET', '/users'),
    ]);
    USERS = USERS.filter((u) => u.userId !== ME.userId);
  } catch (e) {
    toast(e.message);
  }
  renderEvents();
  renderInbox();
  renderGroups();
}

/* 执行一个操作:成功提示并刷新,失败提示原因 */
async function act(fn, okMsg) {
  try {
    const r = await fn();
    if (r === null) return; // 用户在冲突提示里选了"返回修改"
    if (okMsg) toast(okMsg);
  } catch (e) {
    toast(e.message);
  }
  await refresh();
}

/* ---------- 冲突:在我已同意的行程之间,按时间重叠计算(仅用于列表上的提示) ---------- */
function myConflicts(e) {
  if (e.status !== 'ACTIVE' || !e.myStatus || e.myStatus === 'DECLINED') return [];
  const s = toDate(e.startTime), t = toDate(e.endTime);
  return EVENTS.filter((o) => o.eventId !== e.eventId && o.status === 'ACTIVE' && o.myStatus === 'ACCEPTED'
    && toDate(o.startTime) < t && toDate(o.endTime) > s);
}

/* ---------- 我的行程(首页的展示在 home.js) ---------- */
function renderEvents() {
  renderHome();
}

function eventCard(e, inbox = false) {
  const conflicts = myConflicts(e);
  const tags = [];
  if (e.status === 'CANCELLED') tags.push(badge('已取消', 'idle'));
  else if (ended(e)) tags.push(badge('已结束', 'idle'));
  if (isOwner(e)) tags.push(badge('我发起的', 'info'));
  else tags.push(inviteBadge(e.myStatus));
  if (e.groupName) tags.push(badge('👥 ' + e.groupName, 'purple'));
  if (conflicts.length && isOpen(e)) {
    tags.push(badge(`⚠ 与「${conflicts[0].title}」${conflicts.length > 1 ? '等 ' + conflicts.length + ' 个行程' : ''}时间冲突`, 'bad'));
  }
  const meta = [];
  if (e.location) meta.push(`<span>📍 ${esc(e.location)}</span>`);
  meta.push(`<span class="owner">${avatar(e.ownerName, 'xs')}${isOwner(e) ? '我' : esc(e.ownerName)} 发起</span>`);
  // 参与情况:已同意 / 被邀请的总人数
  const total = e.acceptedCount + e.pendingCount;
  const people = total <= 1 && !e.pendingCount && !isAdmin()
    ? '<div class="people-line muted">仅自己</div>'
    : `<div class="people-line"><span class="bar"><i style="width:${total ? Math.round(e.acceptedCount / total * 100) : 0}%"></i></span>
        <span>${e.acceptedCount} 人已同意${e.pendingCount ? ` · <span class="warn-text">${e.pendingCount} 人待确认</span>` : ''}</span></div>`;
  const live = isLive(e);
  const soon = isOpen(e) && !live && toDate(e.startTime) - now() < 86400000;

  const acts = [`<button class="small" onclick="openEventDetail(${e.eventId})">详情</button>`];
  if (isOpen(e)) {
    if (isOwner(e)) {
      acts.push(`<button class="small" onclick="openInviteForm(${e.eventId})">邀请</button>`);
      acts.push(`<button class="small danger" onclick="cancelEvent(${e.eventId})">取消行程</button>`);
    } else if (e.myStatus === 'PENDING') {
      acts.push(`<button class="small ok" onclick="respondEvent(${e.eventId}, true)">同意</button>`);
      acts.push(`<button class="small danger" onclick="respondEvent(${e.eventId}, false)">拒绝</button>`);
    } else if (e.myStatus === 'ACCEPTED') {
      acts.push(`<button class="small danger" onclick="respondEvent(${e.eventId}, false)">不参加了</button>`);
    } else if (e.myStatus === 'DECLINED') {
      acts.push(`<button class="small ok" onclick="respondEvent(${e.eventId}, true)">改为同意</button>`);
    }
  }
  const cls = ['card', 'ev-card', 'k-' + kindOf(e), e.status === 'CANCELLED' || ended(e) || e.myStatus === 'DECLINED' ? 'cancelled' : '',
    conflicts.length && isOpen(e) ? 'conflict' : ''].join(' ');
  const sameDay = toDate(e.startTime).toDateString() === toDate(e.endTime).toDateString();
  return `<div class="${cls}">
    <div class="time">${inbox ? `<span class="muted">${esc(fmtDay(e.startTime))}</span>` : ''}
      <strong>${fmtTime(e.startTime)}</strong>
      <span class="muted">至 ${sameDay ? '' : esc(fmtDay(e.endTime).split(' · ')[0]) + ' '}${fmtTime(e.endTime)}</span>
      <span class="dur">${esc(fmtDur(minutesOf(e)))}</span></div>
    <div class="body">
      <div class="title">${esc(e.title)}
        ${live ? '<span class="live-tag">● 进行中</span>' : soon ? `<span class="soon-tag">${esc(fromNow(e.startTime))}</span>` : ''}</div>
      <div class="meta">${meta.join('')}</div>
      ${people}
      <div class="tags">${tags.join('')}</div>
    </div>
    <div class="actions">${acts.join('')}</div>
  </div>`;
}

/*
 * 预约行程 / 组内邀约。
 * presetGroupId:从"我的组"点"组内邀约"进来时预选该组;presetStart:在周视图点空白时段时的开始时间。
 */
function openEventForm(presetGroupId, presetStart) {
  const groups = ownGroups();
  if (isAdmin() && !groups.length) {
    toast('请先创建一个组,再给组内成员发起邀约');
    showTab('groups');
    return;
  }
  // 默认下一个整点开始,时长 1 小时
  let start = presetStart;
  if (!start) { start = new Date(); start.setMinutes(0, 0, 0); start.setHours(start.getHours() + 1); }
  const end = new Date(start.getTime() + 3600000);
  const groupOptions = groups.map((g) => `<option value="${g.groupId}" ${g.groupId === presetGroupId ? 'selected' : ''}
      ${g.acceptedCount ? '' : 'disabled'}>${esc(g.name)}(${g.acceptedCount} 人已加入${g.acceptedCount ? '' : ',暂不能邀约'})</option>`).join('');

  openDialog({
    title: isAdmin() ? '发起组内邀约' : '预约行程',
    wide: true,
    body: `
      ${isAdmin() ? '<p class="note">管理员发起的邀约会发给所选组内所有已加入的成员,成员同意后计入其行程。你本人不作为参与人。</p>'
        : '<p class="note">你自己会自动参加。被邀请的人同意后,这个行程才会进入他们的日程。</p>'}
      <div class="field"><label for="ev_title">标题 *</label>
        <input id="ev_title" name="title" maxlength="100" required placeholder="例如:项目周会"></div>
      <div class="row">
        <div class="field"><label for="ev_start">开始时间 *</label>
          <input id="ev_start" name="startTime" type="datetime-local" required value="${toLocalInput(start)}"></div>
        <div class="field"><label for="ev_end">结束时间 *</label>
          <input id="ev_end" name="endTime" type="datetime-local" required value="${toLocalInput(end)}"></div>
      </div>
      <div class="dur-chips" role="group" aria-label="快速选择时长">
        <span class="muted">时长</span>
        ${[30, 60, 90, 120, 240].map((m) => `<button type="button" class="chip" data-min="${m}">${fmtDur(m)}</button>`).join('')}
      </div>
      <div class="warn-box" id="ev_conflict" hidden></div>
      <div class="field"><label for="ev_loc">地点</label><input id="ev_loc" name="location" maxlength="200"></div>
      <div class="field"><label for="ev_desc">说明</label><textarea id="ev_desc" name="description" maxlength="1000"></textarea></div>
      <div class="field"><label for="ev_group">组内邀约${isAdmin() ? ' *' : ''}</label>
        ${groups.length ? `<select id="ev_group" name="groupId">${isAdmin() ? '' : '<option value="">不邀请组</option>'}${groupOptions}</select>
          <span class="help">邀请组内所有已加入的成员;只能选择自己创建的组${isAdmin() ? '' : ',普通用户建的组需要成员同意加入后才能邀约'}</span>`
        : '<span class="help">你还没有创建组。可以在「我的组」里创建,成员同意加入后即可组内邀约。</span>'}
      </div>
      ${isAdmin() ? '' : `<div class="field"><label>邀请其他用户</label>
        ${userPickerHtml('inviteeIds', USERS, '还没有其他普通用户')}</div>`}`,
    submit: isAdmin() ? '发出邀约' : '预约',
    onOpen: (dlg) => {
      bindPickers(dlg);
      // 改开始时间时,结束时间保持原来的时长
      const s = $('#ev_start', dlg), t = $('#ev_end', dlg);
      let last = s.value;
      // 选时间时就提示和自己已有行程的冲突(提交时后端还会对所有参与人再查一次)
      const preview = () => {
        const box = $('#ev_conflict', dlg);
        const from = toDate(s.value), to = toDate(t.value);
        const minutes = from && to ? Math.round((to - from) / 60000) : 0;
        $$('.dur-chips .chip', dlg).forEach((c) => c.classList.toggle('active', Number(c.dataset.min) === minutes));
        const hits = isAdmin() || minutes <= 0 ? [] : EVENTS.filter((o) => o.status === 'ACTIVE' && o.myStatus === 'ACCEPTED'
          && toDate(o.startTime) < to && toDate(o.endTime) > from);
        box.hidden = !hits.length;
        box.innerHTML = hits.length ? `⚠ 这个时间你已有:${hits.map((o) =>
          `「${esc(o.title)}」${esc(fmtTime(o.startTime))}-${esc(fmtTime(o.endTime))}`).join('、')}。仍可提交,提交时会再确认一次。` : '';
      };
      s.onchange = () => {
        const dur = toDate(t.value) - toDate(last);
        if (s.value && dur > 0) t.value = toLocalInput(new Date(toDate(s.value).getTime() + dur));
        last = s.value;
        preview();
      };
      t.onchange = preview;
      $$('.dur-chips .chip', dlg).forEach((c) => {
        c.onclick = () => {
          if (!s.value) return;
          t.value = toLocalInput(new Date(toDate(s.value).getTime() + Number(c.dataset.min) * 60000));
          preview();
        };
      });
      preview();
      $('#ev_title', dlg).focus();
    },
    onSubmit: async (d) => {
      if (!d.title.trim()) throw new Error('请填写标题');
      if (!d.startTime || !d.endTime) throw new Error('请填写开始和结束时间');
      if (toDate(d.endTime) <= toDate(d.startTime)) throw new Error('结束时间必须晚于开始时间');
      if (isAdmin() && !d.groupId) throw new Error('请选择要邀约的组');
      const body = {
        title: d.title.trim(), location: d.location, description: d.description,
        startTime: d.startTime, endTime: d.endTime,
        inviteeIds: ids(d.inviteeIds), groupId: d.groupId ? Number(d.groupId) : null,
      };
      const r = await withConflictCheck((force) => api('POST', '/events', { ...body, force }), '忽略冲突,仍然预约');
      if (r === null) return false; // 返回修改:保留对话框
      const n = r.participants.filter((p) => p.status === 'PENDING').length;
      toast(isAdmin() ? `已向 ${n} 位成员发出邀约` : n ? `预约成功,已邀请 ${n} 人` : '预约成功');
      await refresh();
    },
  });
}

/* 给已有行程追加邀请 */
async function openInviteForm(eventId) {
  let detail;
  try { detail = await api('GET', `/events/${eventId}`); } catch (e) { return toast(e.message); }
  const taken = new Set(detail.participants.filter((p) => p.status !== 'DECLINED').map((p) => p.userId));
  const candidates = USERS.filter((u) => !taken.has(u.userId));
  const groups = ownGroups().filter((g) => g.acceptedCount);
  openDialog({
    title: `邀请参加「${detail.event.title}」`,
    body: `<p class="note">${esc(fmtSpan(detail.event.startTime, detail.event.endTime))}。已同意或待确认的人不会重复邀请,拒绝过的可以再次邀请。</p>
      ${groups.length ? `<div class="field"><label for="iv_group">组内邀约</label>
        <select id="iv_group" name="groupId">${isAdmin() ? '' : '<option value="">不邀请组</option>'}
        ${groups.map((g) => `<option value="${g.groupId}">${esc(g.name)}(${g.acceptedCount} 人已加入)</option>`).join('')}</select></div>` : ''}
      ${isAdmin() ? '' : `<div class="field"><label>邀请其他用户</label>${userPickerHtml('userIds', candidates, '没有可以邀请的用户了')}</div>`}`,
    submit: '发出邀请',
    onOpen: bindPickers,
    onSubmit: async (d) => {
      const body = { userIds: ids(d.userIds), groupId: d.groupId ? Number(d.groupId) : null };
      if (!body.userIds.length && !body.groupId) throw new Error('请选择要邀请的用户或组');
      const r = await withConflictCheck((force) => api('POST', `/events/${eventId}/invite`, { ...body, force }), '忽略冲突,仍然邀请');
      if (r === null) return false;
      toast('邀请已发出');
      await refresh();
    },
  });
}

async function respondEvent(eventId, accept) {
  if (!accept) {
    const e = EVENTS.find((x) => x.eventId === eventId);
    const sure = await confirmBox(e && e.myStatus === 'ACCEPTED' ? '不参加了' : '拒绝邀请',
      `确定${e && e.myStatus === 'ACCEPTED' ? '不参加' : '拒绝'}「${e ? e.title : ''}」吗?`, '确定', true);
    if (!sure) return;
  }
  await act(() => withConflictCheck(
    (force) => api('POST', `/events/${eventId}/respond`, { accept, force }), '忽略冲突,仍然同意'),
  accept ? '已同意,行程已加入你的日程' : '已拒绝');
}

async function cancelEvent(eventId) {
  const e = EVENTS.find((x) => x.eventId === eventId);
  if (!await confirmBox('取消行程', `确定取消「${e ? e.title : ''}」吗?所有参与人都会看到行程已取消。`, '取消行程', true)) return;
  await act(() => api('POST', `/events/${eventId}/cancel`), '行程已取消');
}

async function openEventDetail(eventId) {
  let d;
  try { d = await api('GET', `/events/${eventId}`); } catch (e) { return toast(e.message); }
  const e = d.event;
  const local = EVENTS.find((x) => x.eventId === eventId);
  const conflicts = local ? myConflicts(local) : [];
  openDialog({
    title: e.title,
    body: `${conflicts.length && isOpen(e) ? `<div class="warn-box">与你已同意的行程时间冲突:${conflicts.map((c) =>
      `「${esc(c.title)}」${esc(fmtSpan(c.startTime, c.endTime))}`).join(';')}</div>` : ''}
      <dl class="kv">
        <dt>时间</dt><dd>${esc(fmtSpan(e.startTime, e.endTime))}</dd>
        <dt>状态</dt><dd>${e.status === 'CANCELLED' ? badge('已取消', 'idle') : ended(e) ? badge('已结束', 'idle') : badge('进行中', 'ok')}</dd>
        <dt>发起人</dt><dd>${esc(e.ownerName)}</dd>
        ${e.groupName ? `<dt>组</dt><dd>${esc(e.groupName)}</dd>` : ''}
        ${e.location ? `<dt>地点</dt><dd>${esc(e.location)}</dd>` : ''}
        ${e.description ? `<dt>说明</dt><dd>${esc(e.description)}</dd>` : ''}
      </dl>
      <h3 class="section-title">参与人(${d.participants.length})</h3>
      ${d.participants.length ? `<ul class="people">${d.participants.map((p) => `<li>
          ${avatar(p.displayName)}<span class="name">${esc(p.displayName)} <span class="muted">@${esc(p.username)}</span>
          ${p.invitedBy == null ? badge('发起人', 'info') : ''}${p.userId === ME.userId ? badge('我', 'idle') : ''}</span>
          ${inviteBadge(p.status)}</li>`).join('')}</ul>` : '<p class="muted">还没有参与人</p>'}`,
  });
}

/* ---------- 待我回复 ---------- */
function renderInbox() {
  const evs = EVENTS.filter((e) => !isOwner(e) && e.myStatus === 'PENDING' && isOpen(e));
  const gs = GROUPS.filter((g) => !isOwner(g) && g.myStatus === 'PENDING');
  $('#inboxEvents').innerHTML = evs.length ? evs.map((e) => eventCard(e, true)).join('')
    : '<div class="empty">没有待回复的行程邀请</div>';
  $('#inboxGroups').innerHTML = gs.length ? gs.map(groupCard).join('')
    : '<div class="empty">没有待回复的入组邀请</div>';
  const n = evs.length + gs.length;
  $('#inboxCount').hidden = !n;
  $('#inboxCount').textContent = n;
}

/* ---------- 我的组 ---------- */
function renderGroups() {
  $('#groupHint').textContent = isAdmin()
    ? '管理员建的组,成员直接加入,可以直接组内邀约'
    : '你建的组需要成员同意后才算加入;组内邀约只发给已加入的成员';
  const list = GROUPS.filter((g) => isOwner(g) || g.myStatus !== 'DECLINED');
  $('#groupList').innerHTML = list.length ? list.map(groupCard).join('')
    : '<div class="empty">还没有组。<br><br><button class="primary" onclick="openGroupForm()">创建组</button></div>';
}

function groupCard(g) {
  const tags = [g.needConsent ? badge('成员需同意', 'idle') : badge('管理员组', 'info')];
  if (isOwner(g)) tags.unshift(badge('我创建的', 'info'));
  else tags.unshift(inviteBadge(g.myStatus));
  const acts = [`<button class="small" onclick="openGroupDetail(${g.groupId})">成员</button>`];
  if (isOwner(g)) {
    acts.push(`<button class="small primary" onclick="openEventForm(${g.groupId})" ${g.acceptedCount ? '' : 'disabled title="还没有已加入的成员"'}>组内邀约</button>`);
    acts.push(`<button class="small" onclick="openAddMembers(${g.groupId})">添加成员</button>`);
    acts.push(`<button class="small danger" onclick="deleteGroup(${g.groupId})">删除</button>`);
  } else if (g.myStatus === 'PENDING') {
    acts.push(`<button class="small ok" onclick="respondGroup(${g.groupId}, true)">同意加入</button>`);
    acts.push(`<button class="small danger" onclick="respondGroup(${g.groupId}, false)">拒绝</button>`);
  } else if (g.myStatus === 'ACCEPTED') {
    acts.push(`<button class="small danger" onclick="leaveGroup(${g.groupId})">退出组</button>`);
  }
  return `<div class="card">
    <div class="body">
      <div class="title">${esc(g.name)}</div>
      <div class="meta"><span>${isOwner(g) ? '我' : esc(g.ownerName)} 创建</span>
        <span>${g.acceptedCount} 人已加入${g.pendingCount ? `,${g.pendingCount} 人待同意` : ''}</span></div>
      <div class="tags">${tags.join('')}</div>
    </div>
    <div class="actions">${acts.join('')}</div>
  </div>`;
}

function openGroupForm() {
  openDialog({
    title: '创建组',
    body: `<p class="note">${isAdmin() ? '管理员创建的组,所选成员直接加入。'
      : '你创建的组,所选成员会收到入组邀请,同意后才算加入,之后才能对他们进行组内邀约。'}</p>
      <div class="field"><label for="gp_name">组名 *</label><input id="gp_name" name="name" maxlength="100" required></div>
      <div class="field"><label>成员</label>${userPickerHtml('memberIds', USERS, '还没有其他普通用户')}
        <span class="help">只能选择普通用户,之后也可以继续添加</span></div>`,
    submit: '创建',
    onOpen: (dlg) => { bindPickers(dlg); $('#gp_name', dlg).focus(); },
    onSubmit: async (d) => {
      if (!d.name.trim()) throw new Error('请填写组名');
      const r = await api('POST', '/groups', { name: d.name.trim(), memberIds: ids(d.memberIds) });
      const n = r.members.length;
      toast(!n ? '组已创建' : isAdmin() ? `组已创建,${n} 位成员已加入` : `组已创建,已向 ${n} 人发出入组邀请`);
      await refresh();
    },
  });
}

async function openAddMembers(groupId) {
  let d;
  try { d = await api('GET', `/groups/${groupId}`); } catch (e) { return toast(e.message); }
  const taken = new Set(d.members.filter((m) => m.status !== 'DECLINED').map((m) => m.userId));
  openDialog({
    title: `添加成员到「${d.group.name}」`,
    body: `<p class="note">${d.group.needConsent ? '对方同意后才算加入。拒绝过的可以再次邀请。' : '所选用户直接加入。'}</p>
      ${userPickerHtml('userIds', USERS.filter((u) => !taken.has(u.userId)), '所有普通用户都已在组内')}`,
    submit: d.group.needConsent ? '发出邀请' : '添加',
    onOpen: bindPickers,
    onSubmit: async (f) => {
      const userIds = ids(f.userIds);
      if (!userIds.length) throw new Error('请选择要添加的成员');
      await api('POST', `/groups/${groupId}/members`, { userIds });
      toast(d.group.needConsent ? '入组邀请已发出' : '成员已添加');
      await refresh();
    },
  });
}

async function openGroupDetail(groupId) {
  let d;
  try { d = await api('GET', `/groups/${groupId}`); } catch (e) { return toast(e.message); }
  const g = d.group;
  const owner = isOwner(g);
  const dlg = openDialog({
    title: g.name,
    body: `<dl class="kv"><dt>创建人</dt><dd>${esc(g.ownerName)}</dd>
        <dt>类型</dt><dd>${g.needConsent ? '普通用户组(成员同意后加入)' : '管理员组(成员直接加入)'}</dd></dl>
      <h3 class="section-title">成员(${d.members.length})</h3>
      ${d.members.length ? `<ul class="people">${d.members.map((m) => `<li>
          ${avatar(m.displayName)}<span class="name">${esc(m.displayName)} <span class="muted">@${esc(m.username)}</span>${m.userId === ME.userId ? badge('我', 'idle') : ''}</span>
          ${inviteBadge(m.status)}
          ${owner ? `<button type="button" class="small danger" data-remove="${m.userId}">移除</button>` : ''}</li>`).join('')}</ul>`
        : '<p class="muted">还没有成员</p>'}`,
  });
  $$('[data-remove]', dlg).forEach((b) => {
    b.onclick = async () => {
      const m = d.members.find((x) => x.userId === Number(b.dataset.remove));
      dlg.dismiss();
      if (!await confirmBox('移除成员', `确定把 ${m.displayName} 移出「${g.name}」吗?`, '移除', true)) return;
      await act(() => api('DELETE', `/groups/${groupId}/members/${m.userId}`), '已移除');
    };
  });
}

async function respondGroup(groupId, accept) {
  await act(() => api('POST', `/groups/${groupId}/respond`, { accept }), accept ? '已加入该组' : '已拒绝入组邀请');
}

async function leaveGroup(groupId) {
  const g = GROUPS.find((x) => x.groupId === groupId);
  if (!await confirmBox('退出组', `确定退出「${g ? g.name : ''}」吗?退出后不会再收到该组的邀约。`, '退出', true)) return;
  await act(() => api('DELETE', `/groups/${groupId}/members/${ME.userId}`), '已退出');
}

async function deleteGroup(groupId) {
  const g = GROUPS.find((x) => x.groupId === groupId);
  if (!await confirmBox('删除组', `确定删除「${g ? g.name : ''}」吗?已经发出的组内邀约行程会保留。`, '删除', true)) return;
  await act(() => api('DELETE', `/groups/${groupId}`), '组已删除');
}

/* ---------- 用户管理(管理员) ---------- */
async function loadUsersTable() {
  const box = $('#userList');
  try {
    const kw = $('#userSearch').value.trim();
    const list = await api('GET', '/admin/users' + (kw ? '?keyword=' + encodeURIComponent(kw) : ''));
    ALL_USERS = list;
    box.innerHTML = list.length ? `<table><thead><tr><th>用户名</th><th>姓名</th><th>邮箱</th><th>角色</th><th>密码</th><th></th></tr></thead><tbody>
      ${list.map((u) => `<tr><td>${esc(u.username)}</td><td>${esc(u.displayName)}</td>
        <td>${u.email ? esc(u.email) : '<span class="muted">未填写</span>'}</td>
        <td>${badge(u.roleLabel, u.role === 'ADMIN' ? 'info' : 'idle')}</td>
        <td>${u.mustChangePassword ? badge('已重置,待用户修改', 'warn') : '<span class="muted">正常</span>'}</td>
        <td style="text-align:right">${u.userId === ME.userId ? '<span class="muted">当前账号</span>'
          : `<button class="small danger" onclick="resetPassword(${u.userId})">重置密码</button>`}</td>
        </tr>`).join('')}</tbody></table>`
      : '<div class="empty">没有匹配的用户</div>';
  } catch (e) {
    box.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

let ALL_USERS = []; // 用户管理表格当前显示的用户

async function resetPassword(userId) {
  const u = ALL_USERS.find((x) => x.userId === userId);
  if (!u) return;
  const name = u.displayName;
  if (!await confirmBox('重置密码', `确定把 ${name} 的密码重置为 123456 吗?对方下次操作时必须先修改密码。`, '重置', true)) return;
  try {
    await api('POST', `/admin/users/${userId}/reset-password`);
    toast(`已将 ${name} 的密码重置为 123456`);
  } catch (e) {
    toast(e.message);
  }
  loadUsersTable();
}

function openUserForm() {
  openDialog({
    title: '新建用户',
    body: `<div class="row">
        <div class="field"><label for="u_name">用户名 *</label><input id="u_name" name="username" maxlength="20" required autocomplete="off">
          <span class="help">3~20 位小写字母、数字或下划线</span></div>
        <div class="field"><label for="u_disp">姓名 *</label><input id="u_disp" name="displayName" maxlength="50" required></div>
      </div>
      <div class="field"><label for="u_email">邮箱 *</label><input id="u_email" name="email" type="email" maxlength="100" required autocomplete="off">
        <span class="help">用户可以用邮箱代替用户名登录</span></div>
      <div class="row">
        <div class="field"><label for="u_pw">初始密码 *</label><input id="u_pw" name="password" type="password" required autocomplete="new-password">
          <span class="help">8~64 位,同时包含字母和数字</span></div>
        <div class="field"><label for="u_role">角色</label>
          <select id="u_role" name="role"><option value="USER">普通用户</option><option value="ADMIN">管理员</option></select></div>
      </div>`,
    submit: '创建',
    onOpen: (dlg) => $('#u_name', dlg).focus(),
    onSubmit: async (d) => {
      if (!d.username.trim() || !d.displayName.trim() || !d.email.trim() || !d.password) throw new Error('请填写完整');
      await api('POST', '/admin/users', {
        username: d.username.trim(), displayName: d.displayName.trim(), email: d.email.trim(), password: d.password, role: d.role,
      });
      toast('用户已创建');
      loadUsersTable();
      refresh();
    },
  });
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
