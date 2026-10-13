let server;
function setSessionServer(io) { server = io; }
function revokeSessionsAfterCommit(userId, transaction) {
    if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0 || !transaction?.afterCommit) return;
    transaction.afterCommit(() => {
        // Never disconnect a user's live session for a rolled-back account change.
        try { server?.in(`user:${Number(userId)}`).disconnectSockets(true); }
        catch { /* Version validation remains authoritative on HTTP and reconnect. */ }
    });
}
module.exports = { setSessionServer, revokeSessionsAfterCommit };
