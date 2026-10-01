package com.example.schedule.model;

import lombok.Data;

import java.time.LocalDateTime;

/** 组成员 */
@Data
public class GroupMember {
    private Long groupId;

    private Long userId;

    private InviteStatus status;

    private LocalDateTime invitedAt;

    private LocalDateTime respondedAt;

    private String username;

    private String displayName;
}
