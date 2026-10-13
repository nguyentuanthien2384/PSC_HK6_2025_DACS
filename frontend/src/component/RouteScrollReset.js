import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export default function RouteScrollReset() {
    const { pathname, hash } = useLocation();
    const previousPath = useRef();

    useLayoutEffect(() => {
        if (previousPath.current === pathname) return;
        previousPath.current = pathname;
        // Leave explicit anchors to the page, including the guides on /about.
        if (!hash) window.scrollTo(0, 0);
    }, [pathname, hash]);

    return null;
}
