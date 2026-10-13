import CommonUtils from './CommonUtils';

const mockSpreadsheetLoaded = jest.fn();
const mockWriteFile = jest.fn();
jest.mock('xlsx/xlsx.mjs', () => {
    mockSpreadsheetLoaded();
    return { utils: { book_new: () => ({}), json_to_sheet: (data) => data, book_append_sheet: jest.fn() }, writeFile: mockWriteFile };
});

test('price formatting does not initialize spreadsheets; an explicit export loads them and preserves the file name', async () => {
    expect(CommonUtils.formatter.format(120000)).toBeTruthy();
    expect(mockSpreadsheetLoaded).not.toHaveBeenCalled();
    await expect(CommonUtils.exportExcel([{ product: 'Áo polo', stock: 2 }], 'Tồn kho', 'Stock')).resolves.toBe('oke');
    expect(mockSpreadsheetLoaded).toHaveBeenCalledTimes(1);
    expect(mockWriteFile).toHaveBeenCalledWith(expect.any(Object), 'Stock.xlsx');
});
