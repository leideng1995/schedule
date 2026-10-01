package com.example.schedule.mapper;

import com.example.schedule.model.UserAvatar;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** 用户头像 user_avatar */
@Mapper
public interface AvatarMapper {

    /** 新增或替换 */
    int upsert(@Param("userId") long userId, @Param("image") byte[] image);

    UserAvatar find(@Param("userId") long userId);

    /** 所有有头像的用户和版本(不含图片),页面据此决定显示图片还是姓名首字 */
    List<UserAvatar> findVersions();

    int delete(@Param("userId") long userId);
}
