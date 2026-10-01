package com.example.schedule.model;

import lombok.Data;

import java.time.LocalDateTime;

/** 需要弹窗的"即将开始"提醒:未读的 EVENT_REMINDER 通知 + 行程信息 */
@Data
public class ReminderItem {
    private Long notificationId;

    private Long eventId;

    private String title;

    private String location;

    private LocalDateTime startTime;

    private LocalDateTime endTime;
}
