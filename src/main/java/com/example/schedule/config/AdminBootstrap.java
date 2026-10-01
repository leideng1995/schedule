package com.example.schedule.config;

import com.example.schedule.common.PasswordHasher;
import com.example.schedule.mapper.SysUserMapper;
import com.example.schedule.model.Role;
import com.example.schedule.model.SysUser;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/** 启动时如果还没有管理员,按配置 app.admin.* 创建一个 */
@Component
@RequiredArgsConstructor
public class AdminBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);

    private final SysUserMapper userMapper;

    @Value("${app.admin.username:admin}")
    private String username;

    /** 不在代码里写默认密码;没有配置时不创建管理员,只提示 */
    @Value("${app.admin.initial-password:}")
    private String password;

    @Override
    public void run(ApplicationArguments args) {
        if (userMapper.countByRole(Role.ADMIN) > 0) {
            return;
        }
        if (password.isBlank()) {
            log.warn("系统里还没有管理员,但没有配置初始密码(app.admin.initial-password 或环境变量 ADMIN_INITIAL_PASSWORD),暂不创建");
            return;
        }
        String name = username.trim().toLowerCase();
        if (userMapper.findByUsername(name) != null) {
            log.warn("没有管理员,但用户名 {} 已被普通用户占用,请修改 app.admin.username", name);
            return;
        }
        SysUser admin = new SysUser();
        admin.setUsername(name);
        admin.setPasswordHash(PasswordHasher.hash(password));
        admin.setDisplayName("管理员");
        admin.setRole(Role.ADMIN);
        userMapper.insert(admin);
        log.warn("已创建初始管理员 {},密码为配置项 app.admin.initial-password 的值,请尽快修改", name);
    }
}
