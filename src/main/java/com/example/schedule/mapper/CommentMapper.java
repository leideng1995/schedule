package com.example.schedule.mapper;

import com.example.schedule.model.EventComment;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** 行程留言 event_comment */
@Mapper
public interface CommentMapper {

    int insert(EventComment comment);

    /** 带留言人姓名 */
    EventComment findById(@Param("id") long id);

    /** 某个行程的全部留言,按时间先后 */
    List<EventComment> findByEvent(@Param("eventId") long eventId);

    /** 一条顶层留言下面有几条回复 */
    int countReplies(@Param("id") long id);

    /** 一条顶层留言下面有几条不是 userId 发的回复 */
    int countOthersReplies(@Param("id") long id, @Param("userId") long userId);

    /** 修改内容并记下编辑时间;已删除的不会被修改 */
    int updateContent(@Param("id") long id, @Param("content") String content);

    /** 标记删除:显示为"该留言已删除",内容不再返回,下面的回复保留 */
    int softDelete(@Param("id") long id);

    /** 删除;顶层留言的回复由外键级联一起删除 */
    int delete(@Param("id") long id);
}
