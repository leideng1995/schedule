package com.example.schedule.controller;

import com.example.schedule.config.AuthInterceptor;
import com.example.schedule.dto.GroupDetail;
import com.example.schedule.dto.GroupRequest;
import com.example.schedule.dto.MembersRequest;
import com.example.schedule.dto.RespondRequest;
import com.example.schedule.model.SysUser;
import com.example.schedule.model.UserGroup;
import com.example.schedule.service.GroupService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 组:创建、成员管理、同意/拒绝加入 */
@RestController
@RequestMapping("/api/groups")
@RequiredArgsConstructor
public class GroupController {

    private final GroupService groupService;

    @GetMapping
    public List<UserGroup> list(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me) {
        return groupService.listMine(me);
    }

    @GetMapping("/{id}")
    public GroupDetail detail(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me, @PathVariable long id) {
        return groupService.detail(me, id);
    }

    @PostMapping
    public GroupDetail create(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me, @RequestBody GroupRequest r) {
        return groupService.create(me, r);
    }

    @DeleteMapping("/{id}")
    public void delete(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me, @PathVariable long id) {
        groupService.delete(me, id);
    }

    @PostMapping("/{id}/members")
    public GroupDetail addMembers(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me, @PathVariable long id,
                                  @RequestBody MembersRequest r) {
        return groupService.addMembers(me, id, r.userIds());
    }

    /** 创建者移除成员;成员移除自己即退出组 */
    @DeleteMapping("/{id}/members/{userId}")
    public void removeMember(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me, @PathVariable long id,
                             @PathVariable long userId) {
        groupService.removeMember(me, id, userId);
    }

    @PostMapping("/{id}/respond")
    public GroupDetail respond(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me, @PathVariable long id,
                               @RequestBody RespondRequest r) {
        return groupService.respond(me, id, Boolean.TRUE.equals(r.accept()));
    }
}
