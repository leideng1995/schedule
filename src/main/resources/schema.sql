-- 用户:role = USER(普通用户)/ ADMIN(管理员)
CREATE TABLE IF NOT EXISTS sys_user (
    user_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name  VARCHAR(50)  NOT NULL,
    -- 邮箱,统一存小写,可用于登录;早期用户可能为空(MySQL 唯一索引允许多个 NULL)
    email         VARCHAR(100) NULL,
    role          VARCHAR(20)  NOT NULL,
    -- 1 = 管理员重置过密码,用户登录后必须先修改密码
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_email (email)
);

-- 早期建的 sys_user 表没有 must_change_password,没有时补上(MySQL 不支持 ADD COLUMN IF NOT EXISTS)
SET @ddl = (SELECT IF(COUNT(*) = 0,
        'ALTER TABLE sys_user ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE AFTER role',
        'DO 0')
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'sys_user' AND column_name = 'must_change_password');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 同上:早期的表没有 email 列和它的唯一索引时补上
SET @ddl = (SELECT IF(COUNT(*) = 0,
        'ALTER TABLE sys_user ADD COLUMN email VARCHAR(100) NULL AFTER display_name, ADD UNIQUE KEY uk_user_email (email)',
        'DO 0')
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'sys_user' AND column_name = 'email');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 组:need_consent = 0 为管理员建的组(成员直接加入),1 为普通用户建的组(成员同意后才算加入)
CREATE TABLE IF NOT EXISTS user_group (
    group_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    owner_id     BIGINT       NOT NULL,
    need_consent BOOLEAN      NOT NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_group_owner FOREIGN KEY (owner_id) REFERENCES sys_user (user_id)
);

-- 组成员:status = PENDING(待同意)/ ACCEPTED(已加入)/ DECLINED(已拒绝);组的创建者不在此表
CREATE TABLE IF NOT EXISTS group_member (
    group_id     BIGINT      NOT NULL,
    user_id      BIGINT      NOT NULL,
    status       VARCHAR(20) NOT NULL,
    invited_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at DATETIME    NULL,
    PRIMARY KEY (group_id, user_id),
    CONSTRAINT fk_member_group FOREIGN KEY (group_id) REFERENCES user_group (group_id) ON DELETE CASCADE,
    CONSTRAINT fk_member_user FOREIGN KEY (user_id) REFERENCES sys_user (user_id)
);

-- 行程:status = ACTIVE / CANCELLED;group_id 不为空表示是组内邀约
CREATE TABLE IF NOT EXISTS schedule_event (
    event_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
    title       VARCHAR(100)  NOT NULL,
    location    VARCHAR(200)  NULL,
    description VARCHAR(1000) NULL,
    start_time  DATETIME      NOT NULL,
    end_time    DATETIME      NOT NULL,
    owner_id    BIGINT        NOT NULL,
    group_id    BIGINT        NULL,
    status      VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE',
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_event_time (start_time, end_time),
    CONSTRAINT fk_event_owner FOREIGN KEY (owner_id) REFERENCES sys_user (user_id),
    CONSTRAINT fk_event_group FOREIGN KEY (group_id) REFERENCES user_group (group_id) ON DELETE SET NULL
);

-- 行程参与人:普通用户发起的行程,发起人自己也是一条 ACCEPTED;被邀请人先是 PENDING
-- 冲突检测只看 ACCEPTED 的参与记录
CREATE TABLE IF NOT EXISTS event_participant (
    event_id     BIGINT      NOT NULL,
    user_id      BIGINT      NOT NULL,
    status       VARCHAR(20) NOT NULL,
    invited_by   BIGINT      NULL,
    invited_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at DATETIME    NULL,
    PRIMARY KEY (event_id, user_id),
    INDEX idx_participant_user (user_id, status),
    CONSTRAINT fk_participant_event FOREIGN KEY (event_id) REFERENCES schedule_event (event_id) ON DELETE CASCADE,
    CONSTRAINT fk_participant_user FOREIGN KEY (user_id) REFERENCES sys_user (user_id)
);

-- 邮箱重置密码的一次性令牌:只存令牌的 SHA-256,不存原文(数据库泄露也无法拿来重置密码);
-- 30 分钟内有效,用过或申请了新的就失效
CREATE TABLE IF NOT EXISTS password_reset_token (
    token_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT      NOT NULL,
    token_hash CHAR(64)    NOT NULL UNIQUE,
    expires_at DATETIME    NOT NULL,
    used_at    DATETIME    NULL,
    request_ip VARCHAR(64) NULL,
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reset_user (user_id),
    CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES sys_user (user_id) ON DELETE CASCADE
);

-- 行程留言:发起人和未拒绝的参与人可以留言;删除行程时一并删除
-- 回复只有一层:parent_id 为所属的那条顶层留言(顶层留言为 NULL),reply_to_user_id 为被回复的人;
-- 留言人删除自己的顶层留言、而下面有别人的回复时,只标记 deleted_at(显示"该留言已删除",回复保留);
-- 管理员删除顶层留言时,它下面的回复一起删除
CREATE TABLE IF NOT EXISTS event_comment (
    comment_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id         BIGINT       NOT NULL,
    user_id          BIGINT       NOT NULL,
    parent_id        BIGINT       NULL,
    reply_to_user_id BIGINT       NULL,
    content          VARCHAR(500) NOT NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    edited_at        DATETIME     NULL,
    deleted_at       DATETIME     NULL,
    INDEX idx_comment_event (event_id, created_at),
    INDEX idx_comment_parent (parent_id),
    CONSTRAINT fk_comment_event FOREIGN KEY (event_id) REFERENCES schedule_event (event_id) ON DELETE CASCADE,
    CONSTRAINT fk_comment_user FOREIGN KEY (user_id) REFERENCES sys_user (user_id),
    CONSTRAINT fk_comment_parent FOREIGN KEY (parent_id) REFERENCES event_comment (comment_id) ON DELETE CASCADE,
    CONSTRAINT fk_comment_reply_to FOREIGN KEY (reply_to_user_id) REFERENCES sys_user (user_id)
);

-- 早期建的 event_comment 表没有回复相关的列,没有时补上
SET @ddl = (SELECT IF(COUNT(*) = 0,
        'ALTER TABLE event_comment
            ADD COLUMN parent_id BIGINT NULL AFTER user_id,
            ADD COLUMN reply_to_user_id BIGINT NULL AFTER parent_id,
            ADD INDEX idx_comment_parent (parent_id),
            ADD CONSTRAINT fk_comment_parent FOREIGN KEY (parent_id) REFERENCES event_comment (comment_id) ON DELETE CASCADE,
            ADD CONSTRAINT fk_comment_reply_to FOREIGN KEY (reply_to_user_id) REFERENCES sys_user (user_id)',
        'DO 0')
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'event_comment' AND column_name = 'parent_id');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 站内通知:user_id 为收件人;title / content 为纯文本,显示时转义;read_at 为空表示未读。
-- 行程、组、留言删除后通知保留(组和留言的关联置空,行程取消不会删除记录)
CREATE TABLE IF NOT EXISTS notification (
    notification_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT       NOT NULL,
    type            VARCHAR(30)  NOT NULL,
    title           VARCHAR(200) NOT NULL,
    content         VARCHAR(500) NULL,
    actor_id        BIGINT       NULL,
    event_id        BIGINT       NULL,
    group_id        BIGINT       NULL,
    comment_id      BIGINT       NULL,
    read_at         DATETIME     NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notify_user (user_id, notification_id),
    INDEX idx_notify_unread (user_id, read_at),
    INDEX idx_notify_reminder (type, event_id, user_id),
    CONSTRAINT fk_notify_user FOREIGN KEY (user_id) REFERENCES sys_user (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_notify_actor FOREIGN KEY (actor_id) REFERENCES sys_user (user_id) ON DELETE SET NULL,
    CONSTRAINT fk_notify_event FOREIGN KEY (event_id) REFERENCES schedule_event (event_id) ON DELETE CASCADE,
    CONSTRAINT fk_notify_group FOREIGN KEY (group_id) REFERENCES user_group (group_id) ON DELETE SET NULL,
    CONSTRAINT fk_notify_comment FOREIGN KEY (comment_id) REFERENCES event_comment (comment_id) ON DELETE SET NULL
);

-- 早期建的 event_comment 表没有 deleted_at,没有时补上
SET @ddl = (SELECT IF(COUNT(*) = 0,
        'ALTER TABLE event_comment ADD COLUMN deleted_at DATETIME NULL AFTER created_at',
        'DO 0')
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'event_comment' AND column_name = 'deleted_at');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 早期建的 event_comment 表没有 edited_at(留言人编辑过的时间),没有时补上
SET @ddl = (SELECT IF(COUNT(*) = 0,
        'ALTER TABLE event_comment ADD COLUMN edited_at DATETIME NULL AFTER created_at',
        'DO 0')
    FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'event_comment' AND column_name = 'edited_at');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 用户头像:服务器统一裁成 256x256 的 PNG 后存这里(上传的原图不保存);删除用户时一并删除
CREATE TABLE IF NOT EXISTS user_avatar (
    user_id    BIGINT     PRIMARY KEY,
    image      MEDIUMBLOB NOT NULL,
    updated_at DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_avatar_user FOREIGN KEY (user_id) REFERENCES sys_user (user_id) ON DELETE CASCADE
);
