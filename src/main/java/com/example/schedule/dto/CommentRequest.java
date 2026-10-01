package com.example.schedule.dto;

/** 发表留言;parentId 为要回复的那条留言(可以是顶层留言,也可以是回复),不填则为顶层留言 */
public record CommentRequest(String content, Long parentId) {
}
