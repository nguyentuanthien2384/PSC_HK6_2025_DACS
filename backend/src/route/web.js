import express from "express";
import userController from '../controllers/userController';
import allcodeController from '../controllers/allcodeController';
import productController from '../controllers/productController';
import shopCartController from '../controllers/shopCartController';
import middlewareControllers from '../middlewares/jwtVerify';
let router = express.Router();

let initwebRoutes = (app) => {
    router.get("/", (req, res) => {
        return res.send("hello")
    })
    //=====================API USER==========================//
    router.post('/api/create-new-user', userController.handleCreateNewUser)
    router.put('/api/update-user', middlewareControllers.verifyTokenUser, userController.handleUpdateUser)
    router.delete('/api/delete-user', middlewareControllers.verifyTokenAdmin, userController.handleDeleteUser)
    router.post('/api/login', userController.handleLogin)
    router.post('/api/changepassword', middlewareControllers.verifyTokenUser, userController.handleChangePassword)
    router.get('/api/get-all-user', middlewareControllers.verifyTokenAdmin, userController.getAllUser)
    router.get('/api/get-detail-user-by-id', userController.getDetailUserById)
    router.post('/api/send-verify-email', middlewareControllers.verifyTokenUser, userController.handleSendVerifyEmailUser)
    router.post('/api/verify-email', middlewareControllers.verifyTokenUser, userController.handleVerifyEmailUser)
    router.post('/api/send-forgotpassword-email', userController.handleSendEmailForgotPassword)
    router.post('/api/forgotpassword-email', userController.handleForgotPassword)
    router.get('/api/check-phonenumber-email', userController.checkPhonenumberEmail)
    router.get('/api/get-detail-user-by-email', userController.getDetailUserByEmail)
    //===================API ALLCODE========================//
    router.post('/api/create-new-all-code', middlewareControllers.verifyTokenAdmin, allcodeController.handleCreateNewAllCode)
    router.put('/api/update-all-code', middlewareControllers.verifyTokenAdmin, allcodeController.handleUpdateAllCode)
    router.delete('/api/delete-all-code', middlewareControllers.verifyTokenAdmin, allcodeController.handleDeleteAllCode)
    router.get('/api/get-all-code', allcodeController.getAllCodeService)
    router.get('/api/get-list-allcode', allcodeController.getListAllCodeService)
    router.get('/api/get-detail-all-code-by-id', allcodeController.getDetailAllCodeById)

    //==================API PRODUCT=========================//
    router.post('/api/create-new-product', middlewareControllers.verifyTokenAdmin, productController.createNewProduct)
    router.put('/api/update-product', middlewareControllers.verifyTokenAdmin, productController.updateProduct)
    router.get('/api/get-all-product-admin', middlewareControllers.verifyTokenAdmin, productController.getAllProductAdmin)
    router.get('/api/get-all-product-user', productController.getAllProductUser)
    router.post('/api/unactive-product', middlewareControllers.verifyTokenAdmin, productController.UnactiveProduct)
    router.post('/api/active-product', middlewareControllers.verifyTokenAdmin, productController.ActiveProduct)
    router.get('/api/get-detail-product-by-id', productController.getDetailProductById)
    router.get('/api/get-all-product-detail-by-id', productController.getAllProductDetailById)
    router.get('/api/get-all-product-detail-image-by-id', productController.getAllProductDetailImageById)
    router.post('/api/create-new-product-detail', middlewareControllers.verifyTokenAdmin, productController.createNewProductDetail)
    router.put('/api/update-product-detail', middlewareControllers.verifyTokenAdmin, productController.updateProductDetail)
    router.get('/api/get-product-detail-by-id', productController.getDetailProductDetailById)
    router.post('/api/create-product-detail-image', middlewareControllers.verifyTokenAdmin, productController.createNewProductDetailImage)
    router.get('/api/get-product-detail-image-by-id', productController.getDetailProductImageById)
    router.put('/api/update-product-detail-image', middlewareControllers.verifyTokenAdmin, productController.updateProductDetailImage)
    router.delete('/api/delete-product-detail-image', middlewareControllers.verifyTokenAdmin, productController.deleteProductDetailImage)
    router.delete('/api/delete-product-detail', middlewareControllers.verifyTokenAdmin, productController.deleteProductDetail)
    router.get('/api/get-all-product-detail-size-by-id', productController.getAllProductDetailSizeById)
    router.post('/api/create-product-detail-size', middlewareControllers.verifyTokenAdmin, productController.createNewProductDetailSize)
    router.get('/api/get-detail-product-detail-size-by-id', productController.getDetailProductDetailSizeById)
    router.put('/api/update-product-detail-size', middlewareControllers.verifyTokenAdmin, productController.updateProductDetailSize)
    router.delete('/api/delete-product-detail-size', middlewareControllers.verifyTokenAdmin, productController.deleteProductDetailSize)
    router.get('/api/get-product-feature', productController.getProductFeature)
    router.get('/api/get-product-new', productController.getProductNew)
    router.get('/api/get-product-shopcart', productController.getProductShopCart)
    router.get('/api/get-product-recommend', productController.getProductRecommend)

    //=================API SHOPCART==========================//
    router.post('/api/add-shopcart', middlewareControllers.verifyTokenUser, shopCartController.addShopCart)
    router.get('/api/get-all-shopcart-by-userId', middlewareControllers.verifyTokenUser, shopCartController.getAllShopCartByUserId)
    router.delete('/api/delete-item-shopcart', middlewareControllers.verifyTokenUser, shopCartController.deleteItemShopCart)

    return app.use("/", router);
}

module.exports = initwebRoutes;
