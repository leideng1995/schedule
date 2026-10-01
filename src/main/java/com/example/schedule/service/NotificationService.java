package com.example.schedule.service;

import com.example.schedule.mapper.NotificationMapper;
import com.example.schedule.model.Notification;
import com.example.schedule.model.ReminderItem;
import com.example.schedule.model.SysUser;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;

/** 站内通知:列表、未读数、标记已读,以及页面轮询用的摘要(未读数 + 需要弹窗的开始提醒) */
@Service
@RequiredArgsConstructor
public class NotificationService {

    private static final Set<String> FILTERS = Set.of("all", "unread", "comment");
    private static final int MAX_PAGE = 50;

    private final NotificationMapper notificationMapper;

    /** 页面每 30 秒轮询一次 */
    public record Summary(int unread, Long latestId, List<ReminderItem> reminders) {
    }

    public List<Notification> list(SysUser me, String filter, Long beforeId, Integer limit) {
        int n = limit == null ? 20 : Math.max(1, Math.min(limit, MAX_PAGE));
        return notificationMapper.findForUser(me.getUserId(), normalize(filter), beforeId, n);
    }

    public Summary summary(SysUser me) {
        return new Summary(notificationMapper.countUnread(me.getUserId()), notificationMapper.latestId(me.getUserId()),
                notificationMapper.findPendingReminders(me.getUserId()));
    }

    /** 只会改自己的;已读、不存在或别人的都静默忽略(不透露别人的通知是否存在) */
    public void markRead(SysUser me, long id) {
        notificationMapper.markRead(id, me.getUserId());
    }

    public int markAllRead(SysUser me, String filter) {
        return notificationMapper.markAllRead(me.getUserId(), normalize(filter));
    }

    private static String normalize(String filter) {
        return filter != null && FILTERS.contains(filter) ? filter : "all";
    }
}
