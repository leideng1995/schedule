package com.example.schedule.dto;

/** 修改自己的密码 */
public record ChangePasswordRequest(String oldPassword, String newPassword) {
}
