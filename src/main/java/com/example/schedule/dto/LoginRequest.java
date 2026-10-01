package com.example.schedule.dto;

/** 登录;username 可以是用户名,也可以是邮箱(含 @ 的按邮箱查) */
public record LoginRequest(String username, String password) {
}
