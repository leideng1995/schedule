package com.example.schedule;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

/** @EnableAsync:邮件通知在后台线程发送,不拖慢预约、邀请等操作 */
@SpringBootApplication
@EnableAsync
public class ScheduleApplication {

    public static void main(String[] args) {
        SpringApplication.run(ScheduleApplication.class, args);
    }

}
