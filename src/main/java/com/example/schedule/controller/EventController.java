package com.example.schedule.controller;

import com.example.schedule.config.AuthInterceptor;
import com.example.schedule.dto.EventDetail;
import com.example.schedule.dto.EventRequest;
import com.example.schedule.dto.EventUpdateRequest;
import com.example.schedule.dto.InviteRequest;
import com.example.schedule.dto.RespondRequest;
import com.example.schedule.model.BusySlot;
import com.example.schedule.model.ScheduleEvent;
import com.example.schedule.model.SysUser;
import com.example.schedule.service.EventService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.List;

/** 行程:预约、邀请、回复邀请、取消。有时间冲突时返回 409,见 EventService */
@RestController
@RequestMapping("/api/events")
@RequiredArgsConstructor
public class EventController {

    private final EventService eventService;

    /** 我发起的和我被邀请的行程 */
    @GetMapping
    public List<ScheduleEvent> list(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me) {
        return eventService.listMine(me);
    }

    @GetMapping("/{id}")
    public EventDetail detail(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me, @PathVariable long id) {
        return eventService.detail(me, id);
    }

    @PostMapping
    public EventDetail create(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me, @RequestBody EventRequest r) {
        return eventService.create(me, r);
    }

    @PostMapping("/{id}/invite")
    public EventDetail invite(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me, @PathVariable long id,
                              @RequestBody InviteRequest r) {
        return eventService.invite(me, id, r);
    }

    @PostMapping("/{id}/respond")
    public EventDetail respond(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me, @PathVariable long id,
                               @RequestBody RespondRequest r) {
        return eventService.respond(me, id, Boolean.TRUE.equals(r.accept()), r.force());
    }

    /** 修改行程(发起人);改时间有冲突时返回 409,带 force=true 可继续 */
    @PutMapping("/{id}")
    public EventDetail update(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me, @PathVariable long id,
                              @RequestBody EventUpdateRequest r) {
        return eventService.update(me, id, r);
    }

    /**
     * 邀请前查看是否有空:userIds 这些普通用户在 [start, end) 内的忙碌时段,只有时间没有内容。
     * 例:/api/events/availability?start=2026-10-02T10:00&end=2026-10-02T11:00&userIds=2,3&excludeEventId=5
     */
    @GetMapping("/availability")
    public List<BusySlot> availability(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime start,
                                       @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime end,
                                       @RequestParam(required = false) List<Long> userIds,
                                       @RequestParam(required = false) Long excludeEventId) {
        return eventService.availability(start, end, userIds, excludeEventId);
    }

    @PostMapping("/{id}/cancel")
    public EventDetail cancel(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me, @PathVariable long id) {
        return eventService.cancel(me, id);
    }
}
