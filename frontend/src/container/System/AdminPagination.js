import React from 'react';
import './AdminPagination.scss';

export default function AdminPagination({ pageCount, forcePage = 0, onPageChange, loading = false, total, pageSize, ariaLabel = 'Phân trang danh sách' }) {
    const pages = Math.max(0, Math.floor(Number(pageCount) || 0));
    if (!pages) return null;
    const page = Math.min(pages - 1, Math.max(0, Number(forcePage) || 0));
    const visible = new Set([0, pages - 1]);
    const start = Math.max(0, Math.min(page - 1, pages - 3));
    for (let index = start; index < Math.min(pages, start + 3); index++) visible.add(index);
    const buttons = [...visible].sort((left, right) => left - right);
    const selectPage = selected => {
        if (!loading && selected !== page && selected >= 0 && selected < pages) onPageChange?.({ selected });
    };
    const range = Number(total) > 0 && pageSize > 0
        ? ` · ${page * pageSize + 1}–${Math.min((page + 1) * pageSize, total)} / ${Number(total).toLocaleString('vi-VN')} kết quả`
        : '';

    return <nav className="admin-pagination" aria-label={ariaLabel} aria-busy={loading}>
        <p className="admin-pagination__summary">Trang {page + 1} / {pages}{range}</p>
        {pages > 1 && <ul className="admin-pagination__pages">
            <li><button type="button" aria-label="Trang trước" disabled={loading || page === 0} onClick={() => selectPage(page - 1)}>Trước</button></li>
            {buttons.map((index, position) => <React.Fragment key={index}>
                {position > 0 && index - buttons[position - 1] > 1 && <li className="admin-pagination__ellipsis" aria-hidden="true"><span>…</span></li>}
                <li><button type="button" aria-label={`Trang ${index + 1}`} aria-current={index === page ? 'page' : undefined} disabled={loading} onClick={() => selectPage(index)}>{index + 1}</button></li>
            </React.Fragment>)}
            <li><button type="button" aria-label="Trang sau" disabled={loading || page === pages - 1} onClick={() => selectPage(page + 1)}>Sau</button></li>
        </ul>}
    </nav>;
}
