'use strict';
module.exports = {
  async up(queryInterface) {
    const values = [
      ['R1', 'Quản trị viên', 'ROLE'], ['R2', 'Khách hàng', 'ROLE'], ['R3', 'Người giao hàng', 'ROLE'], ['R4', 'Nhân viên', 'ROLE'],
      ['M', 'Nam', 'GENDER'], ['F', 'Nữ', 'GENDER'], ['O', 'Khác', 'GENDER'],
      ['S1', 'Đang hoạt động', 'STATUS'], ['S2', 'Ngừng hoạt động', 'STATUS'],
      ['S3', 'Chờ xác nhận', 'STATUS-ORDER'], ['S4', 'Đã xác nhận', 'STATUS-ORDER'],
      ['S5', 'Đang giao hàng', 'STATUS-ORDER'], ['S6', 'Đã giao hàng', 'STATUS-ORDER'], ['S7', 'Đã hủy', 'STATUS-ORDER'],
      ['percent', 'Giảm theo phần trăm', 'DISCOUNT'], ['money', 'Giảm tiền trực tiếp', 'DISCOUNT'],
      ['SIZE_S', 'S', 'SIZE'], ['SIZE_M', 'M', 'SIZE'], ['SIZE_L', 'L', 'SIZE'], ['SIZE_XL', 'XL', 'SIZE'],
    ];
    for (const [code, value, type] of values) {
      const existing = await queryInterface.sequelize.query('SELECT id FROM Allcodes WHERE code = :code LIMIT 1', { replacements: { code }, type: 'SELECT' });
      if (!existing.length) await queryInterface.bulkInsert('Allcodes', [{ code, value, type, createdAt: new Date(), updatedAt: new Date() }]);
    }
  },
  async down() { throw new Error('Reference seed rollback is disabled because application records reference these codes.'); },
};