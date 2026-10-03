import { runBatchRoute } from '../../shared/batching-routes.js';
runBatchRoute('merged').catch((error) => {
    throw error;
});
