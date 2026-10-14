export function notificationDestination(notification) {
    const link = notification.link;
    return typeof link === 'string' && /^\/(?:user\/order\/\d+|system\/home\/order-detail\/\d+|shipper)(?:\?[^\\\r\n#]*)?$/.test(link) ? link : null;
}
