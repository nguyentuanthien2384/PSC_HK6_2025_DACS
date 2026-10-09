import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import { addItemCartStart } from '../../action/ShopCartAction';
import './InfoDetailProduct.scss';

const emptyDetails = [];
const priceFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const validPrice = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;

function InfoDetailProduct({ dataProduct, userId, sendDataFromInforDetail }) {
    const details = dataProduct?.productDetail || emptyDetails;
    const [detailId, setDetailId] = useState(null);
    const [sizeId, setSizeId] = useState(null);
    const [quantity, setQuantity] = useState(1);
    const [imageIndex, setImageIndex] = useState(0);
    const [imageFailed, setImageFailed] = useState(false);
    const previewRef = useRef(null);
    const dispatch = useDispatch();
    const detail = details.find((item) => item.id === detailId) || details[0];
    const sizes = detail?.productDetailSize || emptyDetails;
    const size = sizes.find((item) => item.id === sizeId);
    const images = detail?.productImage || emptyDetails;
    const image = images[imageIndex] || images[0];
    const stock = Math.max(0, Number(size?.stock) || 0);
    const sellingPrice = validPrice(detail?.discountPrice) ? Number(detail.discountPrice) : validPrice(detail?.originalPrice) ? Number(detail.originalPrice) : null;
    const originalPrice = validPrice(detail?.originalPrice) ? Number(detail.originalPrice) : null;
    const hasDiscount = sellingPrice !== null && originalPrice !== null && sellingPrice < originalPrice;
    const purchasable = !!size && stock > 0 && sellingPrice !== null;

    useEffect(() => {
        const first = details.find((item) => item.productDetailSize?.some((option) => Number(option.stock) > 0)) || details[0];
        setDetailId(first?.id || null);
        const firstSize = first?.productDetailSize?.find((option) => Number(option.stock) > 0) || first?.productDetailSize?.[0];
        setSizeId(firstSize?.id || null);
        setQuantity(1);
        setImageIndex(0);
    }, [details]);

    useEffect(() => { setImageFailed(false); }, [image?.image]);
    useEffect(() => { sendDataFromInforDetail?.(size || {}); }, [size, sendDataFromInforDetail]);

    const selectDetail = (value) => {
        const selected = details.find((item) => String(item.id) === value);
        const firstSize = selected?.productDetailSize?.find((option) => Number(option.stock) > 0) || selected?.productDetailSize?.[0];
        setDetailId(selected?.id || null);
        setSizeId(firstSize?.id || null);
        setQuantity(1);
        setImageIndex(0);
    };

    const addToCart = () => {
        const count = Number(quantity);
        if (!purchasable) { toast.error('Lựa chọn này hiện chưa có hàng.'); return; }
        if (!Number.isInteger(count) || count < 1 || count > stock) {
            toast.error('Số lượng phải là số nguyên và không vượt quá tồn kho.');
            return;
        }
        if (!userId) { toast.error('Đăng nhập để thêm vào giỏ hàng.'); return; }
        dispatch(addItemCartStart({ userId, productdetailsizeId: size.id, quantity: count }));
    };

    const placeholder = <span className="product-buy__placeholder"><i className="ti-image" aria-hidden="true" />Ảnh sản phẩm đang được cập nhật</span>;

    return (
        <div className="product-buy">
            <div className="product-buy__gallery">
                <button type="button" className="product-buy__main-image" disabled={!image?.image || imageFailed} aria-label="Phóng to ảnh sản phẩm" onClick={() => previewRef.current?.showModal()}>
                    {image?.image && !imageFailed ? (
                        <img src={image.image} alt={image.caption || dataProduct.name} onError={() => setImageFailed(true)} />
                    ) : placeholder}
                    {image?.image && !imageFailed && <span className="product-buy__zoom"><i className="ti-zoom-in" aria-hidden="true" /></span>}
                </button>
                {images.length > 1 && (
                    <div className="product-buy__thumbnails" aria-label="Ảnh sản phẩm">
                        {images.map((item, index) => (
                            <button type="button" key={item.id || index} className={index === imageIndex ? 'is-selected' : ''} aria-pressed={index === imageIndex} aria-label={`Xem ảnh ${index + 1}`} onClick={() => setImageIndex(index)}>
                                <img src={item.image} alt={item.caption || `${dataProduct.name} – ảnh ${index + 1}`} loading="lazy" />
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <div className="product-buy__information">
                <div className="product-buy__brand">{dataProduct.brandData?.value}</div>
                <h1>{dataProduct.name}</h1>
                <div className="product-buy__pricing">
                    <strong>{sellingPrice !== null ? priceFormatter.format(sellingPrice) : 'Liên hệ'}</strong>
                    {hasDiscount && <><del>{priceFormatter.format(originalPrice)}</del><span>-{Math.round((1 - sellingPrice / originalPrice) * 100)}%</span></>}
                </div>
                {detail?.description && <p className="product-buy__summary">{detail.description}</p>}
                <dl className="product-buy__facts">
                    {dataProduct.material && <div><dt>Chất liệu</dt><dd>{dataProduct.material}</dd></div>}
                    {dataProduct.madeby && <div><dt>Xuất xứ</dt><dd>{dataProduct.madeby}</dd></div>}
                    {dataProduct.categoryData?.value && <div><dt>Danh mục</dt><dd>{dataProduct.categoryData.value}</dd></div>}
                </dl>
                {!!details.length && (
                    <div className="product-buy__option">
                        <label htmlFor="product-variant">Phiên bản / màu sắc</label>
                        <select id="product-variant" value={detail?.id || ''} onChange={(event) => selectDetail(event.target.value)}>
                            {details.map((item) => <option key={item.id} value={item.id}>{item.nameDetail}</option>)}
                        </select>
                    </div>
                )}
                {!!sizes.length && (
                    <fieldset className="product-buy__sizes">
                        <legend>Kích thước</legend>
                        <div>{sizes.map((item) => (
                            <button type="button" key={item.id} aria-pressed={item.id === sizeId} disabled={Number(item.stock) < 1} className={item.id === sizeId ? 'is-selected' : ''} onClick={() => { setSizeId(item.id); setQuantity(1); }}>
                                {item.sizeData?.value || 'Tiêu chuẩn'}
                            </button>
                        ))}</div>
                    </fieldset>
                )}
                <p className={purchasable ? 'product-buy__availability' : 'product-buy__availability is-unavailable'} role="status">
                    <span aria-hidden="true" />{purchasable ? `${stock} sản phẩm có sẵn cho lựa chọn này` : 'Lựa chọn này hiện chưa có hàng'}
                </p>
                <div className="product-buy__purchase">
                    <div className="product-buy__quantity">
                        <label htmlFor="product-quantity">Số lượng</label>
                        <div>
                            <button type="button" aria-label="Giảm số lượng" disabled={!purchasable || Number(quantity) <= 1} onClick={() => setQuantity(Math.max(1, Number(quantity) - 1))}>−</button>
                            <input id="product-quantity" type="number" min="1" max={stock || 1} step="1" value={quantity} disabled={!purchasable} onChange={(event) => setQuantity(event.target.value)} />
                            <button type="button" aria-label="Tăng số lượng" disabled={!purchasable || Number(quantity) >= stock} onClick={() => setQuantity(Math.min(stock, Number(quantity) + 1))}>+</button>
                        </div>
                    </div>
                    <button type="button" className="product-buy__add" disabled={!purchasable} onClick={addToCart}><i className="ti-shopping-cart" aria-hidden="true" />Thêm vào giỏ hàng</button>
                </div>
                <a className="product-buy__more" href="#product-details">Xem mô tả và thông số đầy đủ <span aria-hidden="true">↓</span></a>
            </div>
            <dialog ref={previewRef} className="product-buy__preview" aria-label="Ảnh phóng to của sản phẩm">
                <button type="button" autoFocus aria-label="Đóng ảnh phóng to" onClick={() => previewRef.current?.close()}>×</button>
                {image?.image && <img src={image.image} alt={image.caption || dataProduct.name} />}
            </dialog>
        </div>
    );
}

export default InfoDetailProduct;
