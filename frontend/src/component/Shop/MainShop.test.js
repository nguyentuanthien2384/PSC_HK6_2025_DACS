import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MainShop from './MainShop';
import { getAllProductUser } from '../../services/userService';

jest.mock('../../services/userService', () => ({ getAllProductUser: jest.fn() }));
jest.mock('../Product/ItemProduct', () => ({ name }) => <article>{name}</article>);
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
    }));
    expect(await screen.findByTestId('active-page')).toHaveTextContent('1');

    await goToSecondPage();
    fireEvent.change(search, { target: { value: '' } });
    await waitFor(() => expect(getAllProductUser).toHaveBeenLastCalledWith(
        expect.objectContaining({ keyword: '', offset: 0, categoryId: 'SHOES', brandId: 'BRAND1' }),
    ));
    expect(await screen.findByTestId('active-page')).toHaveTextContent('1');
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
