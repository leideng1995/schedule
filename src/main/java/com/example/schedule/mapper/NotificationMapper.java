package com.example.schedule.mapper;

import com.example.schedule.model.Notification;
import com.example.schedule.model.ReminderItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** 站内通知 notification */
@Mapper
public interface NotificationMapper {

    int insert(Notification n);

    /**
     * 某人的通知,按新到旧;filter:all 全部 / unread 未读 / comment 给我的留言(留言和回复)。
     * beforeId 不为空时只取比它更早的(加载更多)。带触发人姓名。
     */
    List<Notification> findForUser(@Param("userId") long userId, @Param("filter") String filter,
                                   @Param("beforeId") Long beforeId, @Param("limit") int limit);

    int countUnread(@Param("userId") long userId);

    /** 最新一条通知的 ID,前端据此判断有没有新通知;没有通知时为 null */
    Long latestId(@Param("userId") long userId);

    /** 只能标记自己的 */
    int markRead(@Param("id") long id, @Param("userId") long userId);

    int markAllRead(@Param("userId") long userId, @Param("filter") String filter);

    /** 需要弹窗的提醒:未读的"即将开始"通知,且行程未取消、开始不超过 1 分钟 */
    List<ReminderItem> findPendingReminders(@Param("userId") long userId);

    /**
     * 给 minutes 分钟内就要开始的行程的参加者(已同意的参与人)生成"即将开始"提醒;
     * 已经为这次开始时间提醒过的不重复生成(改了时间会重新提醒)。返回生成的条数。
     */
    int insertDueReminders(@Param("minutes") int minutes);
}
