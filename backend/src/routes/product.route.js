import express from "express";
import productController from "../controllers/product.controller";
import authMiddleware from "../middlewares/auth.middleware";

const router = express.Router();

router.post("/", authMiddleware.verifyTokenUser, productController.createNewProduct);
router.get("/", productController.getAllProduct);
router.get("/detail", productController.getDetailProductById);
router.put("/", authMiddleware.verifyTokenUser, productController.updateProduct);
router.delete("/", authMiddleware.verifyTokenUser, productController.deleteProduct);

module.exports = router;
