package com.example.schedule.notify;

import com.example.schedule.mapper.CommentMapper;
import com.example.schedule.mapper.EventMapper;
import com.example.schedule.mapper.GroupMapper;
import com.example.schedule.mapper.SysUserMapper;
import com.example.schedule.model.Conflict;
import com.example.schedule.model.EventComment;
import com.example.schedule.model.EventParticipant;
import com.example.schedule.model.InviteStatus;
import com.example.schedule.model.ScheduleEvent;
import com.example.schedule.model.SysUser;
import com.example.schedule.model.UserGroup;
import jakarta.annotation.PostConstruct;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

import static org.springframework.web.util.HtmlUtils.htmlEscape;

/**
 * 邮件通知。事务提交后在后台线程发送(@TransactionalEventListener + @Async):
 * SMTP 慢或出错不影响预约、邀请等操作,出错只记日志;事务回滚则不发。
 * 每个收件人单独一封,不会把别人的邮箱放进收件人列表。没填邮箱的用户跳过。
 * 没有配置发件邮箱账号或密码(application-local.yaml 或环境变量 MAIL_USERNAME / MAIL_PASSWORD)时不发送,只记日志。
 */
@Component
@RequiredArgsConstructor
public class MailNotifier {

    private static final Logger log = LoggerFactory.getLogger(MailNotifier.class);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("M月d日 EEEE", Locale.CHINA);
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");

    private final ObjectProvider<JavaMailSender> mailSender;
    private final SysUserMapper userMapper;
    private final EventMapper eventMapper;
    private final GroupMapper groupMapper;
    private final CommentMapper commentMapper;

    @Value("${spring.mail.username:}")
    private String from;

    @Value("${spring.mail.password:}")
    private String password;

    @Value("${app.mail.from-name:行程预约}")
    private String fromName;

    @Value("${app.mail.base-url:http://localhost:8080}")
    private String baseUrl;

    private boolean enabled;

    @PostConstruct
    void init() {
        enabled = !from.isBlank() && !password.isBlank() && mailSender.getIfAvailable() != null;
        if (enabled) {
            log.info("邮件通知已开启,发件邮箱 {}", from);
        } else {
            log.warn("邮件通知未开启:没有配置发件邮箱账号或应用专用密码(application-local.yaml 或环境变量 MAIL_USERNAME / MAIL_PASSWORD),邀请等通知不会发邮件");
        }
    }

    // ------------------------------------------------------------------ 行程

    @Async
    @TransactionalEventListener
    public void on(Notice.EventInvited n) {
        ScheduleEvent e = eventMapper.findById(n.eventId());
        SysUser inviter = userMapper.findById(n.inviterId());
        if (e == null || inviter == null) {
            return;
        }
        for (SysUser u : users(n.userIds())) {
            // 顺便提醒对方:这个时间他已有别的行程
            List<Conflict> conflicts = eventMapper.findConflicts(List.of(u.getUserId()), e.getStartTime(), e.getEndTime(), e.getEventId());
            StringBuilder body = new StringBuilder()
                    .append(p(esc(inviter.getDisplayName()) + " 邀请你参加"
                            + (e.getGroupName() != null ? "组「" + esc(e.getGroupName()) + "」的" : "") + "行程:"))
                    .append(eventTable(e));
            if (!conflicts.isEmpty()) {
                body.append(warn("注意:这个时间你已有 " + String.join("、", conflicts.stream()
                        .map(c -> "「" + esc(c.getTitle()) + "」" + span(c.getStartTime(), c.getEndTime())).toList())));
            }
            body.append(p("请登录系统同意或拒绝这个邀请。"));
            send(u, "【行程邀请】" + inviter.getDisplayName() + " 邀请你参加「" + e.getTitle() + "」",
                    body.toString(), "去回复邀请", "/#inbox");
        }
    }

    @Async
    @TransactionalEventListener
    public void on(Notice.EventResponded n) {
        ScheduleEvent e = eventMapper.findById(n.eventId());
        SysUser who = userMapper.findById(n.userId());
        if (e == null || who == null || e.getOwnerId().equals(n.userId())) {
            return;
        }
        SysUser owner = userMapper.findById(e.getOwnerId());
        String verb = n.accept() ? "同意参加" : "不参加";
        String body = p(esc(who.getDisplayName()) + " <strong>" + verb + "</strong>你发起的行程:")
                + eventTable(e)
                + p("目前 " + e.getAcceptedCount() + " 人已同意" + (e.getPendingCount() > 0 ? "," + e.getPendingCount() + " 人待确认" : "") + "。");
        send(owner, "【邀请回复】" + who.getDisplayName() + " " + verb + "「" + e.getTitle() + "」", body, "查看行程", "/#events");
    }

    @Async
    @TransactionalEventListener
    public void on(Notice.EventUpdated n) {
        ScheduleEvent e = eventMapper.findById(n.eventId());
        ScheduleEvent b = n.before();
        if (e == null) {
            return;
        }
        // 列出改了什么:原值划掉,后面是新值
        List<String> changes = new ArrayList<>();
        if (n.timeChanged()) {
            changes.add(change("时间", span(b.getStartTime(), b.getEndTime()), span(e.getStartTime(), e.getEndTime())));
        }
        if (!Objects.equals(b.getTitle(), e.getTitle())) {
            changes.add(change("标题", esc(b.getTitle()), esc(e.getTitle())));
        }
        if (!Objects.equals(b.getLocation(), e.getLocation())) {
            changes.add(change("地点", esc(b.getLocation()), esc(e.getLocation())));
        }
        if (!Objects.equals(b.getDescription(), e.getDescription())) {
            changes.add("<li>说明已更新</li>");
        }
        List<Long> ids = new ArrayList<>();
        for (EventParticipant p : eventMapper.findParticipants(n.eventId())) {
            if (!p.getUserId().equals(e.getOwnerId()) && p.getStatus() != InviteStatus.DECLINED) {
                ids.add(p.getUserId());
            }
        }
        String body = p(esc(e.getOwnerName()) + " 修改了行程「<strong>" + esc(e.getTitle()) + "</strong>」:")
                + "<ul style=\"margin:0 0 12px;padding-left:20px\">" + String.join("", changes) + "</ul>"
                + eventTable(e)
                + (n.timeChanged() ? warn("时间有变化,请重新确认是否参加。") : "");
        String subject = "【行程变更】「" + e.getTitle() + "」" + (n.timeChanged() ? "时间已调整,请重新确认" : "有更新");
        for (SysUser u : users(ids)) {
            send(u, subject, body, n.timeChanged() ? "去重新确认" : "查看行程", n.timeChanged() ? "/#inbox" : "/#events");
        }
    }

    private static String change(String field, String from, String to) {
        return "<li>" + field + ":<span style=\"color:#9ca3af;text-decoration:line-through\">"
                + (from.isEmpty() ? "无" : from) + "</span> → <strong>" + (to.isEmpty() ? "无" : to) + "</strong></li>";
    }

    @Async
    @TransactionalEventListener
    public void on(Notice.EventCancelled n) {
        ScheduleEvent e = eventMapper.findById(n.eventId());
        if (e == null) {
            return;
        }
        List<Long> ids = new ArrayList<>();
        for (EventParticipant p : eventMapper.findParticipants(n.eventId())) {
            if (!p.getUserId().equals(e.getOwnerId()) && p.getStatus() != InviteStatus.DECLINED) {
                ids.add(p.getUserId());
            }
        }
        String body = p(esc(e.getOwnerName()) + " <strong>取消</strong>了这个行程,这段时间已从你的日程中释放:") + eventTable(e);
        for (SysUser u : users(ids)) {
            send(u, "【行程取消】「" + e.getTitle() + "」已取消", body, "查看我的行程", "/#events");
        }
    }

    // ------------------------------------------------------------------ 组

    @Async
    @TransactionalEventListener
    public void on(Notice.GroupInvited n) {
        UserGroup g = groupMapper.findById(n.groupId());
        if (g == null) {
            return;
        }
        String name = esc(g.getName()), owner = esc(g.getOwnerName());
        String subject, body, action, path;
        if (n.direct()) {
            subject = "【入组通知】你已被加入组「" + g.getName() + "」";
            body = p("管理员 " + owner + " 把你加入了组「<strong>" + name + "</strong>」。之后该组的组内邀约会发给你。");
            action = "查看我的组";
            path = "/#groups";
        } else {
            subject = "【入组邀请】" + g.getOwnerName() + " 邀请你加入组「" + g.getName() + "」";
            body = p(owner + " 邀请你加入组「<strong>" + name + "</strong>」。同意后,你会收到这个组的组内邀约。");
            action = "去回复邀请";
            path = "/#inbox";
        }
        for (SysUser u : users(n.userIds())) {
            send(u, subject, body, action, path);
        }
    }

    @Async
    @TransactionalEventListener
    public void on(Notice.GroupResponded n) {
        UserGroup g = groupMapper.findById(n.groupId());
        SysUser who = userMapper.findById(n.userId());
        if (g == null || who == null) {
            return;
        }
        String verb = n.accept() ? "同意加入" : "拒绝加入";
        String body = p(esc(who.getDisplayName()) + " <strong>" + verb + "</strong>了你的组「" + esc(g.getName()) + "」。")
                + p("目前 " + g.getAcceptedCount() + " 人已加入" + (g.getPendingCount() > 0 ? "," + g.getPendingCount() + " 人待同意" : "") + "。");
        send(userMapper.findById(g.getOwnerId()), "【入组回复】" + who.getDisplayName() + " " + verb + "「" + g.getName() + "」",
                body, "查看我的组", "/#groups");
    }

    // ------------------------------------------------------------------ 留言

    @Async
    @TransactionalEventListener
    public void on(Notice.CommentReplied n) {
        EventComment reply = commentMapper.findById(n.commentId());
        if (reply == null || reply.getReplyToUserId() == null) {
            return;
        }
        ScheduleEvent e = eventMapper.findById(reply.getEventId());
        // 被回复的人如果就是这一组顶层留言的作者,在邮件里引用他那条留言
        EventComment root = commentMapper.findById(reply.getParentId());
        if (e == null) {
            return;
        }
        String body = p(esc(reply.getDisplayName()) + " 在行程「<strong>" + esc(e.getTitle()) + "</strong>」里回复了你:")
                + "<blockquote style=\"margin:0 0 12px;padding:8px 12px;border-left:3px solid #2563eb;background:#f8fafc;"
                + "white-space:pre-wrap\">" + esc(reply.getContent()) + "</blockquote>"
                + (root != null && root.getUserId().equals(reply.getReplyToUserId())
                    ? p("<span style=\"color:#6b7280\">你的留言:" + esc(root.getContent()) + "</span>") : "")
                + p("<span style=\"color:#6b7280\">" + span(e.getStartTime(), e.getEndTime()) + "</span>");
        send(userMapper.findById(reply.getReplyToUserId()), "【留言回复】" + reply.getDisplayName() + " 回复了你的留言",
                body, "查看留言", "/#events");
    }

    // ------------------------------------------------------------------ 账号

    @Async
    @TransactionalEventListener
    public void on(Notice.PasswordResetRequested n) {
        SysUser u = userMapper.findById(n.userId());
        if (u == null) {
            return;
        }
        String body = p("我们收到了重置你账号 <strong>" + esc(u.getUsername()) + "</strong> 密码的申请。点击下面的按钮设置新密码:")
                + warn("链接 " + n.validMinutes() + " 分钟内有效,只能使用一次;再次申请后,旧的链接会失效。")
                + p("如果不是你本人操作,请忽略这封邮件,你的密码不会改变。");
        send(u, "【重置密码】行程预约账号密码重置", body, "设置新密码", "/reset-password.html?token=" + n.token());
    }

    // ------------------------------------------------------------------ 发送

    private List<SysUser> users(Collection<Long> ids) {
        return ids.isEmpty() ? List.of() : userMapper.findByIds(ids);
    }

    /** 发给一个人;没有邮箱、没开启或发送失败都只记日志 */
    private void send(SysUser to, String subject, String bodyHtml, String action, String path) {
        if (to == null) {
            return;
        }
        if (to.getEmail() == null || to.getEmail().isBlank()) {
            log.info("用户 {} 没有填写邮箱,跳过邮件「{}」", to.getUsername(), subject);
            return;
        }
        if (!enabled) {
            log.info("邮件通知未开启,跳过发给 {} 的邮件「{}」", to.getUsername(), subject);
            return;
        }
        try {
            JavaMailSender sender = mailSender.getObject();
            MimeMessage msg = sender.createMimeMessage();
            MimeMessageHelper h = new MimeMessageHelper(msg, "UTF-8");
            h.setFrom(from, fromName);
            h.setTo(to.getEmail());
            h.setSubject(subject);
            h.setText(layout(to, bodyHtml, action, path), true);
            sender.send(msg);
            log.info("已发送邮件「{}」给 {}", subject, to.getUsername());
        } catch (Exception ex) {
            log.warn("发送邮件「{}」给 {} 失败:{}", subject, to.getUsername(), ex.getMessage());
        }
    }

    /** 邮件外框:称呼、正文、按钮、页脚。正文里的用户输入已在调用处转义 */
    private String layout(SysUser to, String bodyHtml, String action, String path) {
        String url = baseUrl.replaceAll("/+$", "") + path;
        return """
                <div style="font-family:-apple-system,'Segoe UI','Microsoft YaHei',sans-serif;max-width:560px;margin:0 auto;color:#1f2329">
                  <div style="padding:18px 24px;border-radius:10px 10px 0 0;color:#fff;font-size:18px;font-weight:600;
                              background:linear-gradient(120deg,#4f46e5,#2563eb 55%%,#0ea5e9)">行程预约</div>
                  <div style="padding:20px 24px;border:1px solid #e3e6eb;border-top:none;border-radius:0 0 10px 10px;line-height:1.7">
                    <p style="margin:0 0 12px">%s,你好:</p>
                    %s
                    <p style="margin:20px 0 4px"><a href="%s" style="display:inline-block;padding:9px 20px;border-radius:6px;
                       background:#2563eb;color:#fff;text-decoration:none">%s</a></p>
                    <p style="margin:16px 0 0;color:#9ca3af;font-size:12px">这封邮件由系统自动发送,请勿直接回复。</p>
                  </div>
                </div>""".formatted(esc(to.getDisplayName()), bodyHtml, esc(url), esc(action));
    }

    private static String eventTable(ScheduleEvent e) {
        StringBuilder rows = new StringBuilder()
                .append(row("标题", "<strong>" + esc(e.getTitle()) + "</strong>"))
                .append(row("时间", span(e.getStartTime(), e.getEndTime())))
                .append(row("发起人", esc(e.getOwnerName())));
        if (e.getLocation() != null) {
            rows.append(row("地点", esc(e.getLocation())));
        }
        if (e.getGroupName() != null) {
            rows.append(row("组", esc(e.getGroupName())));
        }
        if (e.getDescription() != null) {
            rows.append(row("说明", esc(e.getDescription()).replace("\n", "<br>")));
        }
        return "<table style=\"border-collapse:collapse;margin:8px 0 12px;background:#f8fafc;border-radius:8px;width:100%\">"
                + rows + "</table>";
    }

    private static String row(String k, String v) {
        return "<tr><td style=\"padding:6px 12px;color:#6b7280;width:64px;vertical-align:top\">" + k
                + "</td><td style=\"padding:6px 12px\">" + v + "</td></tr>";
    }

    /** "10月6日 星期一 09:00 - 10:30";跨天时结束也带日期 */
    private static String span(LocalDateTime s, LocalDateTime t) {
        boolean sameDay = s.toLocalDate().equals(t.toLocalDate());
        return s.format(DAY) + " " + s.format(TIME) + " - " + (sameDay ? "" : t.format(DAY) + " ") + t.format(TIME);
    }

    private static String p(String html) {
        return "<p style=\"margin:0 0 8px\">" + html + "</p>";
    }

    private static String warn(String html) {
        return "<p style=\"margin:0 0 12px;padding:8px 12px;border-radius:6px;background:#fef3c7;color:#b45309\">" + html + "</p>";
    }

    private static String esc(String s) {
        return s == null ? "" : htmlEscape(s, "UTF-8");
    }
}
