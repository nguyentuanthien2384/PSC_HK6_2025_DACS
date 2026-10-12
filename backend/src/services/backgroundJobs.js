function startBackgroundJobs(db) {
    if (process.env.BACKGROUND_JOBS_ENABLED === 'false') return () => {};
    const gateway = require('./paymentGatewayService').gateway();
    const shipping = require('./shippingProviderService').createShippingProviderService(db);
    let stopped = false, working = false;
    async function run() {
        if (working || stopped) return;
        working = true;
        try {
            await gateway.runReconciliationBatch();
            if (!stopped) await shipping.runSyncBatch();
        } catch (error) { console.error('Background reconciliation failed:', error.name); }
        finally { working = false; }
    }
    const interval = Math.max(30000, Number(process.env.RECONCILIATION_INTERVAL_MS) || 60000);
    const timer = setInterval(run, interval); timer.unref();
    return () => { stopped = true; clearInterval(timer); };
}
module.exports = { startBackgroundJobs };
