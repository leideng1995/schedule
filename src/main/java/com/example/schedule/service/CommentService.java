package com.example.schedule.service;

import com.example.schedule.common.Biz;
import com.example.schedule.mapper.CommentMapper;
import com.example.schedule.mapper.EventMapper;
import com.example.schedule.model.EventComment;
import com.example.schedule.model.EventParticipant;
import com.example.schedule.model.EventStatus;
import com.example.schedule.model.InviteStatus;
import com.example.schedule.model.ScheduleEvent;
import com.example.schedule.model.SysUser;
import com.example.schedule.notify.Notice;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 行程留言。
 * <ul>
 *   <li>查看:能看到这个行程的人(发起人、参与人、管理员)</li>
 *   <li>发表:发起人和未拒绝的参与人;已取消的行程只能看不能再留言</li>
 *   <li>回复:和发表一样,但不能回复自己的留言;回复只有一层,邮件通知被回复的人</li>
 *   <li>编辑:只能编辑自己的,规则同发表,会标记"已编辑"</li>
 *   <li>删除:除管理员外只能删除自己的;自己的顶层留言下面有别人的回复时只标记删除,回复保留</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class CommentService {

    private static final Logger log = LoggerFactory.getLogger(CommentService.class);
    private static final int MAX_LENGTH = 500;

    private final CommentMapper commentMapper;
    private final EventMapper eventMapper;
    private final ApplicationEventPublisher events;

    public List<EventComment> list(SysUser me, long eventId) {
        ScheduleEvent e = load(eventId);
        if (!canView(e, me)) {
            throw Biz.notFound("行程不存在");
        }
        return commentMapper.findByEvent(eventId);
    }

    /**
     * 发表留言或回复。parentId 为空是顶层留言;否则回复 parentId 这条留言:
     * 回复只有一层,回复"回复"时归到同一条顶层留言下面,并记下被回复的人。
     * 不能回复自己的留言;回复时给被回复的人发邮件。
     */
    @Transactional
    public EventComment add(SysUser me, long eventId, String content, Long parentId) {
        ScheduleEvent e = load(eventId);
        if (!canView(e, me)) {
            throw Biz.notFound("行程不存在");
        }
        if (!isOwner(e, me)) {
            EventParticipant p = eventMapper.findParticipant(eventId, me.getUserId());
            if (p == null || p.getStatus() == InviteStatus.DECLINED) {
                throw Biz.forbidden("只有发起人和参与这个行程的人可以留言");
            }
        }
        if (e.getStatus() == EventStatus.CANCELLED) {
            throw Biz.bad("行程已取消,不能再留言");
        }
        EventComment c = new EventComment();
        c.setEventId(eventId);
        c.setUserId(me.getUserId());
        c.setContent(Biz.required(content, "留言内容", MAX_LENGTH));
        if (parentId != null) {
            EventComment target = commentMapper.findById(parentId);
            if (target == null || !target.getEventId().equals(eventId)) {
                throw Biz.notFound("要回复的留言不存在,可能已被删除");
            }
            if (target.getDeletedAt() != null) {
                throw Biz.bad("这条留言已删除,不能回复");
            }
            if (target.getUserId().equals(me.getUserId())) {
                throw Biz.bad("不能回复自己的留言");
            }
            c.setParentId(target.getParentId() != null ? target.getParentId() : target.getCommentId());
            c.setReplyToUserId(target.getUserId());
        }
        commentMapper.insert(c);
        events.publishEvent(new Notice.CommentPosted(c.getCommentId()));
        if (c.getReplyToUserId() != null && !c.getReplyToUserId().equals(me.getUserId())) {
            events.publishEvent(new Notice.CommentReplied(c.getCommentId()));
        }
        log.info("{} 在行程 {} {}", me.getUsername(), eventId,
                parentId == null ? "留言" : "回复了用户 " + c.getReplyToUserId() + " 的留言");
        return commentMapper.findById(c.getCommentId());
    }

    /**
     * 编辑留言:只能编辑自己的(管理员也不能改别人的内容);
     * 和发表一样要求还在参与这个行程、行程未取消;已删除的不能编辑。内容没变时不更新。不发通知。
     */
    @Transactional
    public EventComment edit(SysUser me, long eventId, long commentId, String content) {
        EventComment c = commentMapper.findById(commentId);
        if (c == null || !c.getEventId().equals(eventId)) {
            throw Biz.notFound("留言不存在");
        }
        if (!c.getUserId().equals(me.getUserId())) {
            throw Biz.forbidden("只能编辑自己的留言");
        }
        if (c.getDeletedAt() != null) {
            throw Biz.bad("这条留言已删除,不能编辑");
        }
        ScheduleEvent e = load(eventId);
        if (!isOwner(e, me)) {
            EventParticipant p = eventMapper.findParticipant(eventId, me.getUserId());
            if (p == null || p.getStatus() == InviteStatus.DECLINED) {
                throw Biz.forbidden("你已不再参与这个行程,不能编辑留言");
            }
        }
        if (e.getStatus() == EventStatus.CANCELLED) {
            throw Biz.bad("行程已取消,留言不能再修改");
        }
        String text = Biz.required(content, "留言内容", MAX_LENGTH);
        if (text.equals(c.getContent())) {
            return c;
        }
        commentMapper.updateContent(commentId, text);
        log.info("{} 编辑了行程 {} 的留言 {}", me.getUsername(), eventId, commentId);
        return commentMapper.findById(commentId);
    }

    /**
     * 删除留言:除管理员外,只能删除自己的。
     * 自己的顶层留言下面有别人的回复时只标记删除(显示"该留言已删除",别人的回复保留,不能删别人的评论);
     * 其余情况真正删除(顶层留言下面自己的回复一起删除;管理员删顶层留言时下面所有回复一起删除)。
     * 删掉一条回复后,如果它所属的顶层留言已标记删除且没有回复了,把这条占位也清掉。
     */
    @Transactional
    public void delete(SysUser me, long eventId, long commentId) {
        EventComment c = commentMapper.findById(commentId);
        if (c == null || !c.getEventId().equals(eventId)) {
            throw Biz.notFound("留言不存在");
        }
        boolean mine = c.getUserId().equals(me.getUserId());
        if (!mine && !me.isAdmin()) {
            throw Biz.forbidden("只能删除自己的留言");
        }
        if (c.getDeletedAt() != null && !me.isAdmin()) {
            throw Biz.bad("这条留言已经删除了");
        }
        if (c.getParentId() == null && !me.isAdmin() && commentMapper.countOthersReplies(commentId, me.getUserId()) > 0) {
            commentMapper.softDelete(commentId);
            log.info("{} 删除了行程 {} 的留言 {}(下面有别人的回复,只标记删除)", me.getUsername(), eventId, commentId);
            return;
        }
        commentMapper.delete(commentId);
        if (c.getParentId() != null) {
            EventComment root = commentMapper.findById(c.getParentId());
            if (root != null && root.getDeletedAt() != null && commentMapper.countReplies(root.getCommentId()) == 0) {
                commentMapper.delete(root.getCommentId());
            }
        }
        log.info("{} 删除了行程 {} 的留言 {}{}", me.getUsername(), eventId, commentId, mine ? "" : "(管理员删除)");
    }

    /** 和行程详情的可见范围一致:发起人、任何状态的参与人、管理员 */
    private boolean canView(ScheduleEvent e, SysUser me) {
        return isOwner(e, me) || me.isAdmin() || eventMapper.findParticipant(e.getEventId(), me.getUserId()) != null;
    }

    private ScheduleEvent load(long eventId) {
        ScheduleEvent e = eventMapper.findById(eventId);
        if (e == null) {
            throw Biz.notFound("行程不存在");
        }
        return e;
    }

    private static boolean isOwner(ScheduleEvent e, SysUser me) {
        return e.getOwnerId().equals(me.getUserId());
    }
}
