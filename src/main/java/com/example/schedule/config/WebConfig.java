package com.example.schedule.config;

import jakarta.servlet.MultipartConfigElement;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** 注册登录拦截器(静态页面不拦截,数据都走 /api);上传文件大小限制 */
@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final AuthInterceptor authInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor).addPathPatterns("/api/**");
    }

    /**
     * 上传限制:单个文件 2MB(头像),整个请求 3MB。
     * 写在代码里而不是 application.yaml,超出时由 GlobalExceptionHandler 返回 413。
     */
    @Bean
    public MultipartConfigElement multipartConfigElement() {
        return new MultipartConfigElement("", 2L * 1024 * 1024, 3L * 1024 * 1024, 0);
    }
}
