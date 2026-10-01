package com.example.schedule.controller;

import com.example.schedule.config.AuthInterceptor;
import com.example.schedule.model.Notification;
import com.example.schedule.model.SysUser;
import com.example.schedule.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/** 站内通知(只能看、改自己的) */
@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    /** filter:all / unread / comment(给我的留言);beforeId:加载更多时传当前最后一条的 ID */
    @GetMapping
    public List<Notification> list(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me,
                                   @RequestParam(required = false) String filter,
                                   @RequestParam(required = false) Long beforeId,
                                   @RequestParam(required = false) Integer limit) {
        return notificationService.list(me, filter, beforeId, limit);
    }

    /** 页面轮询:未读数、最新通知 ID、需要弹窗的活动开始提醒 */
    @GetMapping("/summary")
    public NotificationService.Summary summary(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me) {
        return notificationService.summary(me);
    }

    @PostMapping("/{id}/read")
    public void markRead(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me, @PathVariable long id) {
        notificationService.markRead(me, id);
    }

    @PostMapping("/read-all")
    public Map<String, Integer> markAllRead(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me,
                                            @RequestParam(required = false) String filter) {
        return Map.of("updated", notificationService.markAllRead(me, filter));
    }
}
