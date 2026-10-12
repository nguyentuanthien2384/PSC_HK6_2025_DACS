import { preferredAddressIndex } from './address';

test('checkout initially chooses the persisted default rather than the newest address', () => {
    const addresses = [{ id: 4, isDefault: false }, { id: 1, isDefault: true }, { id: 2, isDefault: false }];
    expect(preferredAddressIndex(addresses)).toBe(1);
    expect(preferredAddressIndex(addresses, 2)).toBe(2);
    expect(preferredAddressIndex(addresses, 99)).toBe(1);
});

test('legacy and empty lists have a deterministic fallback and numeric defaults are accepted', () => {
    expect(preferredAddressIndex([{ id: 4 }, { id: 1 }])).toBe(0);
    expect(preferredAddressIndex([{ id: 4 }, { id: 1, isDefault: 1 }])).toBe(1);
    expect(preferredAddressIndex([])).toBe(0);
});
