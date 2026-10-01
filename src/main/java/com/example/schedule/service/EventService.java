package com.example.schedule.service;

import com.example.schedule.common.Biz;
import com.example.schedule.common.ConflictException;
import com.example.schedule.dto.EventDetail;
import com.example.schedule.dto.EventRequest;
import com.example.schedule.dto.EventUpdateRequest;
import com.example.schedule.dto.InviteRequest;
import com.example.schedule.mapper.EventMapper;
import com.example.schedule.model.BusySlot;
import com.example.schedule.model.Conflict;
import com.example.schedule.model.EventParticipant;
import com.example.schedule.model.EventStatus;
import com.example.schedule.model.InviteStatus;
import com.example.schedule.model.ScheduleEvent;
import com.example.schedule.model.SysUser;
import com.example.schedule.notify.Notice;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 行程预约和邀请。
 * <ul>
 *   <li>普通用户:预约自己的行程(本人自动为"已同意"的参与人),可以邀请其他普通用户,也可以对自己建的组发起组内邀约</li>
 *   <li>管理员:只能对自己建的组发起组内邀约,本人不作为参与人</li>
 *   <li>被邀请人先是"待确认",同意后才占用时间</li>
 * </ul>
 * 冲突检测:会让某人在同一时间段有两个"已同意"的行程时(预约、邀请、同意邀请、修改时间),返回 409 和冲突明细;
 * 前端提示后用户可以选择仍然继续(force=true)。冲突只提示,不强制禁止。
 */
@Service
@RequiredArgsConstructor
public class EventService {

    private static final Logger log = LoggerFactory.getLogger(EventService.class);

    private final EventMapper eventMapper;
    private final UserService userService;
    private final GroupService groupService;
    private final ApplicationEventPublisher events;

    public List<ScheduleEvent> listMine(SysUser me) {
        return eventMapper.findForUser(me.getUserId());
    }

    /** 发起人、参与人和管理员可以查看 */
    public EventDetail detail(SysUser me, long eventId) {
        ScheduleEvent e = load(eventId);
        List<EventParticipant> ps = eventMapper.findParticipants(eventId);
        EventParticipant mine = ps.stream().filter(p -> p.getUserId().equals(me.getUserId())).findFirst().orElse(null);
        if (!isOwner(e, me) && mine == null && !me.isAdmin()) {
            throw Biz.notFound("行程不存在");
        }
        e.setMyStatus(mine == null ? null : mine.getStatus());
        return new EventDetail(e, ps);
    }

    @Transactional
    public EventDetail create(SysUser me, EventRequest r) {
        ScheduleEvent e = new ScheduleEvent();
        e.setTitle(Biz.required(r.title(), "标题", 100));
        e.setLocation(Biz.optional(r.location(), "地点", 200));
        e.setDescription(Biz.optional(r.description(), "说明", 1000));
        checkTime(r.startTime(), r.endTime());
        e.setStartTime(r.startTime());
        e.setEndTime(r.endTime());
        e.setOwnerId(me.getUserId());
        e.setGroupId(r.groupId());

        Set<Long> invitees = resolveInvitees(me, r.inviteeIds(), r.groupId());
        if (me.isAdmin() && invitees.isEmpty()) {
            throw Biz.bad("管理员需要选择一个组进行组内邀约");
        }
        List<Long> attendees = new ArrayList<>();
        if (!me.isAdmin()) {
            attendees.add(me.getUserId()); // 普通用户自己也要参加,一起查冲突
        }
        attendees.addAll(invitees);
        checkConflicts(attendees, e.getStartTime(), e.getEndTime(), null, r.force());

        eventMapper.insert(e);
        if (!me.isAdmin()) {
            eventMapper.upsertParticipant(e.getEventId(), me.getUserId(), InviteStatus.ACCEPTED, null);
        }
        for (Long id : invitees) {
            eventMapper.upsertParticipant(e.getEventId(), id, InviteStatus.PENDING, me.getUserId());
        }
        if (!invitees.isEmpty()) {
            events.publishEvent(new Notice.EventInvited(e.getEventId(), me.getUserId(), List.copyOf(invitees)));
        }
        log.info("{} 预约行程 {}({} ~ {}),邀请 {}{}", me.getUsername(), e.getEventId(),
                e.getStartTime(), e.getEndTime(), invitees, Boolean.TRUE.equals(r.force()) ? ",已忽略冲突提示" : "");
        return detail(me, e.getEventId());
    }

    /** 给已有行程追加邀请,只有发起人可以 */
    @Transactional
    public EventDetail invite(SysUser me, long eventId, InviteRequest r) {
        ScheduleEvent e = requireEditable(me, eventId);
        Set<Long> ids = resolveInvitees(me, r.userIds(), r.groupId());
        ids.remove(e.getOwnerId());
        // 已同意或待确认的不重复邀请;拒绝过的可以重新邀请
        ids.removeIf(id -> {
            EventParticipant p = eventMapper.findParticipant(eventId, id);
            return p != null && p.getStatus() != InviteStatus.DECLINED;
        });
        if (ids.isEmpty()) {
            throw Biz.bad("所选用户都已在邀请名单中");
        }
        checkConflicts(ids, e.getStartTime(), e.getEndTime(), eventId, r.force());
        for (Long id : ids) {
            eventMapper.upsertParticipant(eventId, id, InviteStatus.PENDING, me.getUserId());
        }
        events.publishEvent(new Notice.EventInvited(eventId, me.getUserId(), List.copyOf(ids)));
        log.info("{} 给行程 {} 追加邀请 {}", me.getUsername(), eventId, ids);
        return detail(me, eventId);
    }

    /** 被邀请人同意或拒绝;同意前检查自己的时间冲突。已同意的也可以改为拒绝(退出) */
    @Transactional
    public EventDetail respond(SysUser me, long eventId, boolean accept, Boolean force) {
        ScheduleEvent e = load(eventId);
        EventParticipant p = eventMapper.findParticipant(eventId, me.getUserId());
        if (p == null) {
            throw Biz.notFound("你没有被邀请参加这个行程");
        }
        if (isOwner(e, me)) {
            throw Biz.bad("你是发起人,不需要回复;不想要这个行程请直接取消");
        }
        requireOpen(e);
        if (accept) {
            checkConflicts(List.of(me.getUserId()), e.getStartTime(), e.getEndTime(), eventId, force);
        }
        InviteStatus status = accept ? InviteStatus.ACCEPTED : InviteStatus.DECLINED;
        eventMapper.updateParticipantStatus(eventId, me.getUserId(), status);
        if (p.getStatus() != status) { // 重复点同一个回复不再通知发起人
            events.publishEvent(new Notice.EventResponded(eventId, me.getUserId(), accept));
        }
        log.info("{} {}行程 {}", me.getUsername(), accept ? "同意" : "拒绝", eventId);
        return detail(me, eventId);
    }

    @Transactional
    public EventDetail cancel(SysUser me, long eventId) {
        requireEditable(me, eventId);
        eventMapper.updateStatus(eventId, EventStatus.CANCELLED);
        events.publishEvent(new Notice.EventCancelled(eventId));
        log.info("{} 取消行程 {}", me.getUsername(), eventId);
        return detail(me, eventId);
    }

    /**
     * 修改行程,只有发起人可以,已取消或已结束的不能改。
     * 只改标题、地点、说明:参与人状态不变。
     * 改了时间:对发起人和所有未拒绝的参与人重新检查冲突(409,可 force);
     * 除发起人外已同意的参与人改回"待确认",需要重新确认。两种情况都会邮件通知未拒绝的参与人。
     */
    @Transactional
    public EventDetail update(SysUser me, long eventId, EventUpdateRequest r) {
        ScheduleEvent old = requireEditable(me, eventId);
        ScheduleEvent e = new ScheduleEvent();
        e.setEventId(eventId);
        e.setTitle(Biz.required(r.title(), "标题", 100));
        e.setLocation(Biz.optional(r.location(), "地点", 200));
        e.setDescription(Biz.optional(r.description(), "说明", 1000));
        e.setStartTime(r.startTime());
        e.setEndTime(r.endTime());
        if (e.getStartTime() == null || e.getEndTime() == null) {
            throw Biz.bad("请填写开始和结束时间");
        }
        boolean timeChanged = !e.getStartTime().equals(old.getStartTime()) || !e.getEndTime().equals(old.getEndTime());
        boolean textChanged = !Objects.equals(e.getTitle(), old.getTitle())
                || !Objects.equals(e.getLocation(), old.getLocation())
                || !Objects.equals(e.getDescription(), old.getDescription());
        if (!timeChanged && !textChanged) {
            return detail(me, eventId); // 没有改动,不更新也不通知
        }
        if (timeChanged) {
            if (!e.getEndTime().isAfter(e.getStartTime())) {
                throw Biz.bad("结束时间必须晚于开始时间");
            }
            // 进行中的行程可以只延长结束时间;改开始时间时不能改到过去
            if (!e.getStartTime().equals(old.getStartTime()) && e.getStartTime().isBefore(LocalDateTime.now().minusMinutes(1))) {
                throw Biz.bad("不能把开始时间改到已经过去的时间");
            }
            if (!e.getEndTime().isAfter(LocalDateTime.now())) {
                throw Biz.bad("结束时间不能早于现在");
            }
            List<Long> attendees = eventMapper.findParticipants(eventId).stream()
                    .filter(p -> p.getStatus() != InviteStatus.DECLINED).map(EventParticipant::getUserId).toList();
            checkConflicts(attendees, e.getStartTime(), e.getEndTime(), eventId, r.force());
        }
        eventMapper.update(e);
        int reset = timeChanged ? eventMapper.resetAccepted(eventId, old.getOwnerId()) : 0;
        events.publishEvent(new Notice.EventUpdated(eventId, old, timeChanged));
        log.info("{} 修改行程 {}{}", me.getUsername(), eventId,
                timeChanged ? ",时间 " + old.getStartTime() + " ~ " + old.getEndTime() + " 改为 "
                        + e.getStartTime() + " ~ " + e.getEndTime() + "," + reset + " 人需重新确认" : "");
        return detail(me, eventId);
    }

    /** 忙闲查询最多查多少人、多长时间范围,防止被用来批量查看别人的日程 */
    private static final int AVAILABILITY_MAX_USERS = 200;
    private static final Duration AVAILABILITY_MAX_SPAN = Duration.ofDays(31);

    /**
     * 邀请前查看是否有空:返回这些普通用户在该时间段内的忙碌时段(只有时间,没有行程内容)。
     * excludeEventId:编辑或追加邀请时排除当前行程本身。
     */
    public List<BusySlot> availability(LocalDateTime start, LocalDateTime end, Collection<Long> userIds, Long excludeEventId) {
        if (start == null || end == null || !end.isAfter(start)) {
            throw Biz.bad("请提供正确的开始和结束时间");
        }
        if (Duration.between(start, end).compareTo(AVAILABILITY_MAX_SPAN) > 0) {
            throw Biz.bad("一次最多查询 31 天");
        }
        Set<Long> ids = userIds == null ? Set.of()
                : userIds.stream().filter(Objects::nonNull).collect(Collectors.toCollection(LinkedHashSet::new));
        if (ids.isEmpty()) {
            return List.of();
        }
        if (ids.size() > AVAILABILITY_MAX_USERS) {
            throw Biz.bad("一次最多查询 " + AVAILABILITY_MAX_USERS + " 人");
        }
        return eventMapper.findBusy(ids, start, end, excludeEventId);
    }

    /**
     * 合并单独邀请的用户和组内邀约的成员。
     * 管理员只能按组邀约;普通用户单独邀请的必须是普通用户;组内邀约只有组的创建者能发起。
     */
    private Set<Long> resolveInvitees(SysUser me, Collection<Long> userIds, Long groupId) {
        Set<Long> result = new LinkedHashSet<>();
        if (userIds != null && !userIds.isEmpty()) {
            if (me.isAdmin()) {
                throw Biz.bad("管理员只能按组邀约");
            }
            result.addAll(userService.requireNormalUsers(userIds, me));
        }
        if (groupId != null) {
            result.addAll(groupService.invitees(me, groupId));
        }
        result.remove(me.getUserId());
        return result;
    }

    private void checkConflicts(Collection<Long> userIds, LocalDateTime start, LocalDateTime end,
                                Long excludeEventId, Boolean force) {
        if (userIds.isEmpty() || Boolean.TRUE.equals(force)) {
            return;
        }
        List<Conflict> conflicts = eventMapper.findConflicts(userIds, start, end, excludeEventId);
        if (!conflicts.isEmpty()) {
            throw new ConflictException("以下用户在该时间段已有行程", conflicts);
        }
    }

    private static void checkTime(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) {
            throw Biz.bad("请填写开始和结束时间");
        }
        if (!end.isAfter(start)) {
            throw Biz.bad("结束时间必须晚于开始时间");
        }
        if (start.isBefore(LocalDateTime.now().minusMinutes(1))) {
            throw Biz.bad("不能预约已经过去的时间");
        }
    }

    /** 发起人才能修改;已取消或已结束的不能再改 */
    private ScheduleEvent requireEditable(SysUser me, long eventId) {
        ScheduleEvent e = load(eventId);
        if (!isOwner(e, me)) {
            throw Biz.forbidden("只有发起人可以执行此操作");
        }
        requireOpen(e);
        return e;
    }

    private static void requireOpen(ScheduleEvent e) {
        if (e.getStatus() == EventStatus.CANCELLED) {
            throw Biz.bad("行程已取消");
        }
        if (e.getEndTime().isBefore(LocalDateTime.now())) {
            throw Biz.bad("行程已结束");
        }
    }

    private ScheduleEvent load(long eventId) {
        ScheduleEvent e = eventMapper.findById(eventId);
        if (e == null) {
            throw Biz.notFound("行程不存在");
        }
        return e;
    }

    private static boolean isOwner(ScheduleEvent e, SysUser me) {
        return e.getOwnerId().equals(me.getUserId());
    }
}
