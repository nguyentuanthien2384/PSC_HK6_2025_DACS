import React, { useEffect, useId, useRef, useState } from 'react';
import ItemProduct from '../Product/ItemProduct';
import ProductCollectionHeader from './ProductCollectionHeader';
import ProductCollectionState from './ProductCollectionState';
import './ProductFeature.scss';

function ProductFeature({ title, description, eyebrow = 'Được yêu thích', data = [], loading = false, error = '', hideWhenEmpty = false }) {
    const titleId = useId();
    const carouselRef = useRef(null);
    const [navigation, setNavigation] = useState({ previous: false, next: false });

    useEffect(() => {
        const carousel = carouselRef.current;
        if (!carousel) return;
        const updateNavigation = () => {
            setNavigation({
                previous: carousel.scrollLeft > 2,
                next: carousel.scrollLeft + carousel.clientWidth < carousel.scrollWidth - 2,
            });
        };
        updateNavigation();
        const observer = new ResizeObserver(updateNavigation);
        observer.observe(carousel);
        carousel.addEventListener('scroll', updateNavigation, { passive: true });
        return () => {
            observer.disconnect();
            carousel.removeEventListener('scroll', updateNavigation);
        };
    }, [data, loading, error]);

    const moveCarousel = (direction) => {
        const carousel = carouselRef.current;
        if (!carousel) return;
        const firstCard = carousel.firstElementChild;
        const gap = parseFloat(window.getComputedStyle(carousel).columnGap) || 0;
        const distance = firstCard ? firstCard.getBoundingClientRect().width + gap : carousel.clientWidth;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        carousel.scrollBy({ left: direction * distance, behavior: reducedMotion ? 'auto' : 'smooth' });
    };

    if (hideWhenEmpty && !loading && !error && !data.length) return null;

    return (
        <section className="product-collection" aria-labelledby={titleId} aria-busy={loading}>
            <div className="product-collection__container">
                <ProductCollectionHeader
                    titleId={titleId}
                    title={title}
                    eyebrow={eyebrow}
                    description={description || 'Khám phá những thiết kế nổi bật dành cho phong cách của bạn.'}
                >
                    {!!data.length && !loading && !error && (
                        <div className="product-collection__navigation" aria-label={`Điều hướng ${title}`}>
                            <button type="button" onClick={() => moveCarousel(-1)} disabled={!navigation.previous} aria-label={`Xem sản phẩm trước trong ${title}`}>
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
                            </button>
                            <button type="button" onClick={() => moveCarousel(1)} disabled={!navigation.next} aria-label={`Xem sản phẩm tiếp theo trong ${title}`}>
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg>
                            </button>
                        </div>
                    )}
                </ProductCollectionHeader>
                {loading || error || !data.length ? (
                    <ProductCollectionState loading={loading} error={error} />
                ) : (
                    <div ref={carouselRef} className="product-collection__carousel" role="list" aria-label={title} tabIndex={0}>
                        {data.map((item) => {
                            const detail = item.productDetail?.[0];
                            return (
                                <div key={item.id} role="listitem" className="product-collection__item">
                                    <ItemProduct
                                        id={item.id}
                                        name={item.name}
                                        brand={item.brandData?.value}
                                        img={detail?.productImage?.[0]?.image}
                                        price={detail?.originalPrice}
                                        discountPrice={detail?.discountPrice}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}

export default ProductFeature;
