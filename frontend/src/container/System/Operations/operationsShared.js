import { useCallback, useEffect, useRef, useState } from 'react';

export const todayVietnam = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
export const recentRange = () => { const to = todayVietnam(); return { from: new Date(Date.parse(`${to}T00:00:00+07:00`) - 29 * 86400000 + 7 * 3600000).toISOString().slice(0, 10), to }; };
export const operationDate = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
export const orderMoney = value => value == null ? 'Chưa chốt tổng tiền' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value));

export function useOperationsQuery(loader, params) {
    const [state, setState] = useState({ loading: true, error: '', response: null });
    const [revision, setRevision] = useState(0);
    const serial = useRef(0);
    const reload = useCallback(() => setRevision(value => value + 1), []);
    useEffect(() => {
        const controller = new AbortController(); const sequence = ++serial.current;
        setState(old => ({ ...old, loading: true, error: '' }));
        Promise.resolve().then(() => loader(params, controller.signal)).then(response => {
            if (controller.signal.aborted || sequence !== serial.current) return;
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể tải dữ liệu vận hành.');
            setState({ loading: false, error: '', response });
        }).catch(error => {
            if (!controller.signal.aborted && sequence === serial.current) setState(old => ({ ...old, loading: false, error: error.message || 'Không thể kết nối máy chủ.' }));
        });
        return () => { controller.abort(); serial.current += 1; };
    }, [loader, params, revision]);
    return { ...state, reload };
}
