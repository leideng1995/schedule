package com.example.schedule.model;

import lombok.Data;

import java.time.LocalDateTime;

/** 一条时间冲突:某个用户在这个时间段已经有另一个(已同意的)行程 */
@Data
public class Conflict {
    private Long userId;

    private String displayName;

    private Long eventId;

    private String title;

    private LocalDateTime startTime;

    private LocalDateTime endTime;
}
