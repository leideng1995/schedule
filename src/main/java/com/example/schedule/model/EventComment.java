package com.example.schedule.model;

import lombok.Data;

import java.time.LocalDateTime;

/** 行程留言 */
@Data
public class EventComment {
    private Long commentId;

    private Long eventId;

    private Long userId;

    /** 所属的顶层留言;顶层留言为 null */
    private Long parentId;

    /** 被回复的人;顶层留言为 null */
    private Long replyToUserId;

    private String content;

    private LocalDateTime createdAt;

    /** 留言人最后一次编辑的时间;没编辑过为 null */
    private LocalDateTime editedAt;

    /** 不为空表示已删除(下面还有别人的回复,所以只标记);此时 content 为 null */
    private LocalDateTime deletedAt;

    // ---- 查询时关联出来的字段 ----

    private String username;

    private String displayName;

    /** 被回复人的姓名 */
    private String replyToName;
}
