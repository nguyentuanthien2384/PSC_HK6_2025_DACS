import React, { useId } from 'react';
import ItemProduct from '../Product/ItemProduct';
import ProductCollectionHeader from './ProductCollectionHeader';
import ProductCollectionState from './ProductCollectionState';
import './ProductFeature.scss';

function NewProductFeature({ title, description, data = [], loading = false, error = '' }) {
    const titleId = useId();

    return (
        <section className="product-collection product-collection--new" aria-labelledby={titleId} aria-busy={loading}>
            <div className="product-collection__container">
                <ProductCollectionHeader titleId={titleId} title={title} eyebrow="Vừa có mặt" description={description} />
                {loading || error || !data.length ? (
                    <ProductCollectionState loading={loading} error={error} />
                ) : (
                    <div className="product-collection__grid" role="list" aria-label={title}>
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
                                        badge="Mới"
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

export default NewProductFeature;
