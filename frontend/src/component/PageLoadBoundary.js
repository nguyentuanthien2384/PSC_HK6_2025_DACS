import React from 'react';

export default class PageLoadBoundary extends React.Component {
    state = { failed: false };

    static getDerivedStateFromError() { return { failed: true }; }

    render() {
        if (this.state.failed) {
            return <main className="route-loading" role="alert"><div>
                <p>Chưa thể tải trang. Vui lòng kiểm tra kết nối và thử lại.</p>
                <button className="btn btn-outline-success" type="button" onClick={() => window.location.reload()}>Tải lại trang</button>
            </div></main>;
        }
        return this.props.children;
    }
}
