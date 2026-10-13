import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MainShop from './MainShop';
import { getAllProductUser } from '../../services/userService';

jest.mock('../../services/userService', () => ({ getAllProductUser: jest.fn() }));
jest.mock('../Product/ItemProduct', () => ({ id, name }) => <article aria-label={'Sản phẩm ' + id}>{name}</article>);
jest.mock('react-paginate', () => ({ forcePage, onPageChange }) => (
    <div>
        <span data-testid="active-page">{forcePage + 1}</span>
        <button type="button" onClick={() => onPageChange({ selected: 1 })}>Trang 2</button>
    </div>
));

const response = (name = 'Sản phẩm hiện tại') => ({
    errCode: 0,
    count: 36,
    data: [{ id: 1, name }],
});
const defaultFilters = {
    categoryId: 'ALL',
    brandId: 'ALL',
    myRef: { current: { scrollIntoView: jest.fn() } },
};

beforeEach(() => {
    jest.clearAllMocks();
    getAllProductUser.mockResolvedValue(response());
});

async function goToSecondPage() {
    fireEvent.click(await screen.findByRole('button', { name: 'Trang 2' }));
    await waitFor(() => expect(getAllProductUser).toHaveBeenLastCalledWith(
        expect.objectContaining({ offset: expect.any(Number) }),
    ));
    await waitFor(() => expect(screen.getByTestId('active-page')).toHaveTextContent('2'));
}

test('submitting or clearing a search resets the page while preserving category and brand filters', async () => {
    render(<MainShop {...defaultFilters} categoryId="SHOES" brandId="BRAND1" />);
    await goToSecondPage();
    expect(getAllProductUser).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 6 }));

    const search = screen.getByRole('searchbox', { name: 'Tìm kiếm theo tên sản phẩm' });
    fireEvent.change(search, { target: { value: '  sneaker  ' } });
    fireEvent.submit(screen.getByRole('search'));
    await waitFor(() => expect(getAllProductUser).toHaveBeenLastCalledWith({
        categoryId: 'SHOES', brandId: 'BRAND1', keyword: 'sneaker',
        limit: 6, offset: 0, sortName: '', sortPrice: '',
        signal: expect.any(AbortSignal),
    }));
    expect(await screen.findByTestId('active-page')).toHaveTextContent('1');

    await goToSecondPage();
    fireEvent.change(search, { target: { value: '' } });
    await waitFor(() => expect(getAllProductUser).toHaveBeenLastCalledWith(
        expect.objectContaining({ keyword: '', offset: 0, categoryId: 'SHOES', brandId: 'BRAND1' }),
    ));
    expect(await screen.findByTestId('active-page')).toHaveTextContent('1');
});

test('filtering from page two starts only the first page request and cancels the previous filter transport', async () => {
    const { rerender } = render(<MainShop {...defaultFilters} />);
    await goToSecondPage();
    const previousSignal = getAllProductUser.mock.calls.at(-1)[0].signal;
    getAllProductUser.mockClear();
    rerender(<MainShop {...defaultFilters} categoryId="NEW_CATEGORY" />);
    await screen.findByText('Sản phẩm hiện tại');
    expect(previousSignal.aborted).toBe(true);
    expect(getAllProductUser).toHaveBeenCalledTimes(1);
    expect(getAllProductUser).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'NEW_CATEGORY', offset: 0 }));
});

test('changing sort or page size restarts pagination and default sort clears previous sort arguments', async () => {
    render(<MainShop {...defaultFilters} />);
    await goToSecondPage();
    const sort = screen.getByRole('combobox', { name: 'Sắp xếp' });
    fireEvent.change(sort, { target: { value: '2' } });
    await waitFor(() => expect(getAllProductUser).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortPrice: true, sortName: '', offset: 0 }),
    ));
    expect(await screen.findByTestId('active-page')).toHaveTextContent('1');

    await goToSecondPage();
    fireEvent.change(sort, { target: { value: '3' } });
    await waitFor(() => expect(getAllProductUser).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortPrice: '', sortName: true, offset: 0 }),
    ));

    fireEvent.change(sort, { target: { value: '1' } });
    await waitFor(() => expect(getAllProductUser).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortPrice: '', sortName: '', offset: 0 }),
    ));
    await goToSecondPage();
    fireEvent.change(screen.getByRole('combobox', { name: 'Hiển thị' }), { target: { value: '12' } });
    await waitFor(() => expect(getAllProductUser).toHaveBeenLastCalledWith(
        expect.objectContaining({ limit: 12, offset: 0 }),
    ));
    expect(await screen.findByTestId('active-page')).toHaveTextContent('1');
});

test('filter changes reset pagination and a slow obsolete response cannot replace the latest results', async () => {
    let resolveOldRequest;
    const oldRequest = new Promise((resolve) => { resolveOldRequest = resolve; });
    getAllProductUser.mockImplementation(({ categoryId }) => categoryId === 'OLD_CATEGORY'
        ? oldRequest
        : Promise.resolve(response(categoryId === 'NEW_CATEGORY' ? 'Bộ sưu tập mới' : 'Sản phẩm hiện tại')));

    const { rerender } = render(<MainShop {...defaultFilters} />);
    await goToSecondPage();
    rerender(<MainShop {...defaultFilters} categoryId="OLD_CATEGORY" />);
    await waitFor(() => expect(getAllProductUser).toHaveBeenLastCalledWith(
        expect.objectContaining({ categoryId: 'OLD_CATEGORY', offset: 0 }),
    ));

    rerender(<MainShop {...defaultFilters} categoryId="NEW_CATEGORY" brandId="NEW_BRAND" />);
    expect(await screen.findByText('Bộ sưu tập mới')).toBeInTheDocument();
    expect(getAllProductUser).toHaveBeenLastCalledWith(expect.objectContaining({
        categoryId: 'NEW_CATEGORY', brandId: 'NEW_BRAND', offset: 0,
    }));
    expect(screen.getByTestId('active-page')).toHaveTextContent('1');

    await act(async () => { resolveOldRequest(response('Kết quả cũ')); });
    expect(screen.getByText('Bộ sưu tập mới')).toBeInTheDocument();
    expect(screen.queryByText('Kết quả cũ')).not.toBeInTheDocument();
});

const products = (id = 1, name = 'Áo mẫu') => ({ errCode: 0, data: [{ id, name }], count: 20 });
test('returning refreshes products once and keeps cards and pagination during a slow refresh', async () => {
    let finishRefresh;
    getAllProductUser.mockResolvedValueOnce(products()).mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
    render(<MainShop />);
    const card = await screen.findByRole('article', { name: 'Sản phẩm 1' });
    fireEvent.focus(window);
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(getAllProductUser).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('article', { name: 'Sản phẩm 1' })).toBe(card);
    expect(screen.getByRole('navigation', { name: 'Phân trang sản phẩm' })).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelectorAll('.shop-product-skeleton')).toHaveLength(0);
    await act(async () => finishRefresh(products(2, 'Áo mới')));
    expect(screen.getByRole('article', { name: 'Sản phẩm 2' })).toHaveTextContent('Áo mới');
});

test('transient refresh errors keep the last products available and offer retry', async () => {
    getAllProductUser.mockResolvedValueOnce(products()).mockRejectedValueOnce(new Error('Mất kết nối'));
    render(<MainShop />);
    const card = await screen.findByRole('article', { name: 'Sản phẩm 1' });
    fireEvent.focus(window);
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa thể cập nhật sản phẩm');
    expect(screen.getByRole('article', { name: 'Sản phẩm 1' })).toBe(card);
    getAllProductUser.mockResolvedValueOnce(products(3, 'Sản phẩm mới'));
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('article', { name: 'Sản phẩm 3' })).toBeInTheDocument();
});

test('a superseded category request is aborted and cannot overwrite newer products', async () => {
    let finishOld;
    getAllProductUser.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; })).mockResolvedValueOnce(products(2, 'Áo mới'));
    const { rerender } = render(<MainShop categoryId="A" />);
    const previousSignal = getAllProductUser.mock.calls[0][0].signal;
    rerender(<MainShop categoryId="B" />);
    expect(await screen.findByRole('article', { name: 'Sản phẩm 2' })).toBeInTheDocument();
    expect(previousSignal.aborted).toBe(true);
    await act(async () => finishOld(products()));
    expect(screen.queryByRole('article', { name: 'Sản phẩm 1' })).not.toBeInTheDocument();
});
