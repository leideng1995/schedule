package com.example.schedule.config;

import com.example.schedule.common.ConflictException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/** 统一错误格式:{"message": "..."};时间冲突另带 conflicts 明细 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<Map<String, Object>> conflict(ConflictException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("message", e.getMessage(), "conflicts", e.getConflicts()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> unreadable(HttpMessageNotReadableException e) {
        return body(HttpStatus.BAD_REQUEST, "请求内容格式不正确");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> other(Exception e) {
        if (e instanceof ResponseStatusException rse) {
            return body(rse.getStatusCode(), rse.getReason());
        }
        if (e instanceof ErrorResponse er) {
            // Spring MVC 自己的错误(404、方法不支持、参数类型不对等)
            return body(er.getStatusCode(), er.getBody().getDetail());
        }
        log.error("未处理的异常", e);
        return body(HttpStatus.INTERNAL_SERVER_ERROR, "服务器内部错误");
    }

    private static ResponseEntity<Map<String, Object>> body(HttpStatusCode status, String message) {
        return ResponseEntity.status(status).body(Map.of("message", message == null ? "请求失败" : message));
    }
}
