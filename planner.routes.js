import { Router } from "express";
import { addPlannerItem } from "./planner.controller.js";

const router = Router();

// 不用 requireAuth，直接交給 controller 用 x-user-id
router.post("/", addPlannerItem);

export default router;
