import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CommonUtils from '../../utils/CommonUtils';
import './ItemProduct.scss';

const priceFormatter = new Intl.NumberFormat('vi-VN', CommonUtils.formatter.resolvedOptions());

function parsePrice(value) {
    if (value === null || value === undefined || value === '') return null;
    const price = Number(value);
    return Number.isFinite(price) && price >= 0 ? price : null;
}

function ItemProduct({ id, type, name, brand, img, discountPrice, price, badge }) {
    const [imageFailed, setImageFailed] = useState(false);

    useEffect(() => {
        setImageFailed(false);
    }, [img]);

    const originalPrice = parsePrice(price);
    const sellingPrice = parsePrice(discountPrice) ?? originalPrice;
    const hasDiscount = originalPrice !== null && sellingPrice !== null && sellingPrice < originalPrice;
    const discountPercent = hasDiscount ? Math.round((1 - sellingPrice / originalPrice) * 100) : 0;
    const productName = name || 'Sản phẩm';

    return (
        <div className={`ecommerce-product-card-slot ${type || ''}`}>
            <Link
                className="ecommerce-product-card"
                to={`/detail-product/${id}`}
                aria-label={`Xem chi tiết ${productName}`}
            >
                <div className="ecommerce-product-card__image">
                    {img && !imageFailed ? (
                        <img
                            src={img}
                            alt={productName}
                            loading="lazy"
                            decoding="async"
                            onError={() => setImageFailed(true)}
                        />
                    ) : (
                        <div className="ecommerce-product-card__placeholder">
                            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
                                <rect x="7" y="9" width="34" height="30" rx="5" stroke="currentColor" strokeWidth="2" />
                                <circle cx="17" cy="19" r="3" stroke="currentColor" strokeWidth="2" />
                                <path d="m10 34 9-9 7 7 5-5 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span>Đang cập nhật ảnh</span>
                        </div>
                    )}
                    {(badge || hasDiscount) && (
                        <div className="ecommerce-product-card__badges">
                            {badge && <span className="ecommerce-product-card__badge">{badge}</span>}
                            {hasDiscount && (
                                <span className="ecommerce-product-card__badge ecommerce-product-card__badge--discount">
                                    {discountPercent > 0 ? `-${discountPercent}%` : 'Giảm giá'}
                                </span>
                            )}
                        </div>
                    )}
                </div>
                <div className="ecommerce-product-card__body">
                    <span className="ecommerce-product-card__brand" aria-hidden={!brand}>{brand || '\u00a0'}</span>
                    <h3 className="ecommerce-product-card__name" title={productName}>{productName}</h3>
                    <div className="ecommerce-product-card__pricing">
                        <span className="ecommerce-product-card__price">
                            {sellingPrice !== null ? priceFormatter.format(sellingPrice) : 'Liên hệ'}
                        </span>
                        {hasDiscount && (
                            <del className="ecommerce-product-card__original-price">{priceFormatter.format(originalPrice)}</del>
                        )}
                    </div>
                    <span className="ecommerce-product-card__detail">
                        Xem chi tiết
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </span>
                </div>
            </Link>
        </div>
    );
}

export default ItemProduct;
