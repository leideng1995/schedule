package com.example.schedule.model;

/** 用户角色 */
public enum Role {
    USER("普通用户"),
    ADMIN("管理员");

    private final String label;

    Role(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
