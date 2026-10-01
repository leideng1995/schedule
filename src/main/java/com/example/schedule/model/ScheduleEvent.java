package com.example.schedule.model;

import lombok.Data;

import java.time.LocalDateTime;

/** 行程 */
@Data
public class ScheduleEvent {
    private Long eventId;

    private String title;

    private String location;

    private String description;

    private LocalDateTime startTime;

    private LocalDateTime endTime;

    /** 发起人 */
    private Long ownerId;

    /** 组内邀约时为组 ID,否则为 null */
    private Long groupId;

    private EventStatus status;

    private LocalDateTime createdAt;

    // ---- 以下为查询时关联出来的字段 ----

    private String ownerName;

    private String groupName;

    /** 当前用户的参与状态;管理员发起的行程,管理员本人不是参与人,此时为 null */
    private InviteStatus myStatus;

    private int acceptedCount;

    private int pendingCount;

    /** 留言条数 */
    private int commentCount;
}
