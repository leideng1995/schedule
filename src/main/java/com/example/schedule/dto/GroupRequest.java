package com.example.schedule.dto;

import java.util.List;

/** 新建组 */
public record GroupRequest(String name, List<Long> memberIds) {
}
