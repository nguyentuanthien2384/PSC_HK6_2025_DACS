import { useEffect } from 'react';

export default function RoutePreload({ pages }) {
    useEffect(() => {
        let timer;
        let hoveredLink;
        const cancelHover = () => {
            clearTimeout(timer);
            hoveredLink = undefined;
        };
        const getPage = (target) => {
            const connection = navigator.connection;
            if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '')) return;
            const link = target?.closest?.('a[href]');
            if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
            let url;
            try { url = new URL(link.href, window.location.href); } catch { return; }
            if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
            const key = Object.keys(pages).find((path) => path.endsWith('/') && path !== '/'
                ? url.pathname.startsWith(path) : url.pathname === path);
            return key ? { link, page: pages[key] } : undefined;
        };
        const preload = (page) => { page.preload().catch(() => {}); };
        const onPointerOver = (event) => {
            if (event.pointerType === 'touch') return;
            const result = getPage(event.target);
            if (!result || result.link === hoveredLink) return;
            cancelHover();
            hoveredLink = result.link;
            // Ignore passing across links while scrolling or moving the pointer.
            timer = setTimeout(() => preload(result.page), 80);
        };
        const onPointerOut = (event) => {
            if (hoveredLink && !hoveredLink.contains(event.relatedTarget)) cancelHover();
        };
        const onIntent = (event) => {
            const result = getPage(event.target);
            if (result) preload(result.page);
        };
        document.addEventListener('pointerover', onPointerOver, { passive: true });
        document.addEventListener('pointerout', onPointerOut, { passive: true });
        document.addEventListener('focusin', onIntent);
        document.addEventListener('touchstart', onIntent, { passive: true });
        return () => {
            cancelHover();
            document.removeEventListener('pointerover', onPointerOver);
            document.removeEventListener('pointerout', onPointerOut);
            document.removeEventListener('focusin', onIntent);
            document.removeEventListener('touchstart', onIntent);
        };
    }, [pages]);
    return null;
}
