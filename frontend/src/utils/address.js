export const preferredAddressIndex = (addresses = [], preferredId) => {
    const requested = preferredId == null ? -1 : addresses.findIndex(row => Number(row.id) === Number(preferredId));
    const defaultIndex = addresses.findIndex(row => row.isDefault === true || row.isDefault === 1);
    return requested >= 0 ? requested : defaultIndex >= 0 ? defaultIndex : 0;
};
