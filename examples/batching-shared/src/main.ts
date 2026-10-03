import { runBatchRoute } from '../../shared/batching-routes.js';
runBatchRoute('shared').catch((error) => {
    throw error;
});
