package com.example.schedule.model;

/** 站内通知的类型 */
public enum NotificationType {
    EVENT_INVITED,
    EVENT_RESPONDED,
    EVENT_UPDATED,
    EVENT_CANCELLED,
    /** 活动开始前 5 分钟的提醒,页面会弹窗 */
    EVENT_REMINDER,
    GROUP_INVITED,
    /** 被管理员直接加入组 */
    GROUP_ADDED,
    GROUP_RESPONDED,
    /** 别人在我参与的行程里留言 */
    COMMENT,
    /** 别人回复了我的留言 */
    COMMENT_REPLY
}
