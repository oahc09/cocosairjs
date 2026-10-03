import { runBatchRoute } from '../../shared/batching-routes.js';
runBatchRoute('dynamic').catch((error) => {
    throw error;
});
