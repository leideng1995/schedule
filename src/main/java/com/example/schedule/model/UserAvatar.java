package com.example.schedule.model;

import lombok.Data;

import java.time.LocalDateTime;

/** 用户头像(256x256 PNG);只查版本时 image 为 null */
@Data
public class UserAvatar {
    private Long userId;

    private byte[] image;

    /** 更新时间,同时作为图片地址里的版本号,换头像后浏览器不会用旧缓存 */
    private LocalDateTime updatedAt;
}
