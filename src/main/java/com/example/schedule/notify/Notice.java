package com.example.schedule.notify;

import java.util.List;

/**
 * 需要发邮件通知的业务事件。service 在事务里发布,MailNotifier 在事务提交后异步发送;
 * 事务回滚(比如时间冲突、校验失败)就不会发。只带 ID,发送时再从数据库读最新数据。
 */
public sealed interface Notice {

    /** 被邀请参加行程(单独邀请、组内邀约、追加邀请、拒绝后重新邀请) */
    record EventInvited(long eventId, long inviterId, List<Long> userIds) implements Notice {
    }

    /** 被邀请人同意或拒绝(含已同意后改为"不参加了"),通知发起人 */
    record EventResponded(long eventId, long userId, boolean accept) implements Notice {
    }

    /** 发起人取消行程,通知已同意和待确认的参与人 */
    record EventCancelled(long eventId) implements Notice {
    }

    /** 被加入组:direct=true 为管理员组直接加入,false 为普通用户组的入组邀请 */
    record GroupInvited(long groupId, List<Long> userIds, boolean direct) implements Notice {
    }

    /** 同意或拒绝入组邀请,通知组的创建者 */
    record GroupResponded(long groupId, long userId, boolean accept) implements Notice {
    }
}
