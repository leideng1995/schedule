package com.example.schedule.controller;

import com.example.schedule.config.AuthInterceptor;
import com.example.schedule.dto.RegisterRequest;
import com.example.schedule.dto.UserView;
import com.example.schedule.model.Role;
import com.example.schedule.model.SysUser;
import com.example.schedule.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 用户查询;/api/admin/** 只有管理员能访问(AuthInterceptor 检查) */
@RestController
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    /** 可被邀请的普通用户,用于选择邀请对象和组成员 */
    @GetMapping("/api/users")
    public List<UserView> normalUsers(@RequestParam(required = false) String keyword) {
        // 不返回邮箱,也不按邮箱搜索:邮箱只给本人和管理员看
        return userService.search(Role.USER, keyword, false).stream().map(UserView::brief).toList();
    }

    @GetMapping("/api/admin/users")
    public List<UserView> allUsers(@RequestParam(required = false) String keyword) {
        return userService.search(null, keyword, true).stream().map(UserView::of).toList();
    }

    /** 管理员新建用户,可以指定角色 */
    @PostMapping("/api/admin/users")
    public UserView create(@RequestBody RegisterRequest r) {
        return UserView.of(userService.create(r, true));
    }

    /** 管理员把用户密码重置为 123456,该用户登录后必须先修改密码 */
    @PostMapping("/api/admin/users/{id}/reset-password")
    public UserView resetPassword(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me, @PathVariable long id) {
        return UserView.of(userService.resetPassword(me, id));
    }
}
