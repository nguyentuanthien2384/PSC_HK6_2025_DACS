import { getUser } from '../../utils/token';
import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getDetailProductByIdService, getProductRecommendService } from '../../services/userService';
import InfoDetailProduct from '../../component/Product/InfoDetailProduct';
import ProfileProduct from '../../component/Product/ProfileProduct';
import DescriptionProduct from '../../component/Product/DescriptionProduct';
import ProductFeature from '../../component/HomeFeature/ProductFeature';
import ReviewProduct from '../../component/Product/ReviewProduct';
import './DetailProductPage.scss';

const tabs = [{ key: 'description', label: 'Mô tả sản phẩm' }, { key: 'specifications', label: 'Thông số chi tiết' }, { key: 'reviews', label: 'Đánh giá' }];

function DetailProductPage() {
    const { id } = useParams();
    const [product, setProduct] = useState(null);
    const [selectedSize, setSelectedSize] = useState({});
    const [user, setUser] = useState(null);
    const [recommendations, setRecommendations] = useState([]);
    const [loadError, setLoadError] = useState('');
    const [activeTab, setActiveTab] = useState('description');
    const [retry, setRetry] = useState(0);

    useEffect(() => {
        let active = true;
        const account = getUser();
        setUser(account);
        setProduct(null);
        setSelectedSize({});
        setLoadError('');
        setActiveTab('description');
        setRecommendations([]);
        window.scrollTo(0, 0);
        getDetailProductByIdService(id).then((response) => {
            if (!active) return;
            if (response?.errCode !== 0 || !response.data) throw new Error(response?.errMessage || 'Không tìm thấy sản phẩm.');
            setProduct(response.data);
        }).catch((error) => { if (active) setLoadError(error.message); });
        if (account) {
            getProductRecommendService({ limit: 12, userId: account.id })
                .then((response) => { if (active && response?.errCode === 0) setRecommendations((response.data || []).filter((item) => String(item.id) !== String(id))); })
                .catch(() => {});
        }
        return () => { active = false; };
    }, [id, retry]);

    const moveTabFocus = (event, index) => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;
        event.preventDefault();
        setActiveTab(tabs[next].key);
        event.currentTarget.parentElement.children[next].focus();
    };

    return (
        <main className="product-detail-page">
            <div className="product-detail-page__container">
                <nav className="product-detail-page__breadcrumb" aria-label="Đường dẫn">
                    <Link to="/">Trang chủ</Link><span aria-hidden="true">/</span>
                    <Link to="/shop">Cửa hàng</Link>
                    {product && <><span aria-hidden="true">/</span><span aria-current="page">{product.name}</span></>}
                </nav>
                {loadError ? (
                    <div className="product-detail-page__state" role="alert"><h1>Chưa thể hiển thị sản phẩm</h1><p>{loadError}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Thử lại</button><Link to="/shop">Quay lại cửa hàng</Link></div>
                ) : !product ? (
                    <div className="product-detail-page__state" role="status"><p>Đang tải thông tin sản phẩm…</p><div className="product-detail-page__skeleton" aria-hidden="true" /></div>
                ) : (
                    <>
                        <InfoDetailProduct userId={user?.id} dataProduct={product} sendDataFromInforDetail={setSelectedSize} />
                        <section id="product-details" className="product-detail-page__details" aria-label="Thông tin chi tiết sản phẩm">
                            <div className="product-detail-page__tabs" role="tablist" aria-label="Thông tin sản phẩm">
                                {tabs.map((tab, index) => (
                                    <button type="button" key={tab.key} role="tab" id={`product-tab-${tab.key}`} aria-controls={`product-panel-${tab.key}`} aria-selected={activeTab === tab.key} tabIndex={activeTab === tab.key ? 0 : -1} onClick={() => setActiveTab(tab.key)} onKeyDown={(event) => moveTabFocus(event, index)}>{tab.label}</button>
                                ))}
                            </div>
                            {tabs.map((tab) => (
                                <div key={tab.key} role="tabpanel" id={`product-panel-${tab.key}`} aria-labelledby={`product-tab-${tab.key}`} hidden={activeTab !== tab.key} tabIndex={0} className="product-detail-page__panel">
                                    {tab.key === 'description' && <DescriptionProduct data={product.contentHTML} markdown={product.contentMarkdown} />}
                                    {tab.key === 'specifications' && <ProfileProduct product={product} data={selectedSize} />}
                                    {tab.key === 'reviews' && activeTab === 'reviews' && <ReviewProduct productId={id} userId={user?.id} />}
                                </div>
                            ))}
                        </section>
                    </>
                )}
            </div>
            {product && !!recommendations.length && <ProductFeature title="Có thể bạn quan tâm" eyebrow="Khám phá thêm" data={recommendations} />}
        </main>
    );
}

export default DetailProductPage;
