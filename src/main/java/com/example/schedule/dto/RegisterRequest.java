package com.example.schedule.dto;

import com.example.schedule.model.Role;

/** 注册普通用户;管理员新建用户时可指定 role(为空则为普通用户) */
public record RegisterRequest(String username, String password, String displayName, String email, Role role) {
}
