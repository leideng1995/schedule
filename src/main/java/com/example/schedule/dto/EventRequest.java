package com.example.schedule.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 新建行程。inviteeIds 为单独邀请的普通用户,groupId 为组内邀约的组(邀请组内已同意加入的成员)。
 * force=true 表示已看过冲突提示,仍然提交。
 */
public record EventRequest(String title, String location, String description,
                           LocalDateTime startTime, LocalDateTime endTime,
                           List<Long> inviteeIds, Long groupId, Boolean force) {
}
