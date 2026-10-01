package com.example.schedule.controller;

import com.example.schedule.config.AuthInterceptor;
import com.example.schedule.dto.EventDetail;
import com.example.schedule.dto.EventRequest;
import com.example.schedule.dto.InviteRequest;
import com.example.schedule.dto.RespondRequest;
import com.example.schedule.model.ScheduleEvent;
import com.example.schedule.model.SysUser;
import com.example.schedule.service.EventService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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

    @PostMapping("/{id}/cancel")
    public EventDetail cancel(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me, @PathVariable long id) {
        return eventService.cancel(me, id);
    }
}
