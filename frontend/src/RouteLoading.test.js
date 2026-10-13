import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

const mockAdminLoaded = jest.fn();
jest.mock('react-router-dom', () => ({
    BrowserRouter: ({ children }) => <>{children}</>,
    Routes: ({ children }) => children.find((route) => route.props.path === globalThis.window.location.pathname)?.props.element || null,
    Route: () => null,
    Navigate: ({ to }) => <div>Redirect: {to}</div>,
    useLocation: () => ({ pathname: globalThis.window.location.pathname, search: '' }),
    useParams: () => ({}),
}), { virtual: true });
jest.mock('./container/Header/Header', () => () => <header>Store header</header>);
jest.mock('./container/Header/TopMenu', () => () => <header>Top menu</header>);
jest.mock('./container/Footer/Footer', () => () => <footer>Store footer</footer>);
jest.mock('./container/Home/HomePage', () => () => <div>Home collection</div>);
jest.mock('./container/System/HomePageAdmin', () => {
    mockAdminLoaded();
    return () => <div>Admin page</div>;
});

beforeEach(() => jest.spyOn(window, 'scrollTo').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('the storefront shell stays visible while the selected page loads and unrelated admin code stays deferred', async () => {
    window.history.replaceState(null, '', '/');
    render(<App />);
    expect(screen.getByText('Store header')).toBeInTheDocument();
    expect(screen.getByText('Store footer')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải trang');
    expect(await screen.findByText('Home collection')).toBeInTheDocument();
    expect(mockAdminLoaded).not.toHaveBeenCalled();
});
