package com.example.schedule.dto;

import com.example.schedule.model.Role;
import com.example.schedule.model.SysUser;

/**
 * 返回给前端的用户信息(不含密码哈希);mustChangePassword=true 时前端强制弹出修改密码。
 * 邮箱只给本人和管理员看:of 带邮箱,brief 不带(普通用户选择邀请对象时用)。
 */
public record UserView(Long userId, String username, String displayName, String email, Role role, String roleLabel,
                       boolean mustChangePassword) {

    public static UserView of(SysUser u) {
        return new UserView(u.getUserId(), u.getUsername(), u.getDisplayName(), u.getEmail(), u.getRole(),
                u.getRole().label(), u.isMustChangePassword());
    }

    public static UserView brief(SysUser u) {
        return new UserView(u.getUserId(), u.getUsername(), u.getDisplayName(), null, u.getRole(),
                u.getRole().label(), false);
    }
}
