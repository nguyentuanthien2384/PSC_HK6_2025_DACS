import React from 'react';

function ProductCollectionState({ loading, error }) {
    if (loading) {
        return (
            <div className="product-collection__loading" role="status">
                <span className="product-collection__sr-only">Đang tải sản phẩm…</span>
                <div className="product-collection__grid" aria-hidden="true">
                    {Array.from({ length: 4 }, (_, index) => (
                        <div key={index} className="product-collection__skeleton">
                            <div className="product-collection__skeleton-image" />
                            <div className="product-collection__skeleton-body"><span /><span /><span /></div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="product-collection__empty" role="status">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7.5 5l9 4" /></svg>
            <p>{error ? 'Chưa thể tải sản phẩm. Vui lòng tải lại trang để thử lại.' : 'Sản phẩm đang được cập nhật.'}</p>
        </div>
    );
}

export default ProductCollectionState;
