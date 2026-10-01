package com.example.schedule.dto;

/** 修改自己的个人信息(姓名、邮箱) */
public record ProfileRequest(String displayName, String email) {
}
