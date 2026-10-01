package com.example.schedule.model;

import lombok.Data;

import java.time.LocalDateTime;

/** 忙碌时段:某个用户在这段时间有已同意的行程。只给出时间,不含行程标题等内容 */
@Data
public class BusySlot {
    private Long userId;

    private LocalDateTime startTime;

    private LocalDateTime endTime;
}
