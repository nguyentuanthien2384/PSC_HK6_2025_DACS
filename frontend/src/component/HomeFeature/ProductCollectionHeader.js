import React from 'react';
import { Link } from 'react-router-dom';

function ProductCollectionHeader({ titleId, title, eyebrow, description, children }) {
    return (
        <header className="product-collection__header">
            <div className="product-collection__intro">
                <span className="product-collection__eyebrow">{eyebrow}</span>
                <h2 id={titleId}>{title}</h2>
                {description && <p>{description}</p>}
            </div>
            <div className="product-collection__actions">
                <Link to="/shop" className="product-collection__view-all">
                    Xem tất cả
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
                </Link>
                {children}
            </div>
        </header>
    );
}

export default ProductCollectionHeader;
