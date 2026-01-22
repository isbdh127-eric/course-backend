// section.routes.js
import { Router } from "express";
import { listSectionCards } from "./section.controller.js";

const router = Router();

// SECTION-CARDS（課程卡）
router.get("/cards", listSectionCards);

export default router;
