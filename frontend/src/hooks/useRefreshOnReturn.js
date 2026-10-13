import { useEffect, useRef } from 'react';

// Browsers can emit both events when a tab becomes active; refresh once per return.
export default function useRefreshOnReturn(refresh, enabled = true) {
    const callback = useRef(refresh);
    const allowed = useRef(enabled);
    callback.current = refresh;
    allowed.current = enabled;
    useEffect(() => {
        let timer;
        const schedule = () => {
            if (document.visibilityState === 'hidden' || !allowed.current) return;
            clearTimeout(timer);
            timer = setTimeout(() => {
                if (document.visibilityState !== 'hidden' && allowed.current) callback.current();
            }, 100);
        };
        window.addEventListener('focus', schedule);
        document.addEventListener('visibilitychange', schedule);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('focus', schedule);
            document.removeEventListener('visibilitychange', schedule);
        };
    }, []);
}
