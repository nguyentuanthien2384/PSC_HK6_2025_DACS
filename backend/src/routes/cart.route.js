import express from "express";
import cartController from "../controllers/cart.controller";
import authMiddleware from "../middlewares/auth.middleware";

const router = express.Router();

router.post("/add-item", authMiddleware.verifyTokenUser, cartController.addToCart);
router.get("/my-cart", authMiddleware.verifyTokenUser, cartController.getMyCart);
router.put("/update-item", authMiddleware.verifyTokenUser, cartController.updateCartItem);
router.delete("/remove-item", authMiddleware.verifyTokenUser, cartController.removeCartItem);

module.exports = router;
