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
  initNotify(); // 铃铛、通知面板、活动开始提醒(notify.js)
  // 早期注册的用户没有邮箱:提醒补上(不强制)
  if (!ME.email) toast('你还没有填写邮箱,可以在「个人信息」里补充,之后就能用邮箱登录');
})();

/* 修改自己的姓名和邮箱 */
function openProfile() {
  let pending = null; // 待提交的头像修改,见 bindAvatarPicker
  openDialog({
    title: '个人信息',
    body: `<div class="pf-avatar">
        <span data-pf-preview>${avatar(ME.displayName, 'xl', ME.userId)}</span>
        <div>
          <div class="pf-avatar-acts">
            <label class="btn small primary">上传头像<input type="file" accept="image/png,image/jpeg,image/gif" data-pf-file hidden></label>
            <button type="button" class="small" data-pf-remove ${AVATARS.has(ME.userId) ? '' : 'hidden'}>移除头像</button>
          </div>
          <span class="help">PNG、JPG 或 GIF,不超过 2MB;会居中裁成正方形</span>
          <span class="pf-pending" data-pf-pending hidden></span>
        </div>
      </div>
      <dl class="kv"><dt>用户名</dt><dd>${esc(ME.username)}</dd><dt>角色</dt><dd>${esc(ME.roleLabel)}</dd></dl>
      <div class="field"><label for="pf_name">姓名 *</label>
        <input id="pf_name" name="displayName" maxlength="50" required value="${esc(ME.displayName)}"></div>
      <div class="field"><label for="pf_email">邮箱 *</label>
        <input id="pf_email" name="email" type="email" maxlength="100" required value="${esc(ME.email || '')}" autocomplete="email">
        <span class="help">可以用邮箱代替用户名登录;只有你自己和管理员能看到</span></div>`,
    submit: '保存',
    onOpen: (dlg) => {
      pending = bindAvatarPicker(dlg);
      $(ME.email ? '#pf_name' : '#pf_email', dlg).focus();
    },
    onSubmit: async (d) => {
      if (!d.displayName.trim()) throw new Error('请填写姓名');
      if (!d.email.trim()) throw new Error('请填写邮箱');
      ME = await api('PUT', '/auth/profile', { displayName: d.displayName.trim(), email: d.email.trim() });
      window.ME = ME;
      // 头像的修改也在点"保存"时才提交
      try {
        await pending.commit();
      } catch (e) {
        showWho();
        throw new Error(`个人信息已保存,但头像没有更新:${e.message}`);
      }
      pending.dispose();
      showWho();
      renderHero();
      toast(pending.changed ? '个人信息和头像已保存' : '个人信息已保存');
      if (pending.changed) await refresh(); // 页面上所有地方的头像一起更新
    },
    onClose: () => pending && pending.dispose(), // 取消:丢掉选好的图片
  });
}

/*
 * 个人信息里的头像:选图片或点"移除头像"只在对话框里预览,点"保存"时才提交(commit),
 * 点"取消"或关闭对话框则丢弃(dispose)。服务器会校验并裁成 256×256。
 */
function bindAvatarPicker(dlg) {
  const input = $('[data-pf-file]', dlg), remove = $('[data-pf-remove]', dlg);
  const preview = $('[data-pf-preview]', dlg), hint = $('[data-pf-pending]', dlg);
  const state = { file: null, remove: false, url: null, changed: false };
  const show = () => {
    if (state.url) { URL.revokeObjectURL(state.url); state.url = null; }
    if (state.file) {
      state.url = URL.createObjectURL(state.file);
      preview.innerHTML = `<img class="avatar xl" src="${state.url}" alt="新头像预览">`;
    } else {
      // 移除时预览姓名首字;否则显示现在的头像
      preview.innerHTML = avatar(ME.displayName, 'xl', state.remove ? undefined : ME.userId);
    }
    const has = state.file || (!state.remove && AVATARS.has(ME.userId));
    remove.hidden = !has;
    hint.hidden = !state.file && !state.remove;
    hint.innerHTML = state.file ? '已选择新头像,点"保存"后生效 <button type="button" class="link" data-pf-undo>撤销</button>'
      : state.remove ? '将移除头像,点"保存"后生效 <button type="button" class="link" data-pf-undo>撤销</button>' : '';
  };
  input.onchange = () => {
    const f = input.files[0];
    input.value = ''; // 同一个文件可以重复选
    if (!f) return;
    if (!/^image\/(png|jpeg|gif)$/.test(f.type)) return toast('只支持 PNG、JPG、GIF 格式的图片');
    if (f.size > 2 * 1024 * 1024) return toast('图片不能超过 2MB');
    state.file = f;
    state.remove = false;
    show();
  };
  remove.onclick = () => {
    if (state.file) state.file = null; // 先撤掉刚选的
    else state.remove = true;
    show();
  };
  hint.onclick = (ev) => {
    if (!ev.target.closest('[data-pf-undo]')) return;
    state.file = null;
    state.remove = false;
    show();
  };
  return {
    get changed() { return state.changed; },
    /* 提交头像修改;没有修改时什么也不做 */
    async commit() {
      if (state.file) {
        const fd = new FormData();
        fd.append('file', state.file);
        let res;
        try { res = await fetch('/api/auth/avatar', { method: 'POST', body: fd }); } catch (e) { throw new Error('无法连接到服务器'); }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || `上传失败(${res.status})`);
        AVATARS.set(ME.userId, data.version);
        state.changed = true;
      } else if (state.remove) {
        await api('DELETE', '/auth/avatar');
        AVATARS.delete(ME.userId);
        state.changed = true;
      }
      state.file = null;
      state.remove = false;
    },
    dispose() {
      if (state.url) URL.revokeObjectURL(state.url);
      state.url = null;
    },
  };
}

function showWho() {
  $('#who').textContent = `${ME.displayName}(${ME.roleLabel})`;
  $('#whoAvatar').innerHTML = avatar(ME.displayName, '', ME.userId);
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
      api('GET', '/events'), api('GET', '/groups'), api('GET', '/users'), loadAvatars(),
    ]);
    USERS = USERS.filter((u) => u.userId !== ME.userId);
  } catch (e) {
    toast(e.message);
  }
  showWho(); // 头像列表可能有变化
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
  meta.push(`<span class="owner">${avatar(e.ownerName, 'xs', e.ownerId)}${isOwner(e) ? '我' : esc(e.ownerName)} 发起</span>`);
  if (e.commentCount) meta.push(`<span class="cm-count" onclick="openEventDetail(${e.eventId})" title="查看留言">💬 ${e.commentCount} 条留言</span>`);
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
      acts.push(`<button class="small" onclick="openEditForm(${e.eventId})">编辑</button>`);
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
          <span class="help">邀请组内所有已加入的成员;只能选择自己创建的组${isAdmin() ? '' : ',普通用户建的组需要成员同意加入后才能邀约'}</span>
          <div class="avail-summary" id="ev_group_avail" hidden></div>`
        : '<span class="help">你还没有创建组。可以在「我的组」里创建,成员同意加入后即可组内邀约。</span>'}
      </div>
      ${isAdmin() ? '' : `<div class="field"><label>邀请其他用户</label>
        ${userPickerHtml('inviteeIds', USERS, '还没有其他普通用户')}
        <span class="help">名字后面显示对方在所选时间是否有空(只显示忙闲,不显示对方的行程内容)</span></div>`}`,
    submit: isAdmin() ? '发出邀约' : '预约',
    onOpen: (dlg) => {
      bindPickers(dlg);
      // 选时间时:查所有可邀请用户的忙闲,标在选人列表上,并汇总所选组的成员
      const showGroup = groupAvailability(dlg, $('#ev_group', dlg), $('#ev_group_avail', dlg));
      const check = availabilityUpdater(dlg, () => USERS.map((u) => u.userId), null, showGroup);
      bindTimeInputs(dlg, { onChange: check });
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

/* ---------- 时间输入和忙闲 ---------- */

/*
 * 绑定表单里的开始 / 结束时间(#ev_start、#ev_end)和时长快捷按钮(.dur-chips):
 * 改开始时间时结束时间保持原来的时长;选时间时提示和自己已同意行程的冲突(#ev_conflict),
 * 提交时后端还会对所有参与人再查一次。
 * excludeEventId:编辑时排除行程本身;onChange(from, to):时间变化后回调,时间不完整时传 null。
 */
function bindTimeInputs(dlg, { excludeEventId = null, onChange } = {}) {
  const s = $('#ev_start', dlg), t = $('#ev_end', dlg);
  let last = s.value;
  const update = () => {
    const from = toDate(s.value), to = toDate(t.value);
    const minutes = from && to ? Math.round((to - from) / 60000) : 0;
    $$('.dur-chips .chip', dlg).forEach((c) => c.classList.toggle('active', Number(c.dataset.min) === minutes));
    const hits = isAdmin() || minutes <= 0 ? [] : EVENTS.filter((o) => o.eventId !== excludeEventId
      && o.status === 'ACTIVE' && o.myStatus === 'ACCEPTED' && toDate(o.startTime) < to && toDate(o.endTime) > from);
    const box = $('#ev_conflict', dlg);
    box.hidden = !hits.length;
    box.innerHTML = hits.length ? `⚠ 这个时间你已有:${hits.map((o) =>
      `「${esc(o.title)}」${esc(fmtTime(o.startTime))}-${esc(fmtTime(o.endTime))}`).join('、')}。仍可提交,提交时会再确认一次。` : '';
    if (onChange) onChange(minutes > 0 ? from : null, minutes > 0 ? to : null);
  };
  s.onchange = () => {
    const dur = toDate(t.value) - toDate(last);
    if (s.value && dur > 0) t.value = toLocalInput(new Date(toDate(s.value).getTime() + dur));
    last = s.value;
    update();
  };
  t.onchange = update;
  $$('.dur-chips .chip', dlg).forEach((c) => {
    c.onclick = () => {
      if (!s.value) return;
      t.value = toLocalInput(new Date(toDate(s.value).getTime() + Number(c.dataset.min) * 60000));
      update();
    };
  });
  update();
}

const AVAIL_BATCH = 200; // 后端一次最多查 200 人

/* 查询这些用户在 [from, to) 内的忙碌时段:Map(userId → [{startTime, endTime}]) */
async function fetchBusy(from, to, userIds, excludeEventId) {
  const busy = new Map();
  for (let i = 0; i < userIds.length; i += AVAIL_BATCH) {
    const q = new URLSearchParams({
      start: toLocalInput(from), end: toLocalInput(to), userIds: userIds.slice(i, i + AVAIL_BATCH).join(','),
    });
    if (excludeEventId) q.set('excludeEventId', excludeEventId);
    for (const s of await api('GET', '/events/availability?' + q)) {
      if (!busy.has(s.userId)) busy.set(s.userId, []);
      busy.get(s.userId).push(s);
    }
  }
  return busy;
}

/* "10:00-11:00、14:00-15:00 等" */
const busySpans = (slots) => slots.slice(0, 2).map((s) => `${fmtTime(s.startTime)}-${fmtTime(s.endTime)}`).join('、')
  + (slots.length > 2 ? ' 等' : '');

/* 把忙闲标到 root 里的 [data-avail=用户ID] 上;busy 为 null(时间没选好)时清空 */
function markAvailability(root, busy) {
  for (const el of $$('[data-avail]', root)) {
    const slots = busy && busy.get(Number(el.dataset.avail));
    el.className = 'avail' + (busy ? (slots ? ' busy' : ' free') : '');
    el.textContent = busy ? (slots ? '忙 ' + busySpans(slots) : '空闲') : '';
    el.title = slots ? '这段时间对方已有行程' : '';
  }
}

/*
 * 返回 check(from, to):查询 getIds() 这些人的忙闲并标在 root 上,然后调用 after(busy)。
 * 连续改时间时只采用最后一次的结果;查询失败只是不显示,不打断操作。
 */
function availabilityUpdater(root, getIds, excludeEventId, after) {
  let seq = 0;
  return debounce(async (from, to) => {
    const my = ++seq;
    let busy = null;
    const ids = getIds();
    if (from && to) {
      try { busy = ids.length ? await fetchBusy(from, to, ids, excludeEventId) : new Map(); } catch (e) { busy = null; }
    }
    if (my !== seq || !root.isConnected) return;
    markAvailability(root, busy);
    if (after) after(busy);
  }, 250);
}

/*
 * 组内邀约的忙闲汇总:返回 show(busy),根据下拉框当前选中的组,
 * 在 box 里显示"组内 N 位已加入成员中 M 人这个时间忙:…"。成员列表按组缓存。
 */
function groupAvailability(dlg, select, box) {
  if (!select || !box) return () => {};
  const members = new Map();
  let lastBusy = null;
  const show = async (busy = lastBusy) => {
    lastBusy = busy;
    const gid = Number(select.value);
    if (!gid || !busy) { box.hidden = true; return; }
    try {
      if (!members.has(gid)) {
        const d = await api('GET', `/groups/${gid}`);
        members.set(gid, d.members.filter((m) => m.status === 'ACCEPTED' && m.userId !== ME.userId));
      }
    } catch (e) { box.hidden = true; return; }
    if (Number(select.value) !== gid || !dlg.isConnected) return;
    const list = members.get(gid);
    const busyOnes = list.filter((m) => busy.has(m.userId));
    box.hidden = !list.length;
    box.className = 'avail-summary ' + (busyOnes.length ? 'busy' : 'free');
    box.innerHTML = busyOnes.length
      ? `组内 ${list.length} 位已加入成员中,<strong>${busyOnes.length} 人</strong>这个时间忙:${busyOnes.map((m) =>
        `${esc(m.displayName)}(${esc(busySpans(busy.get(m.userId)))})`).join('、')}`
      : `组内 ${list.length} 位已加入成员这个时间都有空`;
  };
  select.addEventListener('change', () => show());
  return show;
}

/*
 * 编辑行程(发起人)。只改标题、地点、说明时参与人状态不变;
 * 改了时间:后端重新检查冲突(可忽略继续),已同意的参与人改回待确认,并邮件通知他们。
 */
async function openEditForm(eventId) {
  let d;
  try { d = await api('GET', `/events/${eventId}`); } catch (e) { return toast(e.message); }
  const e = d.event;
  if (!isOwner(e) || !isOpen(e)) return toast('只能编辑自己发起的、未结束的行程');
  const others = d.participants.filter((p) => p.userId !== e.ownerId && p.status !== 'DECLINED');
  const acceptedOthers = others.filter((p) => p.status === 'ACCEPTED').length;
  const oldStart = toLocalInput(toDate(e.startTime)), oldEnd = toLocalInput(toDate(e.endTime));
  openDialog({
    title: `编辑「${e.title}」`,
    wide: true,
    body: `
      <div class="field"><label for="ev_title">标题 *</label>
        <input id="ev_title" name="title" maxlength="100" required value="${esc(e.title)}"></div>
      <div class="row">
        <div class="field"><label for="ev_start">开始时间 *</label>
          <input id="ev_start" name="startTime" type="datetime-local" required value="${oldStart}"></div>
        <div class="field"><label for="ev_end">结束时间 *</label>
          <input id="ev_end" name="endTime" type="datetime-local" required value="${oldEnd}"></div>
      </div>
      <div class="dur-chips" role="group" aria-label="快速选择时长">
        <span class="muted">时长</span>
        ${[30, 60, 90, 120, 240].map((m) => `<button type="button" class="chip" data-min="${m}">${fmtDur(m)}</button>`).join('')}
      </div>
      <div class="warn-box" id="ev_conflict" hidden></div>
      <div class="info-box" id="ed_reconfirm" hidden>
        修改了时间:${acceptedOthers ? `已同意的 <strong>${acceptedOthers} 人</strong>需要重新确认,` : ''}系统会发邮件通知${others.length ? '所有参与人' : ''}。
        <span class="muted">原时间 ${esc(fmtSpan(e.startTime, e.endTime))}</span>
      </div>
      <div class="field"><label for="ev_loc">地点</label><input id="ev_loc" name="location" maxlength="200" value="${esc(e.location || '')}"></div>
      <div class="field"><label for="ev_desc">说明</label><textarea id="ev_desc" name="description" maxlength="1000">${esc(e.description || '')}</textarea></div>
      ${others.length ? `<div class="field"><label>参与人在这个时间是否有空</label>
        <ul class="people avail-people">${others.map((p) => `<li>${avatar(p.displayName, '', p.userId)}
          <span class="name">${esc(p.displayName)} <span class="muted">@${esc(p.username)}</span></span>
          ${inviteBadge(p.status)}<span class="avail" data-avail="${p.userId}"></span></li>`).join('')}</ul></div>`
        : '<p class="note">这个行程还没有其他参与人。</p>'}`,
    submit: '保存修改',
    onOpen: (dlg) => {
      const check = availabilityUpdater(dlg, () => others.map((p) => p.userId), eventId);
      bindTimeInputs(dlg, {
        excludeEventId: eventId,
        onChange: (from, to) => {
          const changed = $('#ev_start', dlg).value !== oldStart || $('#ev_end', dlg).value !== oldEnd;
          $('#ed_reconfirm', dlg).hidden = !changed;
          check(from, to);
        },
      });
      $('#ev_title', dlg).focus();
    },
    onSubmit: async (f) => {
      if (!f.title.trim()) throw new Error('请填写标题');
      if (!f.startTime || !f.endTime) throw new Error('请填写开始和结束时间');
      if (toDate(f.endTime) <= toDate(f.startTime)) throw new Error('结束时间必须晚于开始时间');
      const timeChanged = f.startTime !== oldStart || f.endTime !== oldEnd;
      const body = {
        title: f.title.trim(), location: f.location, description: f.description,
        startTime: f.startTime, endTime: f.endTime,
      };
      const r = await withConflictCheck((force) => api('PUT', `/events/${eventId}`, { ...body, force }), '忽略冲突,仍然修改');
      if (r === null) return false; // 返回修改:保留对话框
      toast(timeChanged && acceptedOthers ? `行程已修改,${acceptedOthers} 人需要重新确认` : '行程已修改');
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
        ${groups.map((g) => `<option value="${g.groupId}">${esc(g.name)}(${g.acceptedCount} 人已加入)</option>`).join('')}</select>
        <div class="avail-summary" id="iv_group_avail" hidden></div></div>` : ''}
      ${isAdmin() ? '' : `<div class="field"><label>邀请其他用户</label>${userPickerHtml('userIds', candidates, '没有可以邀请的用户了')}
        <span class="help">名字后面显示对方在这个时间是否有空(只显示忙闲)</span></div>`}`,
    submit: '发出邀请',
    onOpen: (dlg) => {
      bindPickers(dlg);
      // 行程时间已定:直接查一次候选人和组成员的忙闲
      const showGroup = groupAvailability(dlg, $('#iv_group', dlg), $('#iv_group_avail', dlg));
      availabilityUpdater(dlg, () => USERS.map((u) => u.userId), eventId, showGroup)(
        toDate(detail.event.startTime), toDate(detail.event.endTime));
    },
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

/* 行程详情;focusCommentId:从通知点进来时定位到那条留言 */
async function openEventDetail(eventId, focusCommentId) {
  let d;
  try { d = await api('GET', `/events/${eventId}`); } catch (e) { return toast(e.message); }
  const e = d.event;
  const local = EVENTS.find((x) => x.eventId === eventId);
  const conflicts = local ? myConflicts(local) : [];
  const editable = isOwner(e) && isOpen(e);
  const dlg = openDialog({
    title: e.title,
    body: `${editable ? `<div class="detail-actions">
        <button type="button" class="small" data-edit-event>编辑行程</button>
        <button type="button" class="small" data-invite-event>邀请更多人</button></div>` : ''}
      ${conflicts.length && isOpen(e) ? `<div class="warn-box">与你已同意的行程时间冲突:${conflicts.map((c) =>
      `「${esc(c.title)}」${esc(fmtSpan(c.startTime, c.endTime))}`).join(';')}</div>` : ''}
      <dl class="kv">
        <dt>时间</dt><dd>${esc(fmtSpan(e.startTime, e.endTime))}</dd>
        <dt>状态</dt><dd>${e.status === 'CANCELLED' ? badge('已取消', 'idle') : ended(e) ? badge('已结束', 'idle')
          : toDate(e.startTime) <= now() ? badge('进行中', 'ok') : badge('未开始', 'info')}</dd>
        <dt>发起人</dt><dd>${esc(e.ownerName)}</dd>
        ${e.groupName ? `<dt>组</dt><dd>${esc(e.groupName)}</dd>` : ''}
        ${e.location ? `<dt>地点</dt><dd>${esc(e.location)}</dd>` : ''}
        ${e.description ? `<dt>说明</dt><dd>${esc(e.description)}</dd>` : ''}
      </dl>
      <h3 class="section-title">参与人(${d.participants.length})</h3>
      ${d.participants.length ? `<ul class="people">${d.participants.map((p) => `<li>
          ${avatar(p.displayName, '', p.userId)}<span class="name">${esc(p.displayName)} <span class="muted">@${esc(p.username)}</span>
          ${p.invitedBy == null ? badge('发起人', 'info') : ''}${p.userId === ME.userId ? badge('我', 'idle') : ''}</span>
          ${inviteBadge(p.status)}</li>`).join('')}</ul>` : '<p class="muted">还没有参与人</p>'}
      <h3 class="section-title">留言 <span class="muted" data-cm-count></span></h3>
      <ul class="comments" data-cm-list><li class="muted">正在加载…</li></ul>
      ${canComment(e) ? `<div class="cm-form">
          <div class="cm-replying" data-cm-replying hidden></div>
          <textarea data-cm-input maxlength="500" rows="2" placeholder="说点什么,比如:我会晚到 10 分钟(Ctrl+Enter 发送)"></textarea>
          <div class="cm-form-foot"><span class="muted" data-cm-left>0 / 500</span>
            <button type="button" class="primary small" data-cm-send>发送</button></div>
        </div>`
        : `<p class="muted cm-closed">${e.status === 'CANCELLED' ? '行程已取消,留言只能查看。' : '只有发起人和参与这个行程的人可以留言。'}</p>`}`,
  });
  if (editable) {
    $('[data-edit-event]', dlg).onclick = () => { dlg.dismiss(); openEditForm(eventId); };
    $('[data-invite-event]', dlg).onclick = () => { dlg.dismiss(); openInviteForm(eventId); };
  }
  bindComments(dlg, e, focusCommentId);
}

/* ---------- 留言 ---------- */

/* 发起人和未拒绝的参与人可以留言;已取消的行程只能看 */
const canComment = (e) => e.status !== 'CANCELLED' && (isOwner(e) || (!!e.myStatus && e.myStatus !== 'DECLINED'));

/* 留言时间:刚刚 / 5 分钟前 / 今天 14:05 / 10月2日 14:05 */
function fmtWhen(v) {
  const d = toDate(v), m = Math.floor((Date.now() - d) / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const day = d.toDateString() === new Date().toDateString() ? '今天' : `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${day} ${fmtTime(v)}`;
}

/*
 * 一条留言(或回复)。除管理员外只能删除自己的;能留言的人可以回复别人的留言(不能回复自己的)。
 * 已删除(deletedAt)的顶层留言只显示"该留言已删除",下面别人的回复照常显示。
 * replies:顶层留言下面的回复列表(回复本身不再嵌套)。
 */
function commentHtml(c, e, replies = []) {
  const sub = replies.length ? `<ul class="replies">${replies.map((r) => commentHtml(r, e)).join('')}</ul>` : '';
  if (c.deletedAt) {
    return `<li class="comment is-deleted" data-comment="${c.commentId}">
      <span class="avatar deleted" aria-hidden="true">?</span>
      <div class="cm-body">
        <div class="cm-head"><span class="muted">该留言已删除</span>
          ${isAdmin() ? `<span class="cm-acts"><button type="button" class="link cm-del" data-del-comment="${c.commentId}">删除</button></span>` : ''}</div>
        ${sub}
      </div>
    </li>`;
  }
  const canDel = c.userId === ME.userId || isAdmin();
  const replyTo = c.parentId && c.replyToName ? `<span class="cm-to">回复 <strong>@${esc(c.replyToName)}</strong></span>` : '';
  return `<li class="comment ${c.userId === ME.userId ? 'mine' : ''} ${c.parentId ? 'is-reply' : ''}" data-comment="${c.commentId}">
    ${avatar(c.displayName, c.parentId ? 'sm' : '', c.userId)}
    <div class="cm-body">
      <div class="cm-head"><strong>${esc(c.displayName)}</strong>
        ${c.userId === e.ownerId ? badge('发起人', 'info') : ''}${c.userId === ME.userId ? badge('我', 'idle') : ''}
        ${replyTo}
        <span class="muted">${esc(fmtWhen(c.createdAt))}</span>
        ${c.editedAt ? `<span class="cm-edited" title="编辑于 ${esc(fmtWhen(c.editedAt))}">(已编辑)</span>` : ''}
        <span class="cm-acts">
          ${canComment(e) && c.userId !== ME.userId ? `<button type="button" class="link cm-reply" data-reply="${c.commentId}">回复</button>` : ''}
          ${canComment(e) && c.userId === ME.userId ? `<button type="button" class="link cm-edit" data-edit-comment="${c.commentId}">编辑</button>` : ''}
          ${canDel ? `<button type="button" class="link cm-del" data-del-comment="${c.commentId}">删除</button>` : ''}
        </span></div>
      <div class="cm-text">${esc(c.content)}</div>
      ${sub}
    </div>
  </li>`;
}

/* 详情对话框里的留言:加载、发送(Ctrl+Enter)、回复、删除 */
function bindComments(dlg, e, focusCommentId) {
  const list = $('[data-cm-list]', dlg), input = $('[data-cm-input]', dlg);
  let items = [];
  let replyTo = null; // 正在回复的留言 {commentId, displayName}
  const setReplyTo = (c) => {
    replyTo = c;
    const box = $('[data-cm-replying]', dlg);
    if (!box) return;
    box.hidden = !c;
    box.innerHTML = c ? `回复 <strong>@${esc(c.displayName)}</strong>:<span class="muted">${esc(c.content.slice(0, 30))}${c.content.length > 30 ? '…' : ''}</span>
      <button type="button" class="link" data-cancel-reply aria-label="取消回复">取消</button>` : '';
    input.placeholder = c ? `回复 ${c.displayName}(Ctrl+Enter 发送)` : '说点什么,比如:我会晚到 10 分钟(Ctrl+Enter 发送)';
  };
  const load = async (scrollTo) => {
    try { items = await api('GET', `/events/${e.eventId}/comments`); } catch (err) {
      list.innerHTML = `<li class="muted">${esc(err.message)}</li>`;
      return;
    }
    if (!dlg.isConnected) return;
    // 按顶层留言分组,回复按时间排在下面
    const replies = new Map();
    for (const c of items) {
      if (c.parentId) {
        if (!replies.has(c.parentId)) replies.set(c.parentId, []);
        replies.get(c.parentId).push(c);
      }
    }
    const tops = items.filter((c) => !c.parentId);
    const shown = items.filter((c) => !c.deletedAt).length; // 已删除的占位不计数
    $('[data-cm-count]', dlg).textContent = shown ? `(${shown})` : '';
    list.innerHTML = tops.length ? tops.map((c) => commentHtml(c, e, replies.get(c.commentId) || [])).join('')
      : '<li class="muted cm-empty">还没有留言</li>';
    const target = scrollTo && $(`[data-comment="${Number(scrollTo)}"]`, list);
    if (target) {
      target.scrollIntoView({ block: 'nearest' });
      target.classList.add('flash');
    }
  };
  /* 原地编辑自己的留言:把内容换成输入框,保存后重新加载 */
  const startEdit = (li, c) => {
    const text = $(':scope > .cm-body > .cm-text', li);
    if (!text || $(':scope > .cm-body > .cm-editor', li)) return; // 已经在编辑
    const box = document.createElement('div');
    box.className = 'cm-editor';
    box.innerHTML = `<textarea maxlength="500" rows="2" aria-label="编辑留言"></textarea>
      <div class="cm-form-foot"><span class="muted">Ctrl+Enter 保存,Esc 取消</span>
        <span><button type="button" class="small" data-edit-cancel>取消</button>
        <button type="button" class="small primary" data-edit-save>保存</button></span></div>`;
    const ta = $('textarea', box);
    ta.value = c.content; // 用 value 赋值,不经过 HTML
    text.hidden = true;
    text.after(box);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    const close = () => { box.remove(); text.hidden = false; };
    const save = async () => {
      const content = ta.value.trim();
      if (!content) return toast('留言内容不能为空');
      if (content === c.content) return close();
      $('[data-edit-save]', box).disabled = true;
      try {
        await api('PUT', `/events/${e.eventId}/comments/${c.commentId}`, { content });
        toast('留言已修改');
        await load(c.commentId);
      } catch (err) {
        toast(err.message);
        $('[data-edit-save]', box).disabled = false;
      }
    };
    $('[data-edit-cancel]', box).onclick = close;
    $('[data-edit-save]', box).onclick = save;
    ta.onkeydown = (ev) => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); save(); }
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); } // 只取消编辑,不关闭对话框
    };
  };
  list.onclick = async (ev) => {
    const eb = ev.target.closest('[data-edit-comment]');
    if (eb) {
      const c = items.find((x) => x.commentId === Number(eb.dataset.editComment));
      if (c) startEdit(eb.closest('.comment'), c);
      return;
    }
    const rb = ev.target.closest('[data-reply]');
    if (rb && input) {
      const c = items.find((x) => x.commentId === Number(rb.dataset.reply));
      if (c) { setReplyTo(c); input.focus(); }
      return;
    }
    const b = ev.target.closest('[data-del-comment]');
    if (!b) return;
    const id = Number(b.dataset.delComment);
    // 提示删除后会怎样:和后端规则一致(别人的回复只有管理员能一起删)
    const replies = items.filter((x) => x.parentId === id);
    const others = replies.filter((x) => x.userId !== ME.userId).length;
    const msg = !replies.length ? '确定删除这条留言吗?'
      : isAdmin() ? `确定删除这条留言吗?它下面的 ${replies.length} 条回复也会一起删除。`
        : others ? '确定删除这条留言吗?下面有别人的回复,删除后这里会显示"该留言已删除",别人的回复会保留。'
          : `确定删除这条留言吗?你在下面的 ${replies.length} 条回复也会一起删除。`;
    if (!await confirmBox('删除留言', msg, '删除', true)) return;
    try {
      await api('DELETE', `/events/${e.eventId}/comments/${id}`);
      toast('留言已删除');
      if (replyTo && (replyTo.commentId === id || replyTo.parentId === id)) setReplyTo(null);
    } catch (err) { toast(err.message); }
    await load();
    refresh(); // 更新卡片上的留言数
  };
  if (input) {
    $('[data-cm-replying]', dlg).onclick = (ev) => { if (ev.target.closest('[data-cancel-reply]')) setReplyTo(null); };
    const send = async () => {
      const content = input.value.trim();
      if (!content) return toast('请输入留言内容');
      const btn = $('[data-cm-send]', dlg);
      btn.disabled = true;
      try {
        const c = await api('POST', `/events/${e.eventId}/comments`, { content, parentId: replyTo ? replyTo.commentId : null });
        input.value = '';
        $('[data-cm-left]', dlg).textContent = '0 / 500';
        setReplyTo(null);
        await load(c.commentId);
        refresh();
      } catch (err) {
        toast(err.message);
      } finally {
        btn.disabled = false;
      }
    };
    $('[data-cm-send]', dlg).onclick = send;
    input.oninput = () => { $('[data-cm-left]', dlg).textContent = `${input.value.length} / 500`; };
    input.onkeydown = (ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); send(); } };
  }
  load(focusCommentId);
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
          ${avatar(m.displayName, '', m.userId)}<span class="name">${esc(m.displayName)} <span class="muted">@${esc(m.username)}</span>${m.userId === ME.userId ? badge('我', 'idle') : ''}</span>
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
      ${list.map((u) => `<tr><td>${esc(u.username)}</td><td><span class="user-cell">${avatar(u.displayName, 'xs', u.userId)}${esc(u.displayName)}</span></td>
        <td>${u.email ? esc(u.email) : '<span class="muted">未填写</span>'}</td>
        <td>${badge(u.roleLabel, u.role === 'ADMIN' ? 'info' : 'idle')}</td>
        <td>${u.mustChangePassword ? badge('已重置,待用户修改', 'warn') : '<span class="muted">正常</span>'}</td>
        <td style="text-align:right">${u.userId === ME.userId ? '<span class="muted">当前账号</span>'
          : `${AVATARS.has(u.userId) ? `<button class="small" onclick="removeUserAvatar(${u.userId})">移除头像</button> ` : ''}<button class="small danger" onclick="resetPassword(${u.userId})">重置密码</button>`}</td>
        </tr>`).join('')}</tbody></table>`
      : '<div class="empty">没有匹配的用户</div>';
  } catch (e) {
    box.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

let ALL_USERS = []; // 用户管理表格当前显示的用户

/* 管理员移除别人的头像(比如头像不合适) */
async function removeUserAvatar(userId) {
  const u = ALL_USERS.find((x) => x.userId === userId);
  if (!u || !await confirmBox('移除头像', `确定移除 ${u.displayName} 的头像吗?`, '移除', true)) return;
  try {
    await api('DELETE', `/admin/users/${userId}/avatar`);
    toast('头像已移除');
  } catch (e) {
    toast(e.message);
  }
  await refresh();
  loadUsersTable();
}

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
