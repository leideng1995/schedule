package com.example.schedule.service;

import com.example.schedule.common.Biz;
import com.example.schedule.common.PasswordHasher;
import com.example.schedule.dto.RegisterRequest;
import com.example.schedule.mapper.SysUserMapper;
import com.example.schedule.model.Role;
import com.example.schedule.model.SysUser;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** 用户:登录校验、注册、查询,以及"被邀请人必须是普通用户"的检查 */
@Service
@RequiredArgsConstructor
public class UserService {

    private static final Logger log = LoggerFactory.getLogger(UserService.class);

    private static final Pattern USERNAME = Pattern.compile("[a-z0-9_]{3,20}");

    /** 8-64 位,至少一个字母和一个数字 */
    private static final Pattern PASSWORD = Pattern.compile("(?=.*[A-Za-z])(?=.*\\d).{8,64}");

    private final SysUserMapper userMapper;

    /** 简单的格式检查:有 @、@ 后面有点、没有空白;是否真实可用不在这里验证 */
    private static final Pattern EMAIL = Pattern.compile("[^\\s@]+@[^\\s@]+\\.[^\\s@]+");

    /**
     * 用用户名或邮箱登录,不对时返回 null(不区分是账号不存在还是密码不对)。
     * 用户名规则里没有 @,所以含 @ 的按邮箱查,否则按用户名查。
     */
    public SysUser authenticate(String account, String password) {
        String name = account == null ? "" : account.trim().toLowerCase();
        SysUser user = name.isEmpty() ? null
                : name.contains("@") ? userMapper.findByEmail(name) : userMapper.findByUsername(name);
        // 用户不存在时 matches 也会算一次哈希,避免通过响应时间判断用户名是否存在
        boolean ok = PasswordHasher.matches(password, user == null ? null : user.getPasswordHash());
        return ok && user != null ? user : null;
    }

    /** 按用户名或邮箱(含 @)查用户,找不到返回 null */
    public SysUser findByAccount(String account) {
        String name = account == null ? "" : account.trim().toLowerCase();
        return name.isEmpty() ? null : name.contains("@") ? userMapper.findByEmail(name) : userMapper.findByUsername(name);
    }

    /** 新密码是否符合规则:8-64 位,同时包含字母和数字 */
    public static boolean isValidPassword(String password) {
        return password != null && PASSWORD.matcher(password).matches();
    }

    /** 新建用户。自助注册固定为普通用户,只有管理员新建时才能指定角色 */
    public SysUser create(RegisterRequest r, boolean allowRole) {
        String username = r.username() == null ? "" : r.username().trim().toLowerCase();
        if (!USERNAME.matcher(username).matches()) {
            throw Biz.bad("用户名为 3-20 位小写字母、数字或下划线");
        }
        if (r.password() == null || !PASSWORD.matcher(r.password()).matches()) {
            throw Biz.bad("密码为 8-64 位,且同时包含字母和数字");
        }
        SysUser u = new SysUser();
        u.setUsername(username);
        u.setPasswordHash(PasswordHasher.hash(r.password()));
        u.setDisplayName(Biz.required(r.displayName(), "姓名", 50));
        u.setEmail(requireEmail(r.email()));
        u.setRole(allowRole && r.role() != null ? r.role() : Role.USER);
        if (userMapper.findByEmail(u.getEmail()) != null) {
            throw Biz.bad("邮箱 " + u.getEmail() + " 已被使用");
        }
        try {
            userMapper.insert(u);
        } catch (DuplicateKeyException e) {
            // 先查过邮箱,这里一般是用户名重复;并发注册同一邮箱时按索引名区分
            throw Biz.bad(isEmailDuplicate(e) ? "邮箱 " + u.getEmail() + " 已被使用" : "用户名 " + username + " 已被使用");
        }
        log.info("新建用户 {}({})", username, u.getRole().label());
        return u;
    }

    /** 管理员重置后的密码;不满足密码规则(没有字母),用户无法把它设成正式密码 */
    public static final String RESET_PASSWORD = "123456";

    /**
     * 管理员把用户密码重置为 RESET_PASSWORD,并要求该用户下次登录后先修改密码。
     * 不能重置自己的(自己改密码走 changePassword)。对方已登录的会话会失效,需用新密码重新登录后先修改密码。
     */
    public SysUser resetPassword(SysUser admin, long userId) {
        SysUser u = userMapper.findById(userId);
        if (u == null) {
            throw Biz.notFound("用户不存在");
        }
        if (u.getUserId().equals(admin.getUserId())) {
            throw Biz.bad("不能重置自己的密码,请使用「修改密码」");
        }
        userMapper.updatePassword(userId, PasswordHasher.hash(RESET_PASSWORD), true);
        log.info("管理员 {} 重置了用户 {} 的密码", admin.getUsername(), u.getUsername());
        return userMapper.findById(userId);
    }

    /** 修改自己的密码:验证原密码,新密码要符合规则且不能与原密码相同;改完解除"必须修改密码" */
    public SysUser changePassword(SysUser me, String oldPassword, String newPassword) {
        if (!PasswordHasher.matches(oldPassword, me.getPasswordHash())) {
            throw Biz.bad("原密码不正确");
        }
        if (newPassword == null || !PASSWORD.matcher(newPassword).matches()) {
            throw Biz.bad("密码为 8-64 位,且同时包含字母和数字");
        }
        if (newPassword.equals(oldPassword)) {
            throw Biz.bad("新密码不能与原密码相同");
        }
        userMapper.updatePassword(me.getUserId(), PasswordHasher.hash(newPassword), false);
        log.info("用户 {} 修改了密码{}", me.getUsername(), me.isMustChangePassword() ? "(重置后首次修改)" : "");
        return userMapper.findById(me.getUserId());
    }

    /** 修改自己的姓名和邮箱;早期没填邮箱的用户在这里补上 */
    public SysUser updateProfile(SysUser me, String displayName, String email) {
        String name = Biz.required(displayName, "姓名", 50);
        String mail = requireEmail(email);
        SysUser owner = userMapper.findByEmail(mail);
        if (owner != null && !owner.getUserId().equals(me.getUserId())) {
            throw Biz.bad("邮箱 " + mail + " 已被使用");
        }
        try {
            userMapper.updateProfile(me.getUserId(), name, mail);
        } catch (DuplicateKeyException e) {
            throw Biz.bad("邮箱 " + mail + " 已被使用");
        }
        log.info("用户 {} 修改了个人信息", me.getUsername());
        return userMapper.findById(me.getUserId());
    }

    /** search 时管理员也按邮箱匹配,普通用户不行 */
    public List<SysUser> search(Role role, String keyword, boolean matchEmail) {
        return userMapper.search(role, keyword == null ? null : keyword.trim(), matchEmail);
    }

    /** 邮箱必填:去掉首尾空格、转小写,检查格式和长度 */
    private static String requireEmail(String email) {
        String v = email == null ? "" : email.trim().toLowerCase();
        if (v.isEmpty()) {
            throw Biz.bad("邮箱不能为空");
        }
        if (v.length() > 100 || !EMAIL.matcher(v).matches()) {
            throw Biz.bad("邮箱格式不正确");
        }
        return v;
    }

    private static boolean isEmailDuplicate(DuplicateKeyException e) {
        String msg = e.getMostSpecificCause().getMessage();
        return msg != null && msg.contains("uk_user_email");
    }

    /**
     * 校验并返回要邀请的用户 ID(去重、保持顺序):必须存在、必须是普通用户、不能是自己。
     */
    public Set<Long> requireNormalUsers(Collection<Long> ids, SysUser me) {
        Set<Long> distinct = ids == null ? Set.of()
                : ids.stream().filter(Objects::nonNull).collect(Collectors.toCollection(LinkedHashSet::new));
        if (distinct.isEmpty()) {
            return distinct;
        }
        if (distinct.contains(me.getUserId())) {
            throw Biz.bad("不能邀请自己");
        }
        Map<Long, SysUser> found = userMapper.findByIds(distinct).stream()
                .collect(Collectors.toMap(SysUser::getUserId, Function.identity()));
        for (Long id : distinct) {
            SysUser u = found.get(id);
            if (u == null) {
                throw Biz.bad("用户 " + id + " 不存在");
            }
            if (u.getRole() != Role.USER) {
                throw Biz.bad(u.getDisplayName() + " 不是普通用户,不能被邀请");
            }
        }
        return distinct;
    }
}
