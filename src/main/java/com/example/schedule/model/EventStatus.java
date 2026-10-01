package com.example.schedule.model;

/** 行程状态 */
public enum EventStatus {
    ACTIVE,
    /** 发起人取消,不再参与冲突检测 */
    CANCELLED
}
