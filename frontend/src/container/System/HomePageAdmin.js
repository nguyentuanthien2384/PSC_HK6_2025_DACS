import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import Footer from "./Footer";
import Header from "./Header";
import SideBar from "./SideBar";
import Home from "./Home";

import ManageUser from "./User/ManageUser";
import Adduser from "./User/Adduser";
import Information from "./User/Information";
import ChangePassword from "./User/ChangePassword";

import AddProduct from "./Product/AddProduct";
import ManageProduct from "./Product/ManageProduct";
import EditProduct from "./Product/EditProduct";
import ManageProductDetail from "./Product/ProductDetail/ManageProductDetail";
import ManageProductImage from "./Product/ProductImage/ManageProductImage";
import AddProductDetail from "./Product/ProductDetail/AddProductDetail";
import EditProductDetail from "./Product/ProductDetail/EditProductDetail";

import ManageOrder from "./Order/ManageOrder";
import DetailOrder from "./Order/DetailOrder";

import AddTypeVoucher from "./Voucher/AddTypeVoucher";
import ManageTypeVoucher from "./Voucher/ManageTypeVoucher";
import AddVoucher from "./Voucher/AddVoucher";
import ManageVoucher from "./Voucher/ManageVoucher";

import AddBlog from "./Blog/AddBlog";
import ManageBlog from "./Blog/ManageBlog";

import AddBanner from "./Banner/AddBanner";
import ManageBanner from "./Banner/ManageBanner";

import AddSupplier from "./Supplier/AddSupplier";
import ManageSupplier from "./Supplier/ManageSupplier";

import AddReceipt from "./Receipt/AddReceipt";
import ManageReceipt from "./Receipt/ManageReceipt";
import DetailReceipt from "./Receipt/DetailReceipt";
import Turnover from "./Statistic/Turnover";
import Profit from "./Statistic/Profit";
import StockProduct from "./Statistic/StockProduct";

import ManageCategory from "./Category/ManageCategory";
import AddCategory from "./Category/AddCategory";
import ManageBrand from "./Brand/ManageBrand";
import AddBrand from "./Brand/AddBrand";
import ManageSubject from "./Subject/ManageSubject";
import AddSubject from "./Subject/AddSubject";
import ManageTypeShip from "./TypeShip/ManageTypeShip";
import AddTypeShip from "./TypeShip/AddTypeShip";
import Message from "./Message/Message";

const AdminLayout = ({ children }) => (
    <div className="sb-nav-fixed">
        <Header />
        <div id="layoutSidenav">
            <SideBar />
            <div id="layoutSidenav_content">
                <main>{children}</main>
                <Footer />
            </div>
        </div>
    </div>
);

function HomePageAdmin() {
    return (
        <AdminLayout>
            <Routes>
                <Route index element={<Home />} />

                <Route path="list-user" element={<ManageUser />} />
                <Route path="add-user" element={<Adduser />} />
                <Route path="edit-user/:id" element={<Adduser />} />
                <Route path="infor/:id" element={<Information />} />
                <Route path="change-password/:id" element={<ChangePassword />} />

                <Route path="list-product" element={<ManageProduct />} />
                <Route path="add-product" element={<AddProduct />} />
                <Route path="edit-product/:id" element={<EditProduct />} />
                <Route path="list-product-detail/:id" element={<ManageProductDetail />} />
                <Route path="list-product-detail-image/:id" element={<ManageProductImage />} />
                <Route path="add-product-detail/:id" element={<AddProductDetail />} />
                <Route path="update-product-detail/:id" element={<EditProductDetail />} />

                <Route path="list-order" element={<ManageOrder />} />
                <Route path="order-detail/:id" element={<DetailOrder />} />

                <Route path="list-typevoucher" element={<ManageTypeVoucher />} />
                <Route path="add-typevoucher" element={<AddTypeVoucher />} />
                <Route path="edit-typevoucher/:id" element={<AddTypeVoucher />} />
                <Route path="list-voucher" element={<ManageVoucher />} />
                <Route path="add-voucher" element={<AddVoucher />} />
                <Route path="edit-voucher/:id" element={<AddVoucher />} />

                <Route path="list-blog" element={<ManageBlog />} />
                <Route path="add-blog" element={<AddBlog />} />
                <Route path="edit-blog/:id" element={<AddBlog />} />

                <Route path="list-banner" element={<ManageBanner />} />
                <Route path="add-banner" element={<AddBanner />} />
                <Route path="edit-banner/:id" element={<AddBanner />} />

                <Route path="list-supplier" element={<ManageSupplier />} />
                <Route path="add-supplier" element={<AddSupplier />} />
                <Route path="edit-supplier/:id" element={<AddSupplier />} />

                <Route path="list-receipt" element={<ManageReceipt />} />
                <Route path="add-receipt" element={<AddReceipt />} />
                <Route path="detail-receipt/:id" element={<DetailReceipt />} />

                <Route path="list-category" element={<ManageCategory />} />
                <Route path="add-category" element={<AddCategory />} />
                <Route path="edit-category/:id" element={<AddCategory />} />

                <Route path="list-brand" element={<ManageBrand />} />
                <Route path="add-brand" element={<AddBrand />} />
                <Route path="edit-brand/:id" element={<AddBrand />} />

                <Route path="list-subject" element={<ManageSubject />} />
                <Route path="add-subject" element={<AddSubject />} />
                <Route path="edit-subject/:id" element={<AddSubject />} />

                <Route path="list-typeship" element={<ManageTypeShip />} />
                <Route path="add-typeship" element={<AddTypeShip />} />
                <Route path="edit-typeship/:id" element={<AddTypeShip />} />

                <Route path="chat" element={<Message />} />

                <Route path="turnover" element={<Turnover />} />
                <Route path="profit" element={<Profit />} />
                <Route path="stock-product" element={<StockProduct />} />

                <Route path="*" element={<Navigate to="/system/home" replace />} />
            </Routes>
        </AdminLayout>
    );
}

export default HomePageAdmin;
