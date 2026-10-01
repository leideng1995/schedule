package com.example.schedule.model;

import lombok.Data;

import java.time.LocalDateTime;

/** 用户。含密码哈希,不直接返回给前端,返回时用 UserView */
@Data
public class SysUser {
    private Long userId;

    /** 用户名统一存小写 */
    private String username;

    private String passwordHash;

    private String displayName;

    /** 邮箱,统一存小写,可用于登录;早期注册的用户可能为空 */
    private String email;

    private Role role;

    /** 管理员重置过密码:登录后必须先修改密码,改完之前只能访问 /api/auth/** */
    private boolean mustChangePassword;

    private LocalDateTime createdAt;

    public boolean isAdmin() {
        return role == Role.ADMIN;
    }
}
