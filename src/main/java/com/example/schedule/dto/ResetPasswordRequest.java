package com.example.schedule.dto;

/** 用邮件里的一次性令牌设置新密码 */
public record ResetPasswordRequest(String token, String newPassword) {
}
