package com.example.schedule.dto;

import com.example.schedule.model.EventParticipant;
import com.example.schedule.model.ScheduleEvent;

import java.util.List;

/** 行程详情:行程本身和全部参与人 */
public record EventDetail(ScheduleEvent event, List<EventParticipant> participants) {
}
