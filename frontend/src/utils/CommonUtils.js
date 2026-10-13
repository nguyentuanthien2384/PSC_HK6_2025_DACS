import { PREFIX_CURRENCY } from '../utils/constant'
class CommonUtils {
    static getBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error)
        })
    }
    static async exportExcel(data, nameSheet, nameFile) {
        // Spreadsheet code is only needed when staff actually exports a file.
        const XLSX = await import('xlsx/xlsx.mjs');
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, nameSheet);
        XLSX.writeFile(wb, `${nameFile}.xlsx`);
        return 'oke';
    }
    static formatter = new Intl.NumberFormat('en-VN', {
        style: 'currency',
        currency: 'VND',
        minimumFractionDigits: PREFIX_CURRENCY.minimumFractionDigits
    })

}

export default CommonUtils;
