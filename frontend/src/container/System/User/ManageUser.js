import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { changeAdminAccount, getAdminAccounts } from '../../../services/adminAccountService';
import { getUser } from '../../../utils/token';
import './ManageUser.scss';

export const accountRoles = { R1: 'Quản trị viên', R2: 'Khách hàng', R3: 'Shipper', R4: 'Nhân viên vận hành' };
const initialFilters = { keyword: '', roleId: 'ALL', statusId: 'ALL' };
const PAGE_SIZE = 25;
const displayName = user => [user.firstName, user.lastName].filter(Boolean).join(' ') || `Tài khoản #${user.id}`;
const dateText = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';

function AccountChangeDialog({ change, busy, error, onClose, onSubmit }) {
    const [reason, setReason] = useState('');
    const [roleId, setRoleId] = useState(change.user.roleId);
    const dialogRef = useRef(null);
    const reasonRef = useRef(null);
    const closeRef = useRef(onClose);
    const busyRef = useRef(busy);
    closeRef.current = onClose; busyRef.current = busy;
    useEffect(() => {
        const previousFocus = document.activeElement;
        reasonRef.current?.focus();
        const handleKey = event => {
            if (event.key === 'Escape' && !busyRef.current) closeRef.current();
            if (event.key !== 'Tab') return;
            const targets = Array.from(dialogRef.current.querySelectorAll('button:not(:disabled), select:not(:disabled), textarea:not(:disabled)'));
            const first = targets[0], last = targets[targets.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        };
        document.addEventListener('keydown', handleKey);
        return () => { document.removeEventListener('keydown', handleKey); previousFocus?.focus(); };
    }, []);
    const targetStatus = change.user.statusId === 'S1' ? 'S2' : 'S1';
    const valid = reason.trim().length >= 3 && reason.trim().length <= 500 && (change.kind !== 'role' || roleId !== change.user.roleId);
    const title = change.kind === 'role' ? 'Đổi vai trò tài khoản' : targetStatus === 'S2' ? 'Khóa tài khoản' : 'Mở khóa tài khoản';
    return <div className="admin-accounts__modal" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="account-change-title" ref={dialogRef}>
            <h2 id="account-change-title">{title}</h2>
            <p><strong>{displayName(change.user)}</strong> · #{change.user.id}</p>
            <p>{change.kind === 'role' ? `Vai trò hiện tại: ${accountRoles[change.user.roleId] || change.user.roleId}.` : `Trạng thái: ${change.user.statusId === 'S1' ? 'Đang hoạt động → Bị khóa' : 'Bị khóa → Đang hoạt động'}.`}</p>
            <form onSubmit={event => { event.preventDefault(); if (valid && !busy) onSubmit({ id: change.user.id, ...(change.kind === 'role' ? { roleId } : { statusId: targetStatus }), reason: reason.trim() }); }}>
                {change.kind === 'role' && <label>Vai trò mới<select value={roleId} onChange={event => setRoleId(event.target.value)} disabled={busy}>{Object.entries(accountRoles).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>}
                <label>Lý do thay đổi<textarea ref={reasonRef} value={reason} maxLength={500} rows={4} onChange={event => setReason(event.target.value)} disabled={busy} required /></label>
                <small>{reason.trim().length}/500 ký tự. Cần ít nhất 3 ký tự.</small>
                <p className="admin-accounts__session-note">Các phiên đăng nhập cũ của tài khoản này sẽ bị thu hồi. Khi mở khóa, người dùng cần đăng nhập lại.</p>
                {error && <div role="alert" className="alert alert-danger">{error}</div>}
                <div className="admin-accounts__dialog-actions"><button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>Hủy</button><button type="submit" className="btn btn-primary" disabled={!valid || busy}>{busy ? 'Đang cập nhật…' : 'Xác nhận thay đổi'}</button></div>
            </form>
        </section>
    </div>;
}

export default function ManageUser() {
    const [filters, setFilters] = useState(initialFilters);
    const [keyword, setKeyword] = useState('');
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [rows, setRows] = useState([]);
    const [count, setCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [change, setChange] = useState(null);
    const [saving, setSaving] = useState(false);
    const [changeError, setChangeError] = useState('');
    const requestRef = useRef(0);
    const savingRef = useRef(false);
    const mountedRef = useRef(true);
    const currentUser = getUser();
    useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
    useEffect(() => {
        const controller = new AbortController(), request = ++requestRef.current;
        setLoading(true); setError(''); setRows([]);
        getAdminAccounts({ ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }, controller.signal)
            .then(result => {
                if (controller.signal.aborted || request !== requestRef.current) return;
                if (result?.errCode !== 0) throw new Error(result?.errMessage || 'Không thể tải tài khoản.');
                const total = Number(result.count) || 0;
                if (page > 1 && (page - 1) * PAGE_SIZE >= total) { setPage(Math.max(1, Math.ceil(total / PAGE_SIZE))); return; }
                setRows(result.data || []); setCount(total);
            })
            .catch(cause => { if (!controller.signal.aborted && request === requestRef.current) setError(cause.message || 'Không thể tải tài khoản.'); })
            .finally(() => { if (!controller.signal.aborted && request === requestRef.current) setLoading(false); });
        return () => controller.abort();
    }, [filters, page, revision]);
    const updateFilter = (key, value) => { setPage(1); setFilters(previous => ({ ...previous, [key]: value })); };
    const openChange = (user, kind) => { setChangeError(''); setNotice(''); setChange({ user, kind }); };
    const saveChange = async data => {
        if (savingRef.current) return;
        savingRef.current = true; setSaving(true); setChangeError('');
        try {
            const result = await changeAdminAccount(data);
            if (!mountedRef.current) return;
            if (result?.errCode !== 0) throw new Error(result?.errMessage || 'Không thể cập nhật tài khoản.');
            setNotice(result.errMessage || 'Đã cập nhật tài khoản và thu hồi các phiên đăng nhập cũ.');
            setChange(null); setRevision(previous => previous + 1);
        } catch (cause) { if (mountedRef.current) setChangeError(cause.message || 'Không thể cập nhật tài khoản.'); }
        finally { savingRef.current = false; if (mountedRef.current) setSaving(false); }
    };
    const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
    const controlsDisabled = Boolean(change);
    return <div className="admin-accounts container-fluid px-4">
        <header className="admin-accounts__header"><div><p className="admin-accounts__eyebrow">QUẢN TRỊ & PHÂN QUYỀN</p><h1>Quản lý tài khoản</h1><p>Phân quyền, khóa và khôi phục tài khoản với lý do được ghi vào nhật ký.</p></div><Link className="btn btn-primary" to="/system/home/add-user">+ Thêm tài khoản</Link></header>
        {notice && <div role="status" className="alert alert-success">{notice}</div>}
        <form className="admin-accounts__filters" onSubmit={event => { event.preventDefault(); if (!controlsDisabled) updateFilter('keyword', keyword.trim()); }}>
            <label className="admin-accounts__search">Email, tên hoặc số điện thoại<div><input value={keyword} maxLength={100} onChange={event => setKeyword(event.target.value)} disabled={controlsDisabled} /><button className="btn btn-primary" type="submit" disabled={controlsDisabled}>Tìm kiếm</button></div></label>
            <label>Vai trò<select value={filters.roleId} onChange={event => updateFilter('roleId', event.target.value)} disabled={controlsDisabled}><option value="ALL">Tất cả vai trò</option>{Object.entries(accountRoles).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
            <label>Trạng thái<select value={filters.statusId} onChange={event => updateFilter('statusId', event.target.value)} disabled={controlsDisabled}><option value="ALL">Tất cả trạng thái</option><option value="S1">Đang hoạt động</option><option value="S2">Bị khóa</option></select></label>
            <button type="button" className="btn btn-outline-secondary admin-accounts__reset" disabled={controlsDisabled} onClick={() => { setFilters(initialFilters); setKeyword(''); setPage(1); }}>Xóa bộ lọc</button>
        </form>
        {error && <div className="alert alert-danger" role="alert">{error} <button className="btn btn-sm btn-outline-danger" onClick={() => setRevision(previous => previous + 1)}>Thử lại</button></div>}
        <section className="admin-accounts__list" aria-label="Danh sách tài khoản" aria-busy={loading}>
            <div className="admin-accounts__toolbar"><strong>{loading ? 'Đang tải tài khoản…' : `${count.toLocaleString('vi-VN')} tài khoản`}</strong><Link to="/system/home/audit">Xem nhật ký thay đổi</Link></div>
            <div className="table-responsive"><table className="table align-middle"><thead><tr><th>Tài khoản</th><th>Liên hệ</th><th>Vai trò</th><th>Trạng thái</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead>
                <tbody>{loading ? <tr><td colSpan={6} className="admin-accounts__empty">Đang tải dữ liệu…</td></tr> : rows.length ? rows.map(user => {
                    const self = Number(user.id) === Number(currentUser?.id);
                    return <tr key={user.id}><td><strong>{displayName(user)}</strong><small>#{user.id}{self ? ' · Bạn' : ''}</small></td><td>{user.email || '—'}<small>{user.phonenumber || 'Chưa có số điện thoại'}</small></td><td>{accountRoles[user.roleId] || user.roleId}</td><td><span className={`admin-accounts__badge ${user.statusId === 'S1' ? 'is-active' : 'is-locked'}`}>{user.statusId === 'S1' ? 'Đang hoạt động' : 'Bị khóa'}</span></td><td>{dateText(user.createdAt)}</td><td><div className="admin-accounts__row-actions"><Link to={`/system/home/edit-user/${user.id}`}>Sửa thông tin</Link><button onClick={() => openChange(user, 'role')} disabled={self || controlsDisabled} aria-label={`Đổi vai trò ${displayName(user)}`}>Đổi vai trò</button><button onClick={() => openChange(user, 'status')} disabled={self || controlsDisabled} aria-label={`${user.statusId === 'S1' ? 'Khóa' : 'Mở khóa'} ${displayName(user)}`}>{user.statusId === 'S1' ? 'Khóa tài khoản' : 'Mở khóa'}</button>{self && <small>Tài khoản đang đăng nhập</small>}</div></td></tr>;
                }) : <tr><td colSpan={6} className="admin-accounts__empty">{error ? 'Dữ liệu chưa được tải.' : 'Không có tài khoản phù hợp bộ lọc.'}</td></tr>}</tbody></table></div>
            <div className="admin-accounts__pagination"><span>Trang {page}/{pages} · {PAGE_SIZE} tài khoản mỗi trang</span><div><button className="btn btn-outline-secondary" disabled={loading || page <= 1 || controlsDisabled} onClick={() => setPage(previous => previous - 1)}>Trang trước</button><button className="btn btn-outline-secondary" disabled={loading || page >= pages || controlsDisabled} onClick={() => setPage(previous => previous + 1)}>Trang sau</button></div></div>
        </section>
        <p className="admin-accounts__note">Quản trị viên quản lý toàn bộ cửa hàng; nhân viên vận hành xử lý đơn và kho; shipper thực hiện giao hàng; khách hàng mua sắm. Shipper còn đơn đang giao hoặc hoàn kho cần xử lý xong trước khi đổi vai trò hay khóa.</p>
        {change && <AccountChangeDialog change={change} busy={saving} error={changeError} onClose={() => { if (!savingRef.current) setChange(null); }} onSubmit={saveChange} />}
    </div>;
}
