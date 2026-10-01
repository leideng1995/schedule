package com.example.schedule.mapper;

import com.example.schedule.model.GroupMember;
import com.example.schedule.model.InviteStatus;
import com.example.schedule.model.UserGroup;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** 组 user_group 和组成员 group_member */
@Mapper
public interface GroupMapper {

    int insert(UserGroup group);

    int delete(@Param("id") long id);

    /** 带创建者姓名和成员人数 */
    UserGroup findById(@Param("id") long id);

    /** 某用户创建的组和他所在(含待同意、已拒绝)的组,myStatus 为他在组里的状态 */
    List<UserGroup> findForUser(@Param("userId") long userId);

    List<GroupMember> findMembers(@Param("groupId") long groupId);

    GroupMember findMember(@Param("groupId") long groupId, @Param("userId") long userId);

    /** 已同意加入的成员 ID */
    List<Long> findAcceptedUserIds(@Param("groupId") long groupId);

    /** 加入或重新邀请:已存在时把状态改为 status */
    int upsertMember(@Param("groupId") long groupId, @Param("userId") long userId, @Param("status") InviteStatus status);

    int updateMemberStatus(@Param("groupId") long groupId, @Param("userId") long userId, @Param("status") InviteStatus status);

    int deleteMember(@Param("groupId") long groupId, @Param("userId") long userId);
}
