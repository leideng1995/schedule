package com.example.schedule.dto;

import com.example.schedule.model.GroupMember;
import com.example.schedule.model.UserGroup;

import java.util.List;

/** 组详情:组本身和全部成员 */
public record GroupDetail(UserGroup group, List<GroupMember> members) {
}
