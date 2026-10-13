import express from "express";
import userController from '../controllers/userController';
import allcodeController from '../controllers/allcodeController';
import bannerController from '../controllers/bannerController';
import productController from '../controllers/productController';
import shopCartController from '../controllers/shopCartController';
import orderController from '../controllers/orderController';
import addressUserController from '../controllers/addressUserController';
import typeshipController from '../controllers/typeshipController';
import voucherController from '../controllers/voucherController';
import blogController from '../controllers/blogController';
import commentController from '../controllers/commentController';
import supplierController from '../controllers/supplierController';
import receiptController from '../controllers/receiptController';
import messageController from '../controllers/messageController';
import statisticController from '../controllers/statisticController';
import middlewareControllers from '../middlewares/jwtVerify';
const notificationController = require('../controllers/notificationController');
const shippingProviderController = require('../controllers/shippingProviderController');
const afterSalesController = require('../controllers/afterSalesController');
const paymentController = require('../controllers/paymentController');
const adminOperationsController = require('../controllers/adminOperationsController');
const adminInventoryController = require('../controllers/adminInventoryController');
const adminCatalogController = require('../controllers/adminCatalogController');
const adminAccountController = require('../controllers/adminAccountController');
let router = express.Router();

let initwebRoutes = (app) => {
    router.get('/api/admin/operations/dashboard', middlewareControllers.verifyTokenAdmin, adminOperationsController.dashboard);
    router.get('/api/admin/operations/orders', middlewareControllers.verifyTokenAdmin, adminOperationsController.orders);
    router.get('/api/admin/operations/returns', middlewareControllers.verifyTokenAdmin, adminOperationsController.returns);
    router.post('/api/admin/operations/bulk', middlewareControllers.verifyTokenAdmin, adminOperationsController.bulk);
    router.get('/api/admin/inventory', middlewareControllers.verifyTokenAdmin, adminInventoryController.list);
    router.get('/api/admin/inventory/:variantId/history', middlewareControllers.verifyTokenAdmin, adminInventoryController.history);
    router.post('/api/admin/inventory/count', middlewareControllers.verifyTokenAdmin, adminInventoryController.countStock);
    router.get('/api/admin/catalog', middlewareControllers.verifyTokenOwner, adminCatalogController.list);
    router.post('/api/admin/catalog/status', middlewareControllers.verifyTokenOwner, adminCatalogController.updateStatus);
    router.get('/api/admin/accounts', middlewareControllers.verifyTokenOwner, adminAccountController.list);
    router.post('/api/admin/accounts/change', middlewareControllers.verifyTokenOwner, adminAccountController.change);
    router.get('/api/admin/audit', middlewareControllers.verifyTokenOwner, adminAccountController.audit);
    router.get('/api/notifications', middlewareControllers.verifyTokenUser, notificationController.list);
    router.post('/api/notifications/read', middlewareControllers.verifyTokenUser, notificationController.read);
    router.post('/api/notifications/read-all', middlewareControllers.verifyTokenUser, notificationController.readAll);
    router.get('/api/shipping/providers', middlewareControllers.verifyTokenAdmin, shippingProviderController.providers);
    router.post('/api/shipping/book', middlewareControllers.verifyTokenAdmin, shippingProviderController.book);
    router.post('/api/shipping/sync', middlewareControllers.verifyTokenAdmin, shippingProviderController.sync);
    router.post('/api/shipping/cancel', middlewareControllers.verifyTokenAdmin, shippingProviderController.cancel);
    router.post('/api/shipping/webhooks/ghn', shippingProviderController.ghnWebhook);
    router.post('/api/shipping/webhooks/ghtk', shippingProviderController.ghtkWebhook);
    router.post('/api/returns/request', middlewareControllers.verifyTokenUser, afterSalesController.request);
    router.post('/api/returns/review', middlewareControllers.verifyTokenAdmin, afterSalesController.review);
    router.post('/api/returns/ship', middlewareControllers.verifyTokenUser, afterSalesController.ship);
    router.post('/api/returns/receive', middlewareControllers.verifyTokenAdmin, afterSalesController.receive);
    router.post('/api/returns/refund/manual', middlewareControllers.verifyTokenAdmin, afterSalesController.manualRefund);
    router.post('/api/returns/:id/refund-online', middlewareControllers.verifyTokenAdmin, afterSalesController.onlineRefund);
    router.post('/api/shipping/fail', middlewareControllers.verifyTokenUser, orderController.reportDeliveryFailure);
    router.post('/api/shipping/retry', middlewareControllers.verifyTokenUser, orderController.retryDelivery);
    router.post('/api/shipping/return', middlewareControllers.verifyTokenUser, orderController.startReturnToWarehouse);
    router.post('/api/shipping/return/receive', middlewareControllers.verifyTokenAdmin, orderController.receiveUndeliveredReturn);
    router.get('/api/payments/vnpay/ipn', paymentController.vnpayIpn);
    router.post('/api/payments/paypal/webhook', paymentController.paypalWebhook);
    router.get('/api/payments/reconciliation', middlewareControllers.verifyTokenAdmin, paymentController.getReconciliation);
    router.post('/api/payments/reconcile', middlewareControllers.verifyTokenAdmin, paymentController.reconcileSession);
    router.post('/api/payments/refund-session', middlewareControllers.verifyTokenAdmin, paymentController.refundSession);
    router.get('/api/payments/refunds', middlewareControllers.verifyTokenAdmin, paymentController.getRefunds);
    router.post('/api/payments/refunds/:id/retry', middlewareControllers.verifyTokenAdmin, paymentController.retryRefund);
    router.get("/", (req, res) => {
        return res.send("hello")
    })
    //=====================API USER==========================//
    router.post('/api/create-new-user', middlewareControllers.optionalTokenUser, userController.handleCreateNewUser)
    router.put('/api/update-user', middlewareControllers.verifyTokenUser, userController.handleUpdateUser)
    router.delete('/api/delete-user', middlewareControllers.verifyTokenOwner, userController.handleDeleteUser)
    router.post('/api/login', userController.handleLogin)
    router.post('/api/changepassword', middlewareControllers.verifyTokenUser, userController.handleChangePassword)
    router.get('/api/get-all-user', middlewareControllers.verifyTokenOwner, userController.getAllUser)
    router.get('/api/get-detail-user-by-id', middlewareControllers.verifyTokenUser, userController.getDetailUserById)
    router.post('/api/send-verify-email', middlewareControllers.verifyTokenUser, userController.handleSendVerifyEmailUser)
    router.post('/api/verify-email', userController.handleVerifyEmailUser)
    router.post('/api/send-forgotpassword-email', userController.handleSendEmailForgotPassword)
    router.post('/api/forgotpassword-email', userController.handleForgotPassword)
    router.get('/api/check-phonenumber-email', userController.checkPhonenumberEmail)
    router.get('/api/get-detail-user-by-email', middlewareControllers.verifyTokenUser, userController.getDetailUserByEmail)
    //===================API ALLCODE========================//
    router.post('/api/create-new-all-code', middlewareControllers.verifyTokenOwner, allcodeController.handleCreateNewAllCode)
    router.put('/api/update-all-code', middlewareControllers.verifyTokenOwner, allcodeController.handleUpdateAllCode)
    router.delete('/api/delete-all-code', middlewareControllers.verifyTokenOwner, allcodeController.handleDeleteAllCode)
    router.get('/api/get-all-code', allcodeController.getAllCodeService)
    router.get('/api/get-all-category-blog', allcodeController.getAllCategoryBlog)
    router.get('/api/get-list-allcode', allcodeController.getListAllCodeService)
    router.get('/api/get-detail-all-code-by-id', allcodeController.getDetailAllCodeById)

    //==================API BANNER=============================//
    router.post('/api/create-new-banner', middlewareControllers.verifyTokenOwner, bannerController.createNewBanner)
    router.get('/api/get-detail-banner', bannerController.getDetailBanner)
    router.get('/api/get-all-banner', bannerController.getAllBanner)
    router.put('/api/update-banner', middlewareControllers.verifyTokenOwner, bannerController.updateBanner)
    router.delete('/api/delete-banner', middlewareControllers.verifyTokenOwner, bannerController.deleteBanner)

    //==================API PRODUCT=========================//
    router.post('/api/create-new-product', middlewareControllers.verifyTokenOwner, productController.createNewProduct)
    router.put('/api/update-product', middlewareControllers.verifyTokenOwner, productController.updateProduct)
    router.get('/api/get-all-product-admin', middlewareControllers.verifyTokenAdmin, productController.getAllProductAdmin)
    router.get('/api/get-all-product-user', productController.getAllProductUser)
    router.post('/api/unactive-product', middlewareControllers.verifyTokenOwner, productController.UnactiveProduct)
    router.post('/api/active-product', middlewareControllers.verifyTokenOwner, productController.ActiveProduct)
    router.get('/api/get-detail-product-by-id', middlewareControllers.optionalTokenUser, productController.getDetailProductById)
    router.get('/api/get-all-product-detail-by-id', productController.getAllProductDetailById)
    router.get('/api/get-all-product-detail-image-by-id', productController.getAllProductDetailImageById)
    router.post('/api/create-new-product-detail', middlewareControllers.verifyTokenOwner, productController.createNewProductDetail)
    router.put('/api/update-product-detail', middlewareControllers.verifyTokenOwner, productController.updateProductDetail)
    router.get('/api/get-product-detail-by-id', productController.getDetailProductDetailById)
    router.post('/api/create-product-detail-image', middlewareControllers.verifyTokenOwner, productController.createNewProductDetailImage)
    router.get('/api/get-product-detail-image-by-id', productController.getDetailProductImageById)
    router.put('/api/update-product-detail-image', middlewareControllers.verifyTokenOwner, productController.updateProductDetailImage)
    router.delete('/api/delete-product-detail-image', middlewareControllers.verifyTokenOwner, productController.deleteProductDetailImage)
    router.delete('/api/delete-product-detail', middlewareControllers.verifyTokenOwner, productController.deleteProductDetail)
    router.get('/api/get-all-product-detail-size-by-id', productController.getAllProductDetailSizeById)
    router.post('/api/create-product-detail-size', middlewareControllers.verifyTokenOwner, productController.createNewProductDetailSize)
    router.get('/api/get-detail-product-detail-size-by-id', productController.getDetailProductDetailSizeById)
    router.put('/api/update-product-detail-size', middlewareControllers.verifyTokenOwner, productController.updateProductDetailSize)
    router.delete('/api/delete-product-detail-size', middlewareControllers.verifyTokenOwner, productController.deleteProductDetailSize)
    router.get('/api/get-product-feature', productController.getProductFeature)
    router.get('/api/get-product-new', productController.getProductNew)
    router.get('/api/get-product-shopcart', middlewareControllers.verifyTokenUser, productController.getProductShopCart)
    router.get('/api/get-product-recommend', productController.getProductRecommend)

    //=================API SHOPCART==========================//
    router.post('/api/add-shopcart', middlewareControllers.verifyTokenUser, shopCartController.addShopCart)
    router.get('/api/get-all-shopcart-by-userId', middlewareControllers.verifyTokenUser, shopCartController.getAllShopCartByUserId)
    router.delete('/api/delete-item-shopcart', middlewareControllers.verifyTokenUser, shopCartController.deleteItemShopCart)

    //=================API ORDER=============================//
    router.post('/api/create-new-order', middlewareControllers.verifyTokenUser, orderController.createNewOrder)
    router.get('/api/get-all-order', middlewareControllers.verifyTokenAdmin, orderController.getAllOrders)
    router.get('/api/get-detail-order', middlewareControllers.verifyTokenUser, orderController.getDetailOrderById)
    router.put('/api/update-status-order', middlewareControllers.verifyTokenUser, orderController.updateStatusOrder)
    router.get('/api/get-all-order-by-user', middlewareControllers.verifyTokenUser, orderController.getAllOrdersByUser)
    router.post('/api/payment-order', middlewareControllers.verifyTokenUser, orderController.paymentOrder)
    router.post('/api/payment-order-success', middlewareControllers.verifyTokenUser, orderController.paymentOrderSuccess)
    router.post('/api/payment-order-vnpay-success', middlewareControllers.verifyTokenUser, orderController.paymentOrderVnpaySuccess)
    router.put('/api/confirm-order', middlewareControllers.verifyTokenUser, orderController.confirmOrder)
    router.get('/api/get-all-order-by-shipper', middlewareControllers.verifyTokenUser, orderController.getAllOrdersByShipper)
    router.get('/api/get-available-order-for-shipper', middlewareControllers.verifyTokenUser, orderController.getAvailableOrdersForShipper)
    router.get('/api/get-active-shipper', middlewareControllers.verifyTokenAdmin, orderController.getActiveShippers)
    router.post('/api/rate-shipper', middlewareControllers.verifyTokenUser, orderController.rateShipper)
    router.post('/api/payment-order-vnpay', middlewareControllers.verifyTokenUser, orderController.paymentOrderVnpay)
    router.post('/api/vnpay_return', middlewareControllers.verifyTokenUser, orderController.confirmOrderVnpay)
    router.put('/api/update-image-order', middlewareControllers.verifyTokenUser, orderController.updateImageOrder)

    //=====================API ADDRESS USER=======================//
    router.post('/api/create-new-address-user', middlewareControllers.verifyTokenUser, addressUserController.createNewAddressUser)
    router.get('/api/get-all-address-user', middlewareControllers.verifyTokenUser, addressUserController.getAllAddressUserByUserId)
    router.delete('/api/delete-address-user', middlewareControllers.verifyTokenUser, addressUserController.deleteAddressUser)
    router.put('/api/edit-address-user', middlewareControllers.verifyTokenUser, addressUserController.editAddressUser)
    router.post('/api/set-default-address-user', middlewareControllers.verifyTokenUser, addressUserController.setDefaultAddressUser)
    router.get('/api/get-detail-address-user-by-id', middlewareControllers.verifyTokenUser, addressUserController.getDetailAddressUserById)

    //====================API TYPE SHIP==========================//
    router.post('/api/create-new-typeship', middlewareControllers.verifyTokenOwner, typeshipController.createNewTypeShip)
    router.get('/api/get-detail-typeship', typeshipController.getDetailTypeshipById)
    router.get('/api/get-all-typeship', typeshipController.getAllTypeship)
    router.put('/api/update-typeship', middlewareControllers.verifyTokenOwner, typeshipController.updateTypeship)
    router.delete('/api/delete-typeship', middlewareControllers.verifyTokenOwner, typeshipController.deleteTypeship)

    //===================API TYPE VOUCHER====================//
    router.post('/api/create-new-typevoucher', middlewareControllers.verifyTokenOwner, voucherController.createNewTypeVoucher)
    router.get('/api/get-detail-typevoucher', voucherController.getDetailTypeVoucherById)
    router.get('/api/get-all-typevoucher', voucherController.getAllTypeVoucher)
    router.put('/api/update-typevoucher', middlewareControllers.verifyTokenOwner, voucherController.updateTypeVoucher)
    router.delete('/api/delete-typevoucher', middlewareControllers.verifyTokenOwner, voucherController.deleteTypeVoucher)
    router.get('/api/get-select-typevoucher', voucherController.getSelectTypeVoucher)
    //=====================API VOUCHER======================//
    router.post('/api/create-new-voucher', middlewareControllers.verifyTokenOwner, voucherController.createNewVoucher)
    router.get('/api/get-detail-voucher', voucherController.getDetailVoucherById)
    router.get('/api/get-all-voucher', voucherController.getAllVoucher)
    router.put('/api/update-voucher', middlewareControllers.verifyTokenOwner, voucherController.updateVoucher)
    router.delete('/api/delete-voucher', middlewareControllers.verifyTokenOwner, voucherController.deleteVoucher)
    router.post('/api/save-user-voucher', middlewareControllers.verifyTokenUser, voucherController.saveUserVoucher)
    router.get('/api/get-all-voucher-by-userid', middlewareControllers.verifyTokenUser, voucherController.getAllVoucherByUserId)

    //=====================API BLOG=========================//
    router.post('/api/create-new-blog', middlewareControllers.verifyTokenOwner, blogController.createNewBlog)
    router.get('/api/get-detail-blog', middlewareControllers.optionalTokenUser, blogController.getDetailBlogById)
    router.get('/api/get-all-blog', blogController.getAllBlog)
    router.put('/api/update-blog', middlewareControllers.verifyTokenOwner, blogController.updateBlog)
    router.delete('/api/delete-blog', middlewareControllers.verifyTokenOwner, blogController.deleteBlog)
    router.get('/api/get-feature-blog', blogController.getFeatureBlog)
    router.get('/api/get-new-blog', blogController.getNewBlog)
    //=======================API REVIEW======================//
    router.post('/api/create-new-review', middlewareControllers.verifyTokenUser, commentController.createNewReview)
    router.get('/api/get-all-review-by-productId', middlewareControllers.optionalTokenUser, commentController.getAllReviewByProductId)
    router.post('/api/reply-review', middlewareControllers.verifyTokenAdmin, commentController.ReplyReview)
    router.delete('/api/delete-review', middlewareControllers.verifyTokenAdmin, commentController.deleteReview)
    //=======================API COMMENT======================//
    router.post('/api/create-new-comment', middlewareControllers.verifyTokenUser, commentController.createNewComment)
    router.get('/api/get-all-comment-by-blogId', commentController.getAllCommentByBlogId)
    router.post('/api/reply-comment', middlewareControllers.verifyTokenAdmin, commentController.ReplyComment)
    router.delete('/api/delete-comment', middlewareControllers.verifyTokenAdmin, commentController.deleteComment)

    //=================API SUPPLIER================================//
    router.post('/api/create-new-supplier', middlewareControllers.verifyTokenAdmin, supplierController.createNewSupplier)
    router.get('/api/get-detail-supplier', middlewareControllers.verifyTokenAdmin, supplierController.getDetailSupplierById)
    router.get('/api/get-all-supplier', middlewareControllers.verifyTokenAdmin, supplierController.getAllSupplier)
    router.put('/api/update-supplier', middlewareControllers.verifyTokenAdmin, supplierController.updateSupplier)
    router.delete('/api/delete-supplier', middlewareControllers.verifyTokenAdmin, supplierController.deleteSupplier)

    //=================API RECEIPT================================//
    router.post('/api/create-new-receipt', middlewareControllers.verifyTokenAdmin, receiptController.createNewReceipt)
    router.get('/api/get-detail-receipt', middlewareControllers.verifyTokenAdmin, receiptController.getDetailReceiptById)
    router.get('/api/get-all-receipt', middlewareControllers.verifyTokenAdmin, receiptController.getAllReceipt)
    router.put('/api/update-receipt', middlewareControllers.verifyTokenAdmin, receiptController.updateReceipt)
    router.delete('/api/delete-receipt', middlewareControllers.verifyTokenAdmin, receiptController.deleteReceipt)
    router.post('/api/create-new-detail-receipt', middlewareControllers.verifyTokenAdmin, receiptController.createNewReceiptDetail)

    //=================API MESSAGE================================//
    router.post('/api/create-new-room', middlewareControllers.verifyTokenUser, messageController.createNewRoom)
    // kebab-case routes (frontend mới đang dùng)
    router.post('/api/send-message', middlewareControllers.verifyTokenUser, messageController.sendMessage)
    router.get('/api/load-message', middlewareControllers.verifyTokenUser, messageController.loadMessage)
    router.get('/api/list-room-of-user', middlewareControllers.verifyTokenUser, messageController.listRoomOfUser)
    router.get('/api/list-room-of-admin', middlewareControllers.verifyTokenAdmin, messageController.listRoomOfAdmin)
    // camelCase routes (tương thích source zip cũ)
    router.post('/api/sendMessage', middlewareControllers.verifyTokenUser, messageController.sendMessage)
    router.get('/api/loadMessage', middlewareControllers.verifyTokenUser, messageController.loadMessage)
    router.get('/api/listRoomOfUser', middlewareControllers.verifyTokenUser, messageController.listRoomOfUser)
    router.get('/api/listRoomOfAdmin', middlewareControllers.verifyTokenAdmin, messageController.listRoomOfAdmin)

    //=================API STATISTIC==============================//
    router.get('/api/get-count-card-statistic', middlewareControllers.verifyTokenOwner, statisticController.getCountCardStatistic)
    router.get('/api/get-count-status-order', middlewareControllers.verifyTokenOwner, statisticController.getCountStatusOrder)
    router.get('/api/get-statistic-by-month', middlewareControllers.verifyTokenOwner, statisticController.getStatisticByMonth)
    router.get('/api/get-statistic-by-day', middlewareControllers.verifyTokenOwner, statisticController.getStatisticByDay)
    router.get('/api/get-statistic-overturn', middlewareControllers.verifyTokenOwner, statisticController.getStatisticOverturn)
    router.get('/api/get-statistic-revenue', middlewareControllers.verifyTokenOwner, statisticController.getStatisticOverturn)
    router.get('/api/get-statistic-profit', middlewareControllers.verifyTokenOwner, statisticController.getStatisticProfit)
    router.get('/api/get-statistic-stock-product', middlewareControllers.verifyTokenAdmin, statisticController.getStatisticStockProduct)

    return app.use("/", router);
}

module.exports = initwebRoutes;
