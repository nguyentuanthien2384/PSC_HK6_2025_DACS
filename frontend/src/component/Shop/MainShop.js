import React, { useState, useEffect } from 'react';
import ItemProduct from '../Product/ItemProduct';
import { getAllProductUser } from '../../services/userService';
import { PAGINATION } from '../../utils/constant';
import ReactPaginate from 'react-paginate';
import './MainShop.scss';
import useRefreshOnReturn from '../../hooks/useRefreshOnReturn';

function MainShop({ categoryId, brandId, myRef }) {
    const [result, setResult] = useState({ key: null, products: [], count: 0 });
    const [pagination, setPagination] = useState({ page: 0, categoryId, brandId });
    const numberPage = pagination.categoryId === categoryId && pagination.brandId === brandId ? pagination.page : 0;
    // Record each filter change before committing children, so returning to a
    // previous category cannot restore that category's old page number.
    if (pagination.categoryId !== categoryId || pagination.brandId !== brandId) {
        setPagination({ page: 0, categoryId, brandId });
    }
    const setNumberPage = (page) => setPagination({ page, categoryId, brandId });
    const [limitPage, setLimitPage] = useState(PAGINATION.pagerow);
    const [sort, setSort] = useState('1');
    const [searchInput, setSearchInput] = useState('');
    const [keyword, setKeyword] = useState('');
    const [request, setRequest] = useState({ key: null, loading: true, error: false });
    const [retry, setRetry] = useState(0);
    const queryKey = JSON.stringify([limitPage, sort, numberPage, categoryId, brandId, keyword]);
    // Keep cards during a refresh of this selection, but never show a previous
    // category or page under a newly selected filter while its request is pending.
    const loaded = result.key === queryKey;
    const dataProduct = loaded ? result.products : [];
    const totalResults = loaded ? result.count : 0;
    const loading = request.key !== queryKey || request.loading;
    const error = request.key === queryKey && request.error;
    useRefreshOnReturn(() => setRetry(value => value + 1), !loading);

    useEffect(() => {
        let active = true;
        const controller = new AbortController();
        const fetchProducts = async () => {
            setRequest({ key: queryKey, loading: true, error: false });
            try {
                const response = await getAllProductUser({
                    sortPrice: sort === '2' ? true : '',
                    sortName: sort === '3' ? true : '',
                    limit: limitPage,
                    offset: numberPage * limitPage,
                    categoryId,
                    brandId,
                    keyword,
                    signal: controller.signal,
                });
                if (!active) return;
                if (!response || response.errCode !== 0) {
                    throw new Error('Unable to load products');
                }
                const products = Array.isArray(response.data) ? response.data : [];
                const count = Number(response.count);
                setResult({ key: queryKey, products, count: Number.isFinite(count) ? Math.max(0, count) : products.length });
                setRequest({ key: queryKey, loading: false, error: false });
            } catch (fetchError) {
                if (active) {
                    setRequest({ key: queryKey, loading: false, error: true });
                }
            }
        };
        fetchProducts();
        return () => { active = false; controller.abort(); };
    }, [limitPage, sort, numberPage, categoryId, brandId, keyword, queryKey, retry]);

    const handleChangePage = ({ selected }) => {
        setNumberPage(selected);
        if (myRef && myRef.current) {
            myRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    const handleSearch = (event) => {
        event.preventDefault();
        setNumberPage(0);
        setKeyword(searchInput.trim());
    };

    const handleSearchInput = (event) => {
        const value = event.target.value;
        setSearchInput(value);
        if (!value.trim()) {
            setNumberPage(0);
            setKeyword('');
        }
    };

    const pageCount = Math.ceil(totalResults / limitPage);
    const firstResult = totalResults ? numberPage * limitPage + 1 : 0;
    const lastResult = Math.min(numberPage * limitPage + dataProduct.length, totalResults);

    return (
        <div className="shop-catalog">
            <div className="shop-catalog__heading">
                <h2>Tất cả sản phẩm</h2>
                <p aria-live="polite">
                    {loading ? 'Đang tải sản phẩm...' : error ? 'Chưa thể tải sản phẩm' :
                        totalResults > 0 ? `${firstResult}–${lastResult} trong ${totalResults} sản phẩm` : '0 sản phẩm'}
                </p>
            </div>

            <div className="shop-toolbar">
                <form className="shop-search" onSubmit={handleSearch} role="search">
                    <input
                        type="search"
                        aria-label="Tìm kiếm theo tên sản phẩm"
                        placeholder="Tìm kiếm sản phẩm..."
                        value={searchInput}
                        onChange={handleSearchInput}
                    />
                    <button type="submit" aria-label="Tìm kiếm sản phẩm">
                        <i className="ti-search" aria-hidden="true" />
                    </button>
                </form>
                <div className="shop-toolbar__controls">
                    <label className="shop-control">
                        <span>Sắp xếp</span>
                        <select value={sort} onChange={(event) => {
                            setSort(event.target.value);
                            setNumberPage(0);
                        }}>
                            <option value="1">Mặc định</option>
                            <option value="2">Theo giá tiền</option>
                            <option value="3">Tên: A đến Z</option>
                        </select>
                    </label>
                    <label className="shop-control shop-control--limit">
                        <span>Hiển thị</span>
                        <select value={limitPage} onChange={(event) => {
                            setLimitPage(Number(event.target.value));
                            setNumberPage(0);
                        }}>
                            <option value={6}>6 sản phẩm</option>
                            <option value={12}>12 sản phẩm</option>
                            <option value={18}>18 sản phẩm</option>
                        </select>
                    </label>
                </div>
            </div>

            <div className="shop-catalog__results" aria-busy={loading}>
                {error && dataProduct.length > 0 && <div className="shop-refresh-error" role="alert">Chưa thể cập nhật sản phẩm. <button type="button" onClick={() => setRetry(value => value + 1)}>Thử lại</button></div>}
                {loading && !loaded ? (
                    <div className="shop-product-grid" aria-hidden="true">
                        {Array.from({ length: limitPage }, (_, index) => (
                            <div className="shop-product-skeleton" key={index}>
                                <div className="shop-product-skeleton__image" />
                                <div className="shop-product-skeleton__body">
                                    <span /><span /><span />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : error && !dataProduct.length ? (
                    <div className="shop-catalog__empty" role="alert">
                        <i className="ti-reload" aria-hidden="true" />
                        <h3>Chưa thể tải sản phẩm</h3>
                        <p>Vui lòng thử lại để tiếp tục xem bộ sưu tập.</p>
                        <button type="button" onClick={() => setRetry((value) => value + 1)}>Thử lại</button>
                    </div>
                ) : dataProduct.length > 0 ? (
                    <div className="shop-product-grid">
                        {dataProduct.map((item, index) => {
                            const detail = item.productDetail && item.productDetail[0];
                            const productImage = detail && detail.productImage && detail.productImage[0];
                            return (
                                <ItemProduct
                                    key={item.id}
                                    id={item.id}
                                    type="shop-product-grid__item"
                                    name={item.name}
                                    brand={item.brandData && item.brandData.value}
                                    img={productImage && productImage.image}
                                    discountPrice={detail && detail.discountPrice}
                                    price={detail && detail.originalPrice}
                                    eager={index < 3}
                                />
                            );
                        })}
                    </div>
                ) : (
                    <div className="shop-catalog__empty">
                        <i className="ti-search" aria-hidden="true" />
                        <h3>Không tìm thấy sản phẩm</h3>
                        <p>Thử tìm với từ khóa khác hoặc lựa chọn danh mục, thương hiệu khác.</p>
                    </div>
                )}
            </div>

            {pageCount > 1 && (
                <nav className="shop-pagination" aria-label="Phân trang sản phẩm" aria-busy={loading}>
                    <ReactPaginate
                        previousLabel={<i className="ti-angle-left" aria-hidden="true" />}
                        nextLabel={<i className="ti-angle-right" aria-hidden="true" />}
                        previousAriaLabel="Trang trước"
                        nextAriaLabel="Trang sau"
                        breakLabel="…"
                        pageCount={pageCount}
                        forcePage={numberPage}
                        disableInitialCallback
                        pageRangeDisplayed={3}
                        marginPagesDisplayed={1}
                        containerClassName="shop-pagination__list"
                        pageClassName="shop-pagination__item"
                        pageLinkClassName="shop-pagination__link"
                        previousClassName="shop-pagination__item"
                        previousLinkClassName="shop-pagination__link"
                        nextClassName="shop-pagination__item"
                        nextLinkClassName="shop-pagination__link"
                        breakClassName="shop-pagination__item"
                        breakLinkClassName="shop-pagination__link"
                        activeClassName="is-active"
                        disabledClassName="is-disabled"
                        onPageChange={handleChangePage}
                        onClick={() => loading ? false : undefined}
                    />
                </nav>
            )}
        </div>
    );
}

export default MainShop;
