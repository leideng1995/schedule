package com.example.schedule.controller;

import com.example.schedule.config.AuthInterceptor;
import com.example.schedule.model.SysUser;
import com.example.schedule.model.UserAvatar;
import com.example.schedule.service.AvatarService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.time.Duration;
import java.util.Map;

/** 用户头像:查看(登录后)、上传 / 移除自己的、管理员移除别人的 */
@RestController
@RequiredArgsConstructor
public class AvatarController {

    private final AvatarService avatarService;

    /** 所有有头像的用户 → 版本号;没有头像的用户显示姓名首字 */
    @GetMapping("/api/users/avatars")
    public Map<Long, Long> versions() {
        return avatarService.versions();
    }

    /**
     * 头像图片。地址里带版本号(?v=),换头像后地址就变了,所以可以放心长时间缓存。
     * 内容一律按 PNG 返回,并禁止浏览器猜测类型、禁止执行脚本。
     */
    @GetMapping("/api/users/{id}/avatar")
    public ResponseEntity<byte[]> image(@PathVariable long id) {
        UserAvatar a = avatarService.find(id);
        if (a == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePrivate())
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Security-Policy", "default-src 'none'; sandbox")
                .body(a.getImage());
    }

    /** 上传自己的头像(表单字段名 file),返回新的版本号 */
    @PostMapping(value = "/api/auth/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Long> upload(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me,
                                    @RequestParam(value = "file", required = false) MultipartFile file) {
        return Map.of("version", avatarService.upload(me, file));
    }

    @DeleteMapping("/api/auth/avatar")
    public void remove(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me) {
        avatarService.remove(me);
    }

    /** 管理员移除别人的头像 */
    @DeleteMapping("/api/admin/users/{id}/avatar")
    public void removeByAdmin(@RequestAttribute(AuthInterceptor.CURRENT_USER) SysUser me, @PathVariable long id) {
        avatarService.removeByAdmin(me, id);
    }
}
