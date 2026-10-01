package com.example.schedule.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

/** 邮箱重置密码的一次性令牌 password_reset_token(只存令牌的 SHA-256) */
@Mapper
public interface PasswordResetTokenMapper {

    int insert(@Param("userId") long userId, @Param("tokenHash") String tokenHash,
               @Param("expiresAt") LocalDateTime expiresAt, @Param("requestIp") String requestIp);

    /** 未使用、未过期的令牌对应的用户 ID;没有则为 null */
    Long findValidUserId(@Param("tokenHash") String tokenHash);

    /** 标记为已使用;返回 1 表示这次抢到了(同一令牌并发提交时只有一个成功) */
    int markUsed(@Param("tokenHash") String tokenHash);

    /** 让这个用户其余未使用的令牌全部失效(申请了新的,或者已经重置成功) */
    int invalidateForUser(@Param("userId") long userId);

    /** 清理一天前就已过期的记录 */
    int deleteExpired();
}
