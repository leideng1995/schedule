package com.example.schedule.dto;

import java.util.List;

/** 给组添加成员 */
public record MembersRequest(List<Long> userIds) {
}
