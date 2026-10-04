// Local offline consumer of the recipe source shipped with the npm manual.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const os = require('node:os'), crypto = require('node:crypto'), http = require('node:http'), { execFileSync } = require('node:child_process');
const SOURCE = 'docs/manual/examples/manual-port-recipes/main.ts';
const OPTIONAL = 'docs/manual/examples/manual-port-recipes/optional-recipe.ts';
const ASSET_ROOT = 'docs/manual/examples/manual-port-recipes/optional-assets';
exports.prepareInstalledRecipes = async (root) => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cocosair-recipes-consumer-'));
    const cleanup = () => {
        const resolved = path.resolve(temp), base = path.resolve(os.tmpdir()) + path.sep;
        if (!resolved.startsWith(base) || !path.basename(resolved).startsWith('cocosair-recipes-consumer-')
            || fs.lstatSync(resolved).isSymbolicLink()) throw new Error('Unsafe consumer cleanup target');
        fs.rmSync(resolved, { recursive: true, force: true });
    };
    try {
        const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
        assert(fs.existsSync(npmCli), 'npm CLI unavailable');
        const run = (args, cwd) => execFileSync(process.execPath, [npmCli, ...args], { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
        const packed = JSON.parse(run(['pack', '--json', '--pack-destination=' + temp], root))[0];
        const tarball = path.join(temp, path.basename(packed.filename));
        const packageName = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name;
        fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: { [packageName]: 'file:' + tarball } }));
        const installOutput = run(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], temp);
        const packageRoot = path.join(temp, 'node_modules', packageName), installedSource = path.join(packageRoot, SOURCE);
        const bytes = fs.readFileSync(installedSource); assert(bytes.equals(fs.readFileSync(path.join(root, SOURCE))), 'Installed recipe differs from manual source');
        // Check the exact installed TS source against declarations resolved from
        // the actual installed package. No repository declaration path alias.
        const config = path.join(temp, 'recipe-types.json');
        fs.writeFileSync(config, JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Node', strict: true,
            noEmit: true, skipLibCheck: true, lib: ['ES2022', 'DOM'], baseUrl: temp, paths: { cocosair: ['./node_modules/' + packageName] },
            types: [] }, files: [installedSource] }));
        const tsc = path.join(root, 'node_modules/typescript/bin/tsc');
        const typeOutput = execFileSync(process.execPath, [tsc, '-p', config, '--listFiles'], { cwd: temp, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
        assert(typeOutput.replaceAll('\\', '/').includes(packageRoot.replaceAll('\\', '/') + '/build/cocosair.module.d.ts'), 'SDK types not loaded from installed package');
        assert(typeOutput.replaceAll('\\','/').includes(path.join(packageRoot,OPTIONAL).replaceAll('\\','/')), 'Installed optional source was not type checked');
        assert(!typeOutput.replaceAll('\\', '/').includes(root.replaceAll('\\', '/') + '/build/'), 'Repository declarations leaked into consumer');
        const runtime = path.join(temp, 'runtime.ts'); fs.writeFileSync(runtime, `export * from '${packageName}';\n`);
        const built = await require('esbuild').build({ entryPoints: [runtime], outdir: path.join(temp, 'chunks'), entryNames: '[name]', chunkNames: 'chunk-[hash]',
            bundle: true, splitting: true, format: 'esm', platform: 'browser', target: 'es2022', write: false });
        const recipe = await require('esbuild').build({ entryPoints: [installedSource], bundle: true, write: false, format: 'esm', target: 'es2022', platform: 'browser', external: ['cocosair'] });
        const contents = new Map(built.outputFiles.map((f) => ['/installed/' + path.basename(f.path), f.text]));
        const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
        const optionalBytes=fs.readFileSync(path.join(packageRoot,OPTIONAL));assert(optionalBytes.equals(fs.readFileSync(path.join(root,OPTIONAL))));
        const assets={},mimeTypes=new Map();
        for(const name of ['manifest.json','tone4s.wav']) {
            const assetBytes=fs.readFileSync(path.join(packageRoot,ASSET_ROOT,name));assert(assetBytes.equals(fs.readFileSync(path.join(root,ASSET_ROOT,name))));
            const url='/installed/assets/'+name;contents.set(url,assetBytes);mimeTypes.set(url,name.endsWith('.wav')?'audio/wav':'application/json');
            assets[name]={bytes:assetBytes.length,sha256:hash(assetBytes),source:ASSET_ROOT+'/'+name};
        }
        // WebKit media loading can bypass/decline intercepted response bodies.
        // Serve the verified installed bytes over real HTTP, with no workspace
        // resource fallback. Unknown URLs are genuine 404 responses.
        const startAssetServer = async () => {
            const server=http.createServer((req,res)=>{
                const pathname=new URL(req.url,'http://localhost').pathname;
                const key='/installed'+pathname, body=pathname.startsWith('/assets/')?contents.get(key):undefined;
                const headers={'Access-Control-Allow-Origin':'*','Content-Type':mimeTypes.get(key)||'application/octet-stream'};
                res.writeHead(body===undefined?404:200,headers);res.end(body);
            });
            await new Promise((resolve)=>server.listen(0,'127.0.0.1',resolve));
            return {origin:'http://127.0.0.1:'+server.address().port,close:()=>new Promise((resolve)=>server.close(resolve))};
        };
        return { contents, mimeTypes, fixtureBody: recipe.outputFiles[0].text, cleanup, startAssetServer,
            identity: { method: 'ACTUAL_TARBALL_OFFLINE_INSTALL', packageName,
                tarball: { filename: packed.filename, bytes: fs.statSync(tarball).size, sha256: hash(fs.readFileSync(tarball)) },
                source: { path: SOURCE, bytes: bytes.length, sha256: hash(bytes), matchesRepositoryManual: true },
                optionalSource:{path:OPTIONAL,bytes:optionalBytes.length,sha256:hash(optionalBytes),matchesRepositoryManual:true},assets,
                typecheck: { version: require(path.join(root, 'node_modules/typescript/package.json')).version, command: [process.execPath, tsc, '-p', config, '--listFiles'], exitCode: 0,
                    installedDeclarationsOnly: true, rawOutput: typeOutput },
                chunks: Object.fromEntries(built.outputFiles.map((f) => [path.basename(f.path), { bytes: f.contents.length, sha256: hash(f.contents) }])), installOutput } };
    } catch (error) { cleanup(); throw error; }
};
