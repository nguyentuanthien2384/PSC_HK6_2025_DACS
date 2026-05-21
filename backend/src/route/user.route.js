import express from "express";
import userController from "../controllers/user.controller";
import authMiddleware from "../middlewares/auth.middleware";

const router = express.Router();

router.get("/me", authMiddleware.verifyTokenUser, userController.getMe);

module.exports = router;
