import React, { lazy, Suspense } from 'react';
import PageLoadBoundary from '../component/PageLoadBoundary';

// Navigation and intent preloading share one import. Only code is retained;
// each mounted page still reads current prices, stock and account data.
export function lazyWithPreload(loader) {
    let pending;
    const preload = () => {
        if (!pending) {
            pending = Promise.resolve().then(loader).catch((error) => {
                pending = undefined;
                throw error;
            });
        }
        return pending;
    };
    const Page = lazy(preload);
    Page.preload = preload;
    return Page;
}

export function lazyPage(loader) {
    const Page = lazyWithPreload(loader);
    function DeferredPage(props) {
        return <PageLoadBoundary><Suspense fallback={<main className="route-loading" role="status">Đang tải trang…</main>}><Page {...props} /></Suspense></PageLoadBoundary>;
    }
    DeferredPage.preload = Page.preload;
    return DeferredPage;
}
