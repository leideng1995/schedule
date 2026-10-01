package com.example.schedule.notify;

import com.example.schedule.mapper.CommentMapper;
import com.example.schedule.mapper.EventMapper;
import com.example.schedule.mapper.GroupMapper;
import com.example.schedule.mapper.NotificationMapper;
import com.example.schedule.mapper.SysUserMapper;
import com.example.schedule.model.EventComment;
import com.example.schedule.model.EventParticipant;
import com.example.schedule.model.InviteStatus;
import com.example.schedule.model.Notification;
import com.example.schedule.model.NotificationType;
import com.example.schedule.model.ScheduleEvent;
import com.example.schedule.model.SysUser;
import com.example.schedule.model.UserGroup;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

/**
 * 站内通知:和邮件通知(MailNotifier)处理同样的业务事件,事务提交后写进 notification 表,
 * 页面右上角的铃铛显示未读数。另外,别人在我参与的行程里留言也会通知(这个不发邮件)。
 * 写通知出错只记日志,不影响原来的操作。
 * 监听时原事务已提交,但连接还绑在原事务上,所以每次都开新事务(REQUIRES_NEW),否则写入不会被提交。
 */
@Component
@RequiredArgsConstructor
@Transactional(propagation = Propagation.REQUIRES_NEW)
public class InAppNotifier {

    private static final Logger log = LoggerFactory.getLogger(InAppNotifier.class);
    private static final DateTimeFormatter DAY_TIME = DateTimeFormatter.ofPattern("M月d日 EEE HH:mm", Locale.CHINA);
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");

    private final NotificationMapper notificationMapper;
    private final SysUserMapper userMapper;
    private final EventMapper eventMapper;
    private final GroupMapper groupMapper;
    private final CommentMapper commentMapper;

    @TransactionalEventListener
    public void on(Notice.EventInvited n) {
        safely(() -> {
            ScheduleEvent e = eventMapper.findById(n.eventId());
            SysUser inviter = userMapper.findById(n.inviterId());
            if (e == null || inviter == null) {
                return;
            }
            for (Long uid : n.userIds()) {
                save(uid, NotificationType.EVENT_INVITED, inviter.getDisplayName() + " 邀请你参加「" + e.getTitle() + "」",
                        when(e), n.inviterId(), e.getEventId(), null, null);
            }
        });
    }

    @TransactionalEventListener
    public void on(Notice.EventResponded n) {
        safely(() -> {
            ScheduleEvent e = eventMapper.findById(n.eventId());
            SysUser who = userMapper.findById(n.userId());
            if (e == null || who == null || e.getOwnerId().equals(n.userId())) {
                return;
            }
            save(e.getOwnerId(), NotificationType.EVENT_RESPONDED,
                    who.getDisplayName() + (n.accept() ? " 同意参加" : " 不参加") + "「" + e.getTitle() + "」",
                    e.getAcceptedCount() + " 人已同意" + (e.getPendingCount() > 0 ? "," + e.getPendingCount() + " 人待确认" : ""),
                    n.userId(), e.getEventId(), null, null);
        });
    }

    @TransactionalEventListener
    public void on(Notice.EventUpdated n) {
        safely(() -> {
            ScheduleEvent e = eventMapper.findById(n.eventId());
            if (e == null) {
                return;
            }
            String title = n.timeChanged() ? "「" + e.getTitle() + "」时间已调整,请重新确认" : "「" + e.getTitle() + "」有更新";
            for (Long uid : involved(e, false, null)) {
                save(uid, NotificationType.EVENT_UPDATED, title, when(e), e.getOwnerId(), e.getEventId(), null, null);
            }
        });
    }

    @TransactionalEventListener
    public void on(Notice.EventCancelled n) {
        safely(() -> {
            ScheduleEvent e = eventMapper.findById(n.eventId());
            if (e == null) {
                return;
            }
            for (Long uid : involved(e, false, null)) {
                save(uid, NotificationType.EVENT_CANCELLED, e.getOwnerName() + " 取消了「" + e.getTitle() + "」",
                        when(e), e.getOwnerId(), e.getEventId(), null, null);
            }
        });
    }

    @TransactionalEventListener
    public void on(Notice.GroupInvited n) {
        safely(() -> {
            UserGroup g = groupMapper.findById(n.groupId());
            if (g == null) {
                return;
            }
            for (Long uid : n.userIds()) {
                if (n.direct()) {
                    save(uid, NotificationType.GROUP_ADDED, "管理员 " + g.getOwnerName() + " 把你加入了组「" + g.getName() + "」",
                            "之后该组的组内邀约会发给你", g.getOwnerId(), null, g.getGroupId(), null);
                } else {
                    save(uid, NotificationType.GROUP_INVITED, g.getOwnerName() + " 邀请你加入组「" + g.getName() + "」",
                            "同意后你会收到这个组的组内邀约", g.getOwnerId(), null, g.getGroupId(), null);
                }
            }
        });
    }

    @TransactionalEventListener
    public void on(Notice.GroupResponded n) {
        safely(() -> {
            UserGroup g = groupMapper.findById(n.groupId());
            SysUser who = userMapper.findById(n.userId());
            if (g == null || who == null) {
                return;
            }
            save(g.getOwnerId(), NotificationType.GROUP_RESPONDED,
                    who.getDisplayName() + (n.accept() ? " 同意加入" : " 拒绝加入") + "「" + g.getName() + "」",
                    g.getAcceptedCount() + " 人已加入" + (g.getPendingCount() > 0 ? "," + g.getPendingCount() + " 人待同意" : ""),
                    n.userId(), null, g.getGroupId(), null);
        });
    }

    /**
     * 留言:顶层留言通知发起人和其他未拒绝的参与人;回复只通知被回复的人(回复自己不通知)。
     */
    @TransactionalEventListener
    public void on(Notice.CommentPosted n) {
        safely(() -> {
            EventComment c = commentMapper.findById(n.commentId());
            if (c == null) {
                return;
            }
            ScheduleEvent e = eventMapper.findById(c.getEventId());
            if (e == null) {
                return;
            }
            String text = c.getContent().length() > 100 ? c.getContent().substring(0, 100) + "…" : c.getContent();
            if (c.getParentId() == null) {
                for (Long uid : involved(e, true, c.getUserId())) {
                    save(uid, NotificationType.COMMENT, c.getDisplayName() + " 在「" + e.getTitle() + "」留言",
                            text, c.getUserId(), e.getEventId(), null, c.getCommentId());
                }
            } else if (c.getReplyToUserId() != null && !c.getReplyToUserId().equals(c.getUserId())) {
                save(c.getReplyToUserId(), NotificationType.COMMENT_REPLY,
                        c.getDisplayName() + " 在「" + e.getTitle() + "」回复了你的留言",
                        text, c.getUserId(), e.getEventId(), null, c.getCommentId());
            }
        });
    }

    /**
     * 这个行程相关的人:未拒绝的参与人;includeOwner 时加上发起人(管理员发起的也算);去掉 exclude 本人。
     * 不含发起人时(变更、取消通知)也不含发起人自己的参与记录。
     */
    private Set<Long> involved(ScheduleEvent e, boolean includeOwner, Long exclude) {
        Set<Long> ids = new LinkedHashSet<>();
        if (includeOwner) {
            ids.add(e.getOwnerId());
        }
        for (EventParticipant p : eventMapper.findParticipants(e.getEventId())) {
            if (p.getStatus() != InviteStatus.DECLINED && (includeOwner || !p.getUserId().equals(e.getOwnerId()))) {
                ids.add(p.getUserId());
            }
        }
        ids.remove(exclude);
        return ids;
    }

    private void save(Long userId, NotificationType type, String title, String content,
                      Long actorId, Long eventId, Long groupId, Long commentId) {
        Notification n = new Notification();
        n.setUserId(userId);
        n.setType(type);
        n.setTitle(title.length() > 200 ? title.substring(0, 199) + "…" : title);
        n.setContent(content);
        n.setActorId(actorId);
        n.setEventId(eventId);
        n.setGroupId(groupId);
        n.setCommentId(commentId);
        notificationMapper.insert(n);
    }

    /** "10月2日 周五 14:00 - 15:30 · 地点" */
    private static String when(ScheduleEvent e) {
        LocalDateTime s = e.getStartTime(), t = e.getEndTime();
        String time = s.format(DAY_TIME) + " - " + (s.toLocalDate().equals(t.toLocalDate()) ? t.format(TIME) : t.format(DAY_TIME));
        return e.getLocation() == null ? time : time + " · " + e.getLocation();
    }

    private static void safely(Runnable r) {
        try {
            r.run();
        } catch (Exception ex) {
            log.warn("写站内通知失败:{}", ex.getMessage());
        }
    }
}
