package com.example.schedule.common;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** 业务错误的快捷写法,错误说明会原样返回给前端 */
public final class Biz {

    private Biz() {
    }

    public static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    public static ResponseStatusException forbidden(String message) {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, message);
    }

    public static ResponseStatusException notFound(String message) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }

    /** 必填文本:去掉首尾空格后不能为空,且不超过 max 个字符 */
    public static String required(String value, String field, int max) {
        String v = value == null ? "" : value.trim();
        if (v.isEmpty()) {
            throw bad(field + "不能为空");
        }
        return limit(v, field, max);
    }

    /** 选填文本:空白视为 null */
    public static String optional(String value, String field, int max) {
        String v = value == null ? "" : value.trim();
        return v.isEmpty() ? null : limit(v, field, max);
    }

    private static String limit(String v, String field, int max) {
        if (v.length() > max) {
            throw bad(field + "不能超过 " + max + " 个字");
        }
        return v;
    }
}
