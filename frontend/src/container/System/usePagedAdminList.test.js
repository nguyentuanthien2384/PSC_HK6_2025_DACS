import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import usePagedAdminList from './usePagedAdminList';

function List({ request, id }) {
    const { data, page, setPage, loading, error, reload } = usePagedAdminList(request, { id }, 2);
    return <><button onClick={() => setPage(page + 1)}>Next</button><button onClick={reload}>Reload</button><p>{error}</p><ul aria-busy={loading}>{data.map(row => <li key={row.id}>{row.name}</li>)}</ul></>;
}
const rows = (name, count = 6) => ({ errCode: 0, data: [{ id: 1, name }], count });

test('changing product cancels the old request, resets pagination and ignores out-of-order rows', async () => {
    let finishOld;
    const request = jest.fn().mockResolvedValueOnce(rows('First')).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; })).mockResolvedValueOnce(rows('Other product'));
    const view = render(<List request={request} id="1" />);
    await screen.findByText('First');
    const node = screen.getByText('First');
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('First')).toBe(node);
    expect(node.closest('ul')).toHaveAttribute('aria-busy', 'true');
    const signal = request.mock.calls[1][0].signal;
    expect(request.mock.calls[1][0].offset).toBe(2);
    view.rerender(<List request={request} id="2" />);
    expect(signal.aborted).toBe(true);
    await screen.findByText('Other product');
    expect(request.mock.calls[2][0]).toEqual(expect.objectContaining({ id: '2', offset: 0, limit: 2 }));
    await act(async () => finishOld(rows('Stale first product')));
    expect(screen.queryByText('Stale first product')).not.toBeInTheDocument();
    view.unmount();
    expect(request.mock.calls[2][0].signal.aborted).toBe(true);
});

test('removing the final row of a page returns to the nearest valid page', async () => {
    const request = jest.fn().mockResolvedValueOnce(rows('First')).mockResolvedValueOnce(rows('Page two')).mockResolvedValueOnce(rows('Removed', 1)).mockResolvedValueOnce(rows('Remaining', 1));
    render(<List request={request} id="1" />);
    await screen.findByText('First');
    fireEvent.click(screen.getByText('Next')); await screen.findByText('Page two');
    fireEvent.click(screen.getByText('Reload')); await screen.findByText('Remaining');
    expect(request.mock.calls.map(([params]) => params.offset)).toEqual([0, 2, 2, 0]);
});

test('failed page reads clear obsolete data and can be retried', async () => {
    const request = jest.fn().mockResolvedValueOnce(rows('First')).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(rows('Retried'));
    render(<List request={request} id="1" />);
    await screen.findByText('First'); fireEvent.click(screen.getByText('Reload'));
    await screen.findByText('Offline'); expect(screen.queryByText('First')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Reload')); await screen.findByText('Retried');
    await waitFor(() => expect(screen.getByRole('list')).toHaveAttribute('aria-busy', 'false'));
});

test('returning to an earlier product resets its page instead of restoring obsolete pagination', async () => {
    const request = jest.fn().mockResolvedValue(rows('Result'));
    const view = render(<List request={request} id="1" />);
    await screen.findByText('Result');
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ id: '1', offset: 2 })));
    view.rerender(<List request={request} id="2" />);
    await waitFor(() => expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ id: '2', offset: 0 })));
    view.rerender(<List request={request} id="1" />);
    await waitFor(() => expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ id: '1', offset: 0 })));
});
