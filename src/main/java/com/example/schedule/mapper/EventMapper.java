package com.example.schedule.mapper;

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
