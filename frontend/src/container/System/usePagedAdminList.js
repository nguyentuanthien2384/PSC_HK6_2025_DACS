import { useCallback, useEffect, useMemo, useState } from 'react';
import { PAGINATION } from '../../utils/constant';

// Private catalog data is refreshed on each visit; only the current page stays
// mounted while a replacement request runs. Never cache stock or mutations.
export default function usePagedAdminList(request, params, pageSize = PAGINATION.pagerow) {
    const queryKey = JSON.stringify(params);
    const query = useMemo(() => JSON.parse(queryKey), [queryKey]);
    const [pagination, setPagination] = useState({ queryKey, page: 0 });
    const page = pagination.queryKey === queryKey ? pagination.page : 0;
    if (pagination.queryKey !== queryKey) setPagination({ queryKey, page: 0 });
    const [result, setResult] = useState({ queryKey: '', data: [], count: 0 });
    const [status, setStatus] = useState({ requestKey: '', loading: true, error: '' });
    const [version, setVersion] = useState(0);
    const requestKey = JSON.stringify([queryKey, page, pageSize, version]);
    const currentStatus = status.requestKey === requestKey ? status : { loading: true, error: '' };
    const reload = useCallback(() => setVersion(value => value + 1), []);
    const setPage = nextPage => setPagination({ queryKey, page: nextPage });

    useEffect(() => {
        const controller = new AbortController();
        setStatus({ requestKey, loading: true, error: '' });
        request({ ...query, limit: pageSize, offset: page * pageSize, signal: controller.signal }).then(response => {
            if (controller.signal.aborted) return;
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể tải dữ liệu.');
            const count = Math.max(0, Number(response.count) || 0);
            const lastPage = Math.max(0, Math.ceil(count / pageSize) - 1);
            if (page > lastPage) { setPagination({ queryKey, page: lastPage }); return; }
            setResult({ queryKey, data: response.data || [], count });
        }).catch(failure => {
            if (!controller.signal.aborted) {
                setStatus({ requestKey, loading: false, error: failure.message || 'Không thể tải dữ liệu.' });
                setResult({ queryKey, data: [], count: 0 });
            }
        }).finally(() => {
            if (!controller.signal.aborted) setStatus(previous => previous.requestKey === requestKey ? { ...previous, loading: false } : previous);
        });
        return () => controller.abort();
    }, [request, query, queryKey, page, pageSize, version, requestKey]);

    const visible = result.queryKey === queryKey ? result : { data: [], count: 0 };
    return { data: visible.data, count: Math.ceil(visible.count / pageSize), total: visible.count, page, setPage, loading: currentStatus.loading, error: currentStatus.error, reload };
}
