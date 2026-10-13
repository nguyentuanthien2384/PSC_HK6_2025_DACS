import React from 'react';
import { Link } from 'react-router-dom';

export default function Footer() {
    return <footer className="admin-footer"><span>DACS · Quản trị cửa hàng</span><Link to="/">Mở trang bán hàng <span aria-hidden="true">↗</span></Link></footer>;
}
