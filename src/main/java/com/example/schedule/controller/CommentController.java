package com.example.schedule.controller;

import com.example.schedule.config.AuthInterceptor;
import com.example.schedule.dto.CommentRequest;
import com.example.schedule.model.EventComment;
import com.example.schedule.model.SysUser;
import com.example.schedule.service.CommentService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 行程留言:查看、发表、编辑、删除。权限见 CommentService */
@RestController
@RequestMapping("/api/events/{eventId}/comments")
@RequiredArgsConstructor
public class CommentController {

    private final CommentService commentService;

    @GetMapping
    public List<EventComment> list(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me, @PathVariable long eventId) {
        return commentService.list(me, eventId);
    }

    @PostMapping
    public EventComment add(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me, @PathVariable long eventId,
                            @RequestBody CommentRequest r) {
        return commentService.add(me, eventId, r.content(), r.parentId());
    }

    /** 编辑自己的留言;请求体只用 content */
    @PutMapping("/{commentId}")
    public EventComment edit(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me, @PathVariable long eventId,
                             @PathVariable long commentId, @RequestBody CommentRequest r) {
        return commentService.edit(me, eventId, commentId, r.content());
    }

    @DeleteMapping("/{commentId}")
    public void delete(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me, @PathVariable long eventId,
                       @PathVariable long commentId) {
        commentService.delete(me, eventId, commentId);
    }
}
