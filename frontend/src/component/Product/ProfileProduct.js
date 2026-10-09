import React from 'react';

function ProfileProduct({ data = {}, product = {} }) {
    const rows = [
        ['Thương hiệu', product.brandData?.value],
        ['Danh mục', product.categoryData?.value],
        ['Chất liệu', product.material],
        ['Xuất xứ', product.madeby],
        ['Kích thước đang chọn', data.sizeData?.value],
        ['Chiều rộng', data.width],
        ['Chiều dài', data.height],
        ['Khối lượng', data.weight],
    ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');

    return (
        <div className="product-specifications">
            {rows.length ? (
                <dl>{rows.map(([label, value]) => (
                    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                ))}</dl>
            ) : <p className="product-detail-page__muted">Thông số sản phẩm đang được cập nhật.</p>}
            <p className="product-specifications__note">Thông số theo mẫu và lựa chọn hiện tại. Chi tiết kỹ thuật từ nhãn hàng được ghi trong phần mô tả sản phẩm.</p>
        </div>
    );
}

export default ProfileProduct;
