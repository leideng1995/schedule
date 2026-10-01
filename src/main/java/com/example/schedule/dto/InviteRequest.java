package com.example.schedule.dto;

import java.util.List;

/** 给已有行程追加邀请:单独的用户和/或一个组 */
public record InviteRequest(List<Long> userIds, Long groupId, Boolean force) {
}
