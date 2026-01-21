// course.routes.js
import { Router } from "express";
import {
  listCourses,
  searchCourses,
  getCourseDetail,
  getCourseSchedules,
} from "./course.controller.js";

const router = Router();

// COURSE-LIST
router.get("/", listCourses);

// COURSE-SEARCH
router.get("/search", searchCourses);

// COURSE-DETAIL（含 sections + schedules）
router.get("/:id", getCourseDetail);

// 保留你原本那條（更乾淨統一）
router.get("/:id/schedules", getCourseSchedules);

export default router;
