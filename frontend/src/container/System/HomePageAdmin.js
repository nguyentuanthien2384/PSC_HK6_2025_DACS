import React, { Suspense, useEffect, useState } from 'react';
import { lazyWithPreload as lazy } from '../../utils/lazyPage';
import RoutePreload from '../../component/RoutePreload';
import PageLoadBoundary from '../../component/PageLoadBoundary';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { getUser } from '../../utils/token';
import Footer from './Footer';
import Header from './Header';
import SideBar from './SideBar';
import './AdminWorkspace.scss';

const OperationsDashboard = lazy(() => import('./Operations/OperationsDashboard'));
const OperationsOrders = lazy(() => import('./Operations/OperationsOrders'));
const OperationsReturns = lazy(() => import('./Operations/OperationsReturns'));
const InventoryManagement = lazy(() => import('./Inventory/InventoryManagement'));
const Home = lazy(() => import('./Home'));
const ManageUser = lazy(() => import('./User/ManageUser'));
const Adduser = lazy(() => import('./User/Adduser'));
const Information = lazy(() => import('./User/Information'));
const ChangePassword = lazy(() => import('./User/ChangePassword'));
const AdminAudit = lazy(() => import('./Audit/AdminAudit'));
const AddProduct = lazy(() => import('./Product/AddProduct'));
const ManageProduct = lazy(() => import('./Product/ManageProduct'));
const EditProduct = lazy(() => import('./Product/EditProduct'));
const ManageProductDetail = lazy(() => import('./Product/ProductDetail/ManageProductDetail'));
const ManageProductImage = lazy(() => import('./Product/ProductImage/ManageProductImage'));
const AddProductDetail = lazy(() => import('./Product/ProductDetail/AddProductDetail'));
const EditProductDetail = lazy(() => import('./Product/ProductDetail/EditProductDetail'));
const DetailOrder = lazy(() => import('./Order/DetailOrder'));
const PaymentReconciliation = lazy(() => import('./Order/PaymentReconciliation'));
const NotificationsPage = lazy(() => import('../User/NotificationsPage'));
const AddTypeVoucher = lazy(() => import('./Voucher/AddTypeVoucher'));
const ManageTypeVoucher = lazy(() => import('./Voucher/ManageTypeVoucher'));
const AddVoucher = lazy(() => import('./Voucher/AddVoucher'));
const ManageVoucher = lazy(() => import('./Voucher/ManageVoucher'));
const AddBlog = lazy(() => import('./Blog/AddBlog'));
const ManageBlog = lazy(() => import('./Blog/ManageBlog'));
const AddBanner = lazy(() => import('./Banner/AddBanner'));
const ManageBanner = lazy(() => import('./Banner/ManageBanner'));
const AddSupplier = lazy(() => import('./Supplier/AddSupplier'));
const ManageSupplier = lazy(() => import('./Supplier/ManageSupplier'));
const AddReceipt = lazy(() => import('./Receipt/AddReceipt'));
const ManageReceipt = lazy(() => import('./Receipt/ManageReceipt'));
const DetailReceipt = lazy(() => import('./Receipt/DetailReceipt'));
const Turnover = lazy(() => import('./Statistic/Turnover'));
const Profit = lazy(() => import('./Statistic/Profit'));
const StockProduct = lazy(() => import('./Statistic/StockProduct'));
const ManageCategory = lazy(() => import('./Category/ManageCategory'));
const AddCategory = lazy(() => import('./Category/AddCategory'));
const ManageBrand = lazy(() => import('./Brand/ManageBrand'));
const AddBrand = lazy(() => import('./Brand/AddBrand'));
const ManageSubject = lazy(() => import('./Subject/ManageSubject'));
const AddSubject = lazy(() => import('./Subject/AddSubject'));
const ManageTypeShip = lazy(() => import('./TypeShip/ManageTypeShip'));
const AddTypeShip = lazy(() => import('./TypeShip/AddTypeShip'));
const Message = lazy(() => import('./Message/Message'));

const catalogPages = {
    '/system/home/list-product': ManageProduct,
    '/system/home/inventory': InventoryManagement,
    '/system/home/list-product-detail/': ManageProductDetail,
    '/system/home/list-product-detail-image/': ManageProductImage,
    '/system/home/edit-product/': EditProduct,
    '/system/home/update-product-detail/': EditProductDetail,
    '/system/home/list-category': ManageCategory,
    '/system/home/list-brand': ManageBrand,
    '/system/home/list-receipt': ManageReceipt,
};

export function OwnerRoute({ children }) {
    if (getUser()?.roleId === 'R1') return children;
    return <section className="admin-access-denied" aria-labelledby="admin-access-title">
        <span className="admin-access-icon" aria-hidden="true"><i className="fas fa-lock" /></span>
        <h1 id="admin-access-title">Trang dành cho chủ cửa hàng</h1>
        <p>Tài khoản nhân viên chỉ được truy cập các chức năng vận hành được phân quyền.</p>
        <Link className="btn btn-primary" to="/system/home">Về trung tâm vận hành</Link>
    </section>;
}
const owner = component => <OwnerRoute>{component}</OwnerRoute>;

export function AdminLayout({ children }) {
    const [navigationOpen, setNavigationOpen] = useState(false);
    const [mobileNavigation, setMobileNavigation] = useState(() => window.matchMedia?.('(max-width: 991px)').matches || false);
    const location = useLocation();
    useEffect(() => { setNavigationOpen(false); }, [location.pathname, location.search]);
    useEffect(() => {
        const breakpoint = window.matchMedia?.('(max-width: 991px)');
        if (!breakpoint) return undefined;
        const update = () => { setMobileNavigation(breakpoint.matches); setNavigationOpen(false); };
        breakpoint.addEventListener?.('change', update);
        return () => breakpoint.removeEventListener?.('change', update);
    }, []);
    useEffect(() => {
        if (!navigationOpen) return undefined;
        const closeOnEscape = event => { if (event.key === 'Escape') setNavigationOpen(false); };
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [navigationOpen]);
    return <div className={`admin-workspace${navigationOpen ? ' admin-navigation-open' : ''}`}>
        <a className="admin-skip-link" href="#admin-main-content">Đến nội dung chính</a>
        <Header navigationOpen={navigationOpen} onToggleNavigation={() => setNavigationOpen(open => !open)} />
        <SideBar onNavigate={() => setNavigationOpen(false)} mobileNavigation={mobileNavigation} navigationOpen={navigationOpen} />
        {navigationOpen && <button type="button" className="admin-navigation-overlay" aria-label="Đóng menu quản trị" onClick={() => setNavigationOpen(false)} />}
        <div className="admin-workspace-body">
            <section id="admin-main-content" className="admin-content" tabIndex={-1} aria-label="Nội dung quản trị">{children}</section>
            <Footer />
        </div>
    </div>;
}

export default function HomePageAdmin() {
    const { pathname } = useLocation();
    return <AdminLayout><RoutePreload pages={catalogPages} /><PageLoadBoundary key={pathname}><Suspense fallback={<div className="admin-page-loading" role="status"><span className="admin-loading-spinner" aria-hidden="true" />Đang tải trang quản trị…</div>}>
        <Routes>
            <Route index element={<OperationsDashboard />} />
            <Route path="list-order" element={<OperationsOrders />} />
            <Route path="order-detail/:id" element={<DetailOrder />} />
            <Route path="returns" element={<OperationsReturns />} />
            <Route path="payment-reconciliation" element={<PaymentReconciliation />} />
            <Route path="notifications" element={<NotificationsPage inWorkspace />} />
            <Route path="inventory" element={<InventoryManagement />} />
            <Route path="list-user" element={owner(<ManageUser />)} />
            <Route path="add-user" element={owner(<Adduser />)} />
            <Route path="edit-user/:id" element={owner(<Adduser />)} />
            <Route path="infor/:id" element={<Information />} />
            <Route path="change-password/:id" element={<ChangePassword />} />
            <Route path="audit" element={owner(<AdminAudit />)} />
            <Route path="list-product" element={owner(<ManageProduct />)} />
            <Route path="add-product" element={owner(<AddProduct />)} />
            <Route path="edit-product/:id" element={owner(<EditProduct />)} />
            <Route path="list-product-detail/:id" element={owner(<ManageProductDetail />)} />
            <Route path="list-product-detail-image/:id" element={owner(<ManageProductImage />)} />
            <Route path="add-product-detail/:id" element={owner(<AddProductDetail />)} />
            <Route path="update-product-detail/:id" element={owner(<EditProductDetail />)} />
            <Route path="list-typevoucher" element={owner(<ManageTypeVoucher />)} />
            <Route path="add-typevoucher" element={owner(<AddTypeVoucher />)} />
            <Route path="edit-typevoucher/:id" element={owner(<AddTypeVoucher />)} />
            <Route path="list-voucher" element={owner(<ManageVoucher />)} />
            <Route path="add-voucher" element={owner(<AddVoucher />)} />
            <Route path="edit-voucher/:id" element={owner(<AddVoucher />)} />
            <Route path="list-blog" element={owner(<ManageBlog />)} />
            <Route path="add-blog" element={owner(<AddBlog />)} />
            <Route path="edit-blog/:id" element={owner(<AddBlog />)} />
            <Route path="list-banner" element={owner(<ManageBanner />)} />
            <Route path="add-banner" element={owner(<AddBanner />)} />
            <Route path="edit-banner/:id" element={owner(<AddBanner />)} />
            <Route path="list-supplier" element={<ManageSupplier />} />
            <Route path="add-supplier" element={<AddSupplier />} />
            <Route path="edit-supplier/:id" element={<AddSupplier />} />
            <Route path="list-receipt" element={<ManageReceipt />} />
            <Route path="add-receipt" element={<AddReceipt />} />
            <Route path="detail-receipt/:id" element={<DetailReceipt />} />
            <Route path="list-category" element={owner(<ManageCategory />)} />
            <Route path="add-category" element={owner(<AddCategory />)} />
            <Route path="edit-category/:id" element={owner(<AddCategory />)} />
            <Route path="list-brand" element={owner(<ManageBrand />)} />
            <Route path="add-brand" element={owner(<AddBrand />)} />
            <Route path="edit-brand/:id" element={owner(<AddBrand />)} />
            <Route path="list-subject" element={owner(<ManageSubject />)} />
            <Route path="add-subject" element={owner(<AddSubject />)} />
            <Route path="edit-subject/:id" element={owner(<AddSubject />)} />
            <Route path="list-typeship" element={owner(<ManageTypeShip />)} />
            <Route path="add-typeship" element={owner(<AddTypeShip />)} />
            <Route path="edit-typeship/:id" element={owner(<AddTypeShip />)} />
            <Route path="chat" element={<Message />} />
            <Route path="statistics" element={owner(<Home />)} />
            <Route path="turnover" element={owner(<Turnover />)} />
            <Route path="profit" element={owner(<Profit />)} />
            <Route path="stock-product" element={<StockProduct />} />
            <Route path="*" element={<Navigate to="/system/home" replace />} />
        </Routes>
    </Suspense></PageLoadBoundary></AdminLayout>;
}
