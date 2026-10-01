package com.example.schedule.controller;

import com.example.schedule.config.AuthInterceptor;
import com.example.schedule.dto.ChangePasswordRequest;
import com.example.schedule.dto.LoginRequest;
import com.example.schedule.dto.ProfileRequest;
import com.example.schedule.dto.RegisterRequest;
import com.example.schedule.dto.UserView;
import com.example.schedule.model.SysUser;
import com.example.schedule.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** 登录、注册(普通用户)、退出、查看当前用户 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final UserService userService;

    /** username 填用户名或邮箱都可以 */
    @PostMapping("/login")
    public UserView login(@RequestBody LoginRequest r, HttpServletRequest req) {
        SysUser user = userService.authenticate(r.username(), r.password());
        if (user == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "账号或密码错误");
        }
        startSession(req, user);
        return UserView.of(user);
    }

    /** 自助注册,只能注册普通用户;注册后直接登录 */
    @PostMapping("/register")
    public UserView register(@RequestBody RegisterRequest r, HttpServletRequest req) {
        SysUser user = userService.create(r, false);
        startSession(req, user);
        return UserView.of(user);
    }

    @PostMapping("/logout")
    public void logout(HttpServletRequest req) {
        HttpSession s = req.getSession(false);
        if (s != null) {
            s.invalidate();
        }
    }

    @GetMapping("/me")
    public UserView me(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me) {
        return UserView.of(me);
    }

    /** 修改自己的密码;管理员重置密码后,用户必须先调这个接口才能使用其他功能 */
    @PutMapping("/password")
    public UserView changePassword(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me,
                                   @RequestBody ChangePasswordRequest r) {
        return UserView.of(userService.changePassword(me, r.oldPassword(), r.newPassword()));
    }

    /** 修改自己的姓名和邮箱 */
    @PutMapping("/profile")
    public UserView updateProfile(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me,
                                  @RequestBody ProfileRequest r) {
        return UserView.of(userService.updateProfile(me, r.displayName(), r.email()));
    }

    /** 登录后换一个新会话,防止会话固定攻击 */
    private static void startSession(HttpServletRequest req, SysUser user) {
        HttpSession old = req.getSession(false);
        if (old != null) {
            old.invalidate();
        }
        req.getSession(true).setAttribute(AuthInterceptor.SESSION_UID, user.getUserId());
    }
}
