package com.example.schedule.service;

import com.example.schedule.common.Biz;
import com.example.schedule.common.PasswordHasher;
import com.example.schedule.mapper.PasswordResetTokenMapper;
import com.example.schedule.mapper.SysUserMapper;
import com.example.schedule.model.SysUser;
import com.example.schedule.notify.Notice;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Base64;
import java.util.Deque;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 通过邮箱重置密码。
 * <ol>
 *   <li>申请:输入用户名或邮箱。无论账号是否存在、有没有邮箱,都返回同样的结果,不能用来试探别人的账号;
 *       账号存在且有邮箱时,生成随机令牌,只把 SHA-256 存进数据库,原文通过邮件发给本人</li>
 *   <li>重置:凭邮件里的链接设置新密码。令牌 30 分钟有效、只能用一次;重置后该用户其他令牌失效,
 *       已登录的其他会话也会失效(AuthInterceptor 比对密码指纹)</li>
 * </ol>
 * 频率限制(内存计数,重启清零):同一账号 1 分钟 1 封、1 小时 5 封;同一 IP 1 小时 20 次申请。
 */
@Service
@RequiredArgsConstructor
public class PasswordResetService {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);

    static final Duration TOKEN_TTL = Duration.ofMinutes(30);
    private static final int TOKEN_BYTES = 32;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final SysUserMapper userMapper;
    private final PasswordResetTokenMapper tokenMapper;
    private final UserService userService;
    private final ApplicationEventPublisher events;

    /** 申请记录:键为 "user:ID" 或 "ip:地址",值为最近一小时内的申请时间 */
    private final Map<String, Deque<Instant>> attempts = new ConcurrentHashMap<>();

    /** 申请重置。返回值不区分账号是否存在;只有同一 IP 申请太频繁时才报错 */
    @Transactional
    public void request(String account, String ip) {
        if (!allow("ip:" + ip, 20, Duration.ofHours(1), null)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "申请太频繁,请稍后再试");
        }
        SysUser user = userService.findByAccount(account);
        if (user == null || user.getEmail() == null || user.getEmail().isBlank()) {
            log.info("重置密码申请:账号不存在或没有邮箱,不发送(来自 {})", ip);
            return;
        }
        // 同一账号的限制不报错,避免通过错误提示判断账号是否存在
        if (!allow("user:" + user.getUserId(), 5, Duration.ofHours(1), Duration.ofMinutes(1))) {
            log.info("用户 {} 重置密码申请太频繁,本次不发送", user.getUsername());
            return;
        }
        tokenMapper.deleteExpired();
        tokenMapper.invalidateForUser(user.getUserId()); // 只有最新的一封邮件里的链接有效
        String token = newToken();
        tokenMapper.insert(user.getUserId(), sha256(token), LocalDateTime.now().plus(TOKEN_TTL), ip);
        events.publishEvent(new Notice.PasswordResetRequested(user.getUserId(), token, (int) TOKEN_TTL.toMinutes()));
        log.info("用户 {} 申请重置密码,已生成重置链接(来自 {})", user.getUsername(), ip);
    }

    /** 检查链接是否还能用(打开重置页面时调用) */
    public boolean isValid(String token) {
        return token != null && !token.isBlank() && tokenMapper.findValidUserId(sha256(token)) != null;
    }

    /** 用令牌设置新密码,成功后令牌失效 */
    @Transactional
    public void reset(String token, String newPassword) {
        String hash = token == null || token.isBlank() ? null : sha256(token);
        Long userId = hash == null ? null : tokenMapper.findValidUserId(hash);
        if (userId == null) {
            throw Biz.bad("重置链接无效或已过期,请重新申请");
        }
        if (!UserService.isValidPassword(newPassword)) {
            throw Biz.bad("密码为 8-64 位,且同时包含字母和数字");
        }
        if (tokenMapper.markUsed(hash) == 0) { // 同一链接并发提交时只有一个成功
            throw Biz.bad("重置链接无效或已过期,请重新申请");
        }
        userMapper.updatePassword(userId, PasswordHasher.hash(newPassword), false);
        tokenMapper.invalidateForUser(userId);
        SysUser u = userMapper.findById(userId);
        log.info("用户 {} 通过邮箱重置了密码", u == null ? userId : u.getUsername());
    }

    /**
     * 滑动窗口计数:window 内最多 max 次,且距上次至少 gap(可为 null);允许时记一次。
     */
    private boolean allow(String key, int max, Duration window, Duration gap) {
        Instant now = Instant.now();
        Deque<Instant> q = attempts.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && q.peekFirst().isBefore(now.minus(window))) {
                q.pollFirst();
            }
            if (q.size() >= max || (gap != null && !q.isEmpty() && q.peekLast().isAfter(now.minus(gap)))) {
                return false;
            }
            q.addLast(now);
            return true;
        }
    }

    /** 32 字节随机数,URL 安全的 Base64(放进链接不用再转义) */
    private static String newToken() {
        byte[] b = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
