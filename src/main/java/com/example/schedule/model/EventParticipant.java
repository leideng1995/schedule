package com.example.schedule.model;

import lombok.Data;

import java.time.LocalDateTime;

/** 行程参与人 */
@Data
public class EventParticipant {
    private Long eventId;

    private Long userId;

    private InviteStatus status;

    /** 邀请人;发起人自己的那条为 null */
    private Long invitedBy;

    private LocalDateTime invitedAt;

    private LocalDateTime respondedAt;

    private String username;

    private String displayName;
}
