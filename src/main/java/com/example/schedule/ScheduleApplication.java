package com.example.schedule;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * @EnableAsync:邮件通知在后台线程发送,不拖慢预约、邀请等操作;
 * @EnableScheduling:定时生成"活动即将开始"的提醒(ReminderJob)
 */
@SpringBootApplication
@EnableAsync
@EnableScheduling
public class ScheduleApplication {

    public static void main(String[] args) {
        SpringApplication.run(ScheduleApplication.class, args);
    }

}
