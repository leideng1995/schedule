package com.example.schedule.service;

import com.example.schedule.mapper.NotificationMapper;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 活动开始前提醒:每 30 秒检查一次,给 5 分钟内就要开始的行程的参加者生成"即将开始"通知,
 * 页面轮询到后弹窗。同一次开始时间只提醒一次;改了时间会按新时间再提醒。
 */
@Component
@RequiredArgsConstructor
public class ReminderJob {

    private static final Logger log = LoggerFactory.getLogger(ReminderJob.class);
    static final int REMIND_MINUTES = 5;

    private final NotificationMapper notificationMapper;

    @Scheduled(fixedDelay = 30_000, initialDelay = 10_000)
    public void remind() {
        try {
            int n = notificationMapper.insertDueReminders(REMIND_MINUTES);
            if (n > 0) {
                log.info("生成了 {} 条活动开始提醒", n);
            }
        } catch (Exception e) {
            log.warn("生成活动开始提醒失败:{}", e.getMessage());
        }
    }
}
