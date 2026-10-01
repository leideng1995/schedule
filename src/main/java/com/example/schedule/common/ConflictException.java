package com.example.schedule.common;

import com.example.schedule.model.Conflict;
import lombok.Getter;

import java.util.List;

/**
 * 行程时间冲突。返回 409 和冲突明细,前端提示用户后可以带 force=true 重新提交(冲突只提示,不强制禁止)。
 */
@Getter
public class ConflictException extends RuntimeException {

    private final List<Conflict> conflicts;

    public ConflictException(String message, List<Conflict> conflicts) {
        super(message);
        this.conflicts = conflicts;
    }
}
