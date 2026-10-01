package com.example.schedule.model;

import lombok.Data;

import java.time.LocalDateTime;

/** 组 */
@Data
public class UserGroup {
    private Long groupId;

    private String name;

    private Long ownerId;

    /** false:管理员建的组,成员直接加入;true:普通用户建的组,成员同意后才算加入 */
    private boolean needConsent;

    private LocalDateTime createdAt;

    // ---- 以下为查询时关联出来的字段 ----

    private String ownerName;

    /** 当前用户在组里的状态;是创建者或不在组里时为 null */
    private InviteStatus myStatus;

    private int acceptedCount;

    private int pendingCount;
}
