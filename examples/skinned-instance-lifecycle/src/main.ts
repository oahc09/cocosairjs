import { runShowroom } from '../../material-inspection-showroom/src/showroom.js';

void runShowroom('skinned-instance-lifecycle').catch((error) => {
    (window as any).__exampleError = String(error);
    const status = document.getElementById('error');
    if (status) status.textContent = String(error);
    console.error(error);
});
