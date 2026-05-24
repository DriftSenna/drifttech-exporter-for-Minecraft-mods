import { Router, type IRouter } from "express";
import healthRouter from "./health";
import downloadsRouter from "./downloads";
import authRouter from "./auth";
import backupsRouter from "./backups";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(backupsRouter);
router.use(downloadsRouter);

export default router;
