import { Router, type IRouter } from "express";
import healthRouter from "./health";
import imageRouter from "./image";

const router: IRouter = Router();

router.use(healthRouter);
router.use(imageRouter);

export default router;
