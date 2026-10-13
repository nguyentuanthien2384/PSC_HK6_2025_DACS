import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useRefreshOnReturn from '../../../hooks/useRefreshOnReturn';

export const todayVietnam = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
export const recentRange = () => { const to = todayVietnam(); return { from: new Date(Date.parse(`${to}T00:00:00+07:00`) - 29 * 86400000 + 7 * 3600000).toISOString().slice(0, 10), to }; };
export const operationDate = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
export const orderMoney = value => value == null ? 'Chưa chốt tổng tiền' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value));

export function operationsFiltersFromSearch(search, defaults, options = {}) {
    const filters = { ...defaults };
    for (const key of Object.keys(filters)) {
        const value = search.get(key);
        if (value == null) continue;
        if (options[key]) filters[key] = options[key].includes(value) ? value : defaults[key];
        else if (key === 'keyword') filters[key] = value.trim().slice(0, 100);
        else if (key === 'from' || key === 'to') {
            const time = /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00+07:00`) : NaN;
            filters[key] = Number.isFinite(time) && new Date(time + 7 * 3600000).toISOString().slice(0, 10) === value ? value : '';
        }
    }
    const rawPage = search.get('page') || '1';
    const page = /^\d+$/.test(rawPage) && Number(rawPage) >= 1 && Number(rawPage) <= 100000 ? Number(rawPage) : 1;
    return { filters, page };
}

// Keep filters in the URL so dashboard links, the header search and the
// browser Back button update the same mounted screen and its API request.
export function useOperationsFilters(defaults, options) {
    const [search, setSearch] = useSearchParams();
    const serialized = search.toString();
    const { filters, page } = useMemo(() => operationsFiltersFromSearch(new URLSearchParams(serialized), defaults, options), [serialized, defaults, options]);
    const [draft, setDraft] = useState(filters);
    useEffect(() => { setDraft(filters); }, [filters]);
    const apply = useCallback((next, nextPage = 1) => {
        const params = new URLSearchParams();
        Object.keys(defaults).forEach(key => {
            const value = key === 'keyword' ? String(next[key] || '').trim() : next[key];
            if (value !== undefined && value !== '' && value !== defaults[key]) params.set(key, String(value));
        });
        if (nextPage > 1) params.set('page', String(nextPage));
        setSearch(params);
    }, [defaults, setSearch]);
    return { draft, setDraft, filters, page, apply };
}

export function useOperationsQuery(loader, params, refreshEnabled = true) {
    const [state, setState] = useState({ loading: true, error: '', response: null });
    const [revision, setRevision] = useState(0);
    const serial = useRef(0);
    const reload = useCallback(() => setRevision(value => value + 1), []);
    useRefreshOnReturn(reload, refreshEnabled && !state.loading);
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
