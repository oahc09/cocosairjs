const cp = require('child_process');
const env = { ...process.env };
delete env.COCOSAIR_GALLERY_EXAMPLES;
delete env.COCOSAIR_GALLERY_ARTIFACT;
console.log(JSON.stringify({ galleryFullScope: true, filterPresent: Object.hasOwn(env, 'COCOSAIR_GALLERY_EXAMPLES'), artifactOverridePresent: Object.hasOwn(env, 'COCOSAIR_GALLERY_ARTIFACT') }));
const child = cp.spawn(process.execPath, ['tools/verify/gallery-artifact.cjs', 'all'], { cwd: process.cwd(), env, stdio: 'inherit' });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('close', (code, signal) => { process.exitCode = signal || code == null ? 1 : code; });
