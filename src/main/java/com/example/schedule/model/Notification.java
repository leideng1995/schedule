package com.example.schedule.model;

import lombok.Data;

import java.time.LocalDateTime;

/** 站内通知 */
@Data
public class Notification {
    private Long notificationId;

    /** 收件人 */
    private Long userId;

    private NotificationType type;

    /** 纯文本,前端显示时转义 */
    private String title;

    private String content;

    /** 触发这条通知的人(邀请人、留言人等);系统提醒为 null */
    private Long actorId;

    private Long eventId;

    private Long groupId;

    private Long commentId;

    private LocalDateTime readAt;

    private LocalDateTime createdAt;

    // ---- 查询时关联出来的字段 ----

    private String actorName;
}
