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
