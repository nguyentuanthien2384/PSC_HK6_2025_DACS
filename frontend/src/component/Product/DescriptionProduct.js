import React, { useMemo } from 'react';
import { renderProductDescription } from '../../utils/productDescription';

function DescriptionProduct({ data, markdown }) {
    const content = useMemo(() => renderProductDescription({ markdown, html: data }), [markdown, data]);
    return content ? (
        <article className="product-description" dangerouslySetInnerHTML={{ __html: content }} />
    ) : (
        <p className="product-detail-page__muted">Cửa hàng đang cập nhật mô tả chi tiết cho sản phẩm này.</p>
    );
}

export default DescriptionProduct;
