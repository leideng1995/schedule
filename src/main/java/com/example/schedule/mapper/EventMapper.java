package com.example.schedule.mapper;

import com.example.schedule.model.BusySlot;
import com.example.schedule.model.Conflict;
import com.example.schedule.model.EventParticipant;
import com.example.schedule.model.EventStatus;
import com.example.schedule.model.InviteStatus;
import com.example.schedule.model.ScheduleEvent;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

/** 行程 schedule_event 和参与人 event_participant */
@Mapper
public interface EventMapper {

    int insert(ScheduleEvent event);

    /** 带发起人姓名、组名和参与人数 */
    ScheduleEvent findById(@Param("id") long id);

    /** 某用户发起的或被邀请的行程,myStatus 为他的参与状态 */
    List<ScheduleEvent> findForUser(@Param("userId") long userId);

    int updateStatus(@Param("id") long id, @Param("status") EventStatus status);

    /** 修改标题、地点、说明、开始和结束时间 */
    int update(ScheduleEvent event);

    /** 改时间后,除发起人外已同意的参与人改回"待确认",需要重新确认 */
    int resetAccepted(@Param("eventId") long eventId, @Param("ownerId") long ownerId);

    /**
     * 这些普通用户在 [start, end) 内的忙碌时段(已同意、未取消的行程),只含时间。
     * excludeEventId 为当前正在编辑 / 邀请的行程,可为 null。
     */
    List<BusySlot> findBusy(@Param("userIds") Collection<Long> userIds,
                            @Param("start") LocalDateTime start,
                            @Param("end") LocalDateTime end,
                            @Param("excludeEventId") Long excludeEventId);

    /**
     * 时间冲突:这些用户在 [start, end) 内已同意参加的、未取消的其他行程。
     * 首尾相接(一个 10:00 结束、另一个 10:00 开始)不算冲突。excludeEventId 为当前行程,可为 null。
     */
    List<Conflict> findConflicts(@Param("userIds") Collection<Long> userIds,
                                 @Param("start") LocalDateTime start,
                                 @Param("end") LocalDateTime end,
                                 @Param("excludeEventId") Long excludeEventId);

    List<EventParticipant> findParticipants(@Param("eventId") long eventId);

    EventParticipant findParticipant(@Param("eventId") long eventId, @Param("userId") long userId);

    /** 新增参与人或重新邀请(已存在时重置为 status) */
    int upsertParticipant(@Param("eventId") long eventId, @Param("userId") long userId,
                          @Param("status") InviteStatus status, @Param("invitedBy") Long invitedBy);

    int updateParticipantStatus(@Param("eventId") long eventId, @Param("userId") long userId,
                                @Param("status") InviteStatus status);
}
