import { createAirApp, Scene, utils } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('B003');
const asset = await utils.loadAssetAsync('assets/demo.txt');
console.log('[B003] asset content:', asset);
app.run(scene);
