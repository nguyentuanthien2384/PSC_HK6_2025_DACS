import React, { useState } from 'react';

export default function FormSearch({ title, handleSearch, handleOnchange }) {
    const [keyword, setKeyword] = useState('');
    const label = `Tìm kiếm theo ${title}`;
    return <form role="search" aria-label={label} onSubmit={event => { event.preventDefault(); handleSearch(keyword); }}>
        <div className="form-group">
            <div className="input-group mb-3">
                <input type="search" aria-label={label} placeholder={label} className="form-control" value={keyword} maxLength={100} onChange={event => { setKeyword(event.target.value); handleOnchange?.(event.target.value); }} />
                <div className="input-group-append">
                    <button className="btn" type="submit" aria-label={label}><i className="ti-search" aria-hidden="true" /></button>
                </div>
            </div>
        </div>
    </form>;
}



