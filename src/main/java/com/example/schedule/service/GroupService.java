package com.example.schedule.service;

import com.example.schedule.common.Biz;
import com.example.schedule.dto.GroupDetail;
import com.example.schedule.dto.GroupRequest;
import com.example.schedule.mapper.GroupMapper;
import com.example.schedule.model.GroupMember;
import com.example.schedule.model.InviteStatus;
import com.example.schedule.model.SysUser;
import com.example.schedule.model.UserGroup;
import com.example.schedule.notify.Notice;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Set;

/**
 * 组。
 * 管理员建的组:成员直接加入。普通用户建的组:成员先是"待同意",本人同意后才算加入。
 * 只有已加入的成员会收到组内邀约;只有组的创建者能管理成员、发起组内邀约。
 */
@Service
@RequiredArgsConstructor
public class GroupService {

    private static final Logger log = LoggerFactory.getLogger(GroupService.class);

    private final GroupMapper groupMapper;
    private final UserService userService;
    private final ApplicationEventPublisher events;

    public List<UserGroup> listMine(SysUser me) {
        return groupMapper.findForUser(me.getUserId());
    }

    /** 创建者、组成员(含待同意)和管理员可以查看 */
    public GroupDetail detail(SysUser me, long groupId) {
        UserGroup g = load(groupId);
        List<GroupMember> members = groupMapper.findMembers(groupId);
        GroupMember mine = members.stream().filter(m -> m.getUserId().equals(me.getUserId())).findFirst().orElse(null);
        if (!isOwner(g, me) && mine == null && !me.isAdmin()) {
            throw Biz.notFound("组不存在");
        }
        g.setMyStatus(mine == null ? null : mine.getStatus());
        return new GroupDetail(g, members);
    }

    @Transactional
    public GroupDetail create(SysUser me, GroupRequest r) {
        UserGroup g = new UserGroup();
        g.setName(Biz.required(r.name(), "组名", 100));
        g.setOwnerId(me.getUserId());
        g.setNeedConsent(!me.isAdmin());
        Set<Long> ids = userService.requireNormalUsers(r.memberIds(), me);
        groupMapper.insert(g);
        addMembers(g, ids);
        log.info("{} 创建组 {}({}),成员 {}", me.getUsername(), g.getName(), g.getGroupId(), ids);
        return detail(me, g.getGroupId());
    }

    @Transactional
    public GroupDetail addMembers(SysUser me, long groupId, Collection<Long> userIds) {
        UserGroup g = requireOwner(me, groupId);
        Set<Long> ids = userService.requireNormalUsers(userIds, me);
        if (ids.isEmpty()) {
            throw Biz.bad("请选择要添加的成员");
        }
        ids.removeIf(id -> {
            GroupMember m = groupMapper.findMember(groupId, id);
            // 已加入或已在等待回复的不重复邀请;拒绝过的可以重新邀请
            return m != null && m.getStatus() != InviteStatus.DECLINED;
        });
        if (ids.isEmpty()) {
            throw Biz.bad("所选用户都已在组内或正在等待回复");
        }
        addMembers(g, ids);
        log.info("{} 给组 {} 添加成员 {}", me.getUsername(), groupId, ids);
        return detail(me, groupId);
    }

    /** 创建者移除成员,或成员自己退出 */
    @Transactional
    public void removeMember(SysUser me, long groupId, long userId) {
        UserGroup g = load(groupId);
        if (!isOwner(g, me) && !me.getUserId().equals(userId)) {
            throw Biz.forbidden("只有组的创建者可以移除成员");
        }
        if (groupMapper.deleteMember(groupId, userId) == 0) {
            throw Biz.notFound("该用户不在组内");
        }
        log.info("{} 把用户 {} 移出组 {}", me.getUsername(), userId, groupId);
    }

    /** 被邀请加入普通用户的组:同意或拒绝 */
    @Transactional
    public GroupDetail respond(SysUser me, long groupId, boolean accept) {
        load(groupId);
        GroupMember m = groupMapper.findMember(groupId, me.getUserId());
        if (m == null) {
            throw Biz.notFound("你没有被邀请加入这个组");
        }
        InviteStatus status = accept ? InviteStatus.ACCEPTED : InviteStatus.DECLINED;
        groupMapper.updateMemberStatus(groupId, me.getUserId(), status);
        if (m.getStatus() != status) { // 重复点同一个回复不再通知创建者
            events.publishEvent(new Notice.GroupResponded(groupId, me.getUserId(), accept));
        }
        log.info("{} {}加入组 {}", me.getUsername(), accept ? "同意" : "拒绝", groupId);
        return detail(me, groupId);
    }

    @Transactional
    public void delete(SysUser me, long groupId) {
        requireOwner(me, groupId);
        // 组内邀约产生的行程保留,只是不再关联这个组(外键 ON DELETE SET NULL)
        groupMapper.delete(groupId);
        log.info("{} 删除组 {}", me.getUsername(), groupId);
    }

    /** 组内邀约的对象:组的已加入成员。只有创建者可以发起 */
    public List<Long> invitees(SysUser me, long groupId) {
        requireOwner(me, groupId);
        List<Long> ids = groupMapper.findAcceptedUserIds(groupId);
        if (ids.isEmpty()) {
            throw Biz.bad("组内还没有已加入的成员,无法进行组内邀约");
        }
        return ids;
    }

    private void addMembers(UserGroup g, Collection<Long> ids) {
        InviteStatus status = g.isNeedConsent() ? InviteStatus.PENDING : InviteStatus.ACCEPTED;
        for (Long id : ids) {
            groupMapper.upsertMember(g.getGroupId(), id, status);
        }
        if (!ids.isEmpty()) {
            events.publishEvent(new Notice.GroupInvited(g.getGroupId(), List.copyOf(ids), !g.isNeedConsent()));
        }
    }

    private UserGroup requireOwner(SysUser me, long groupId) {
        UserGroup g = load(groupId);
        if (!isOwner(g, me)) {
            throw Biz.forbidden("只有组的创建者可以执行此操作");
        }
        return g;
    }

    private UserGroup load(long groupId) {
        UserGroup g = groupMapper.findById(groupId);
        if (g == null) {
            throw Biz.notFound("组不存在");
        }
        return g;
    }

    private static boolean isOwner(UserGroup g, SysUser me) {
        return g.getOwnerId().equals(me.getUserId());
    }
}
