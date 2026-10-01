package com.example.schedule.config;

import com.example.schedule.mapper.SysUserMapper;
import com.example.schedule.model.SysUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 所有 /api 请求的登录检查;/api/admin/** 只允许管理员;需要修改密码的用户只能访问 /api/auth/**。
 * 每次请求都从数据库重新读用户,当前用户放在 request 属性 CURRENT_USER 里,
 * 控制器用 @RequestAttribute(CURRENT_USER) 取。其余按角色的规则在 service 里检查。
 */
@Component
@RequiredArgsConstructor
public class AuthInterceptor implements HandlerInterceptor {

    public static final String SESSION_UID = "uid";
    public static final String CURRENT_USER = "currentUser";

    private final SysUserMapper userMapper;

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) {
        String path = req.getRequestURI().substring(req.getContextPath().length());
        if ("POST".equals(req.getMethod()) && (path.equals("/api/auth/login") || path.equals("/api/auth/register"))) {
            return true;
        }
        HttpSession session = req.getSession(false);
        Object uid = session == null ? null : session.getAttribute(SESSION_UID);
        SysUser user = uid instanceof Long id ? userMapper.findById(id) : null;
        if (user == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "请先登录");
        }
        // 密码被管理员重置过:改密码之前只能用 /api/auth/**(查看自己、改密码、退出)
        if (user.isMustChangePassword() && !path.startsWith("/api/auth/")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "密码已被管理员重置,请先修改密码");
        }
        if (path.startsWith("/api/admin/") && !user.isAdmin()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "只有管理员可以执行此操作");
        }
        req.setAttribute(CURRENT_USER, user);
        return true;
    }
}
