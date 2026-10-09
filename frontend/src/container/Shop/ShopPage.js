import React, { useState, useRef, useEffect } from "react";
import MainShop from "../../component/Shop/MainShop";
import Category from "../../component/Shop/Category";
import Brand from "../../component/Shop/Brand";

import { Link } from "react-router-dom";
import './ShopPage.scss';
function ShopPage() {
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    const [categoryId, setcategoryId] = useState("");
    const [brandId, setbrandId] = useState("");
    const [filtersOpen, setFiltersOpen] = useState(false);
    const myRef = useRef(null);
    let handleRecevieDataCategory = (code) => {
        setcategoryId(code);
    };
    let handleRecevieDataBrand = (code) => {
        setbrandId(code);
    };
    return (
        <div className="shop-page">
            <section className="shop-banner">
                <div className="shop-container shop-banner__inner">
                    <div>
                        <p className="shop-banner__eyebrow">BỘ SƯU TẬP</p>
                        <h1>Cửa hàng</h1>
                        <p>Khám phá sản phẩm phù hợp với phong cách của bạn.</p>
                    </div>
                    <nav className="shop-breadcrumb" aria-label="Đường dẫn">
                        <Link to="/">Trang chủ</Link>
                        <span aria-hidden="true">/</span>
                        <span aria-current="page">Cửa hàng</span>
                    </nav>
                </div>
            </section>
            <section ref={myRef} className="shop-products">
                <div className="shop-container">
                    <div className="shop-filter-bar">
                        <button
                            type="button"
                            aria-expanded={filtersOpen}
                            aria-controls="shop-product-filters"
                            onClick={() => setFiltersOpen((open) => !open)}
                        >
                            <i className="ti-filter" aria-hidden="true" />
                            <span>Lọc sản phẩm</span>
                            <i className={filtersOpen ? 'ti-angle-up' : 'ti-angle-down'} aria-hidden="true" />
                        </button>
                    </div>
                    <div className="shop-layout">
                        <aside
                            id="shop-product-filters"
                            className={`shop-sidebar${filtersOpen ? ' is-open' : ''}`}
                            aria-label="Bộ lọc sản phẩm"
                        >
                            <div className="left_sidebar_area">
                                <Category handleRecevieDataCategory={handleRecevieDataCategory} />
                                <Brand handleRecevieDataBrand={handleRecevieDataBrand} />
                            </div>
                        </aside>
                        <MainShop
                            categoryId={categoryId}
                            brandId={brandId}
                            myRef={myRef}
                        />
                    </div>
                </div>
            </section>
        </div>
    );
}

export default ShopPage;
