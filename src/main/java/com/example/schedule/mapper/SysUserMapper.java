package com.example.schedule.mapper;

import com.example.schedule.model.Role;
import com.example.schedule.model.SysUser;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Collection;
import java.util.List;

/** 用户表 sys_user */
@Mapper
public interface SysUserMapper {

    int insert(SysUser user);

    SysUser findById(@Param("id") long id);

    SysUser findByUsername(@Param("username") String username);

    /** email 需已转成小写 */
    SysUser findByEmail(@Param("email") String email);

    List<SysUser> findByIds(@Param("ids") Collection<Long> ids);

    /**
     * role、keyword 为 null 时不过滤;keyword 匹配用户名或姓名,matchEmail=true 时也匹配邮箱
     * (只给管理员用,避免普通用户通过搜索试探别人的邮箱)
     */
    List<SysUser> search(@Param("role") Role role, @Param("keyword") String keyword,
                         @Param("matchEmail") boolean matchEmail);

    /** 修改姓名和邮箱 */
    int updateProfile(@Param("id") long id, @Param("displayName") String displayName, @Param("email") String email);

    int countByRole(@Param("role") Role role);

    /** 改密码哈希,同时设置是否需要在下次登录后修改密码 */
    int updatePassword(@Param("id") long id, @Param("passwordHash") String passwordHash,
                       @Param("mustChange") boolean mustChange);
}
