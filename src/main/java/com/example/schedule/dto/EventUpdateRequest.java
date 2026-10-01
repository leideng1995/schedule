package com.example.schedule.dto;

import java.time.LocalDateTime;

/** 修改行程(只有发起人可以)。改了时间时会重新检查冲突,force=true 表示已看过冲突提示,仍然修改 */
public record EventUpdateRequest(String title, String location, String description,
                                 LocalDateTime startTime, LocalDateTime endTime, Boolean force) {
}
