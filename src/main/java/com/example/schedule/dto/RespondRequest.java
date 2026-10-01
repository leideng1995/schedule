package com.example.schedule.dto;

/** 回复邀请:accept=true 同意,false 拒绝;同意时 force=true 表示忽略冲突提示 */
public record RespondRequest(Boolean accept, Boolean force) {
}
