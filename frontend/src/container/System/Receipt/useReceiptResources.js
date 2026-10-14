import { useCallback, useEffect, useState } from 'react';
import { getAllCodeService, getAllProductAdmin, getAllSupplier } from '../../../services/userService';

export default function useReceiptResources(withSuppliers = false) {
    const [state, setState] = useState({ loading: true, error: '', products: [], suppliers: [], sizeCodes: [] });
    const [version, setVersion] = useState(0);
    const reload = useCallback(() => setVersion(value => value + 1), []);
    useEffect(() => {
        const controller = new AbortController();
        setState(old => ({ ...old, loading: true, error: '' }));
        Promise.all([
            getAllProductAdmin({ categoryId: 'ALL', brandId: 'ALL', keyword: '', signal: controller.signal }),
            withSuppliers ? getAllSupplier({ keyword: '', signal: controller.signal }) : Promise.resolve({ errCode: 0, data: [] }),
            getAllCodeService('SIZE', { signal: controller.signal }),
        ]).then(([catalog, supplierList, sizeList]) => {
            if (controller.signal.aborted) return;
            const failure = [catalog, supplierList, sizeList].find(response => response?.errCode !== 0);
            if (failure) throw new Error(failure.errMessage || 'Không thể tải dữ liệu nhập hàng.');
            if (!catalog || !supplierList || !sizeList) throw new Error('Không thể tải dữ liệu nhập hàng.');
            setState({ loading: false, error: '', products: catalog.data || [], suppliers: supplierList.data || [], sizeCodes: sizeList.data || [] });
        }).catch(failure => {
            if (!controller.signal.aborted) setState({ loading: false, error: failure.message || 'Không thể tải dữ liệu nhập hàng.', products: [], suppliers: [], sizeCodes: [] });
        });
        return () => controller.abort();
    }, [withSuppliers, version]);
    return { ...state, reload };
}
