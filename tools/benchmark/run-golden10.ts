/**
 * V0.6 T7c — Golden 10 Reference Track 批量执行入口（被 run-golden10-browser.cjs 打包加载）。
 */
import * as path from 'path';
import { TrialRunner, TrialOptions } from './runner/trial';
import { BrowserRuntime } from './runner/browser-runtime.cjs';
import { GOLDEN10, CATALOG_REVISION } from './catalog/golden10';

export async function runGolden10 ({ ids, workRoot, repo, esbuild }: { ids: string[] | null; workRoot: string; repo: string; esbuild: unknown }): Promise<{ id: string; engineResult: string; failureDomain: string; failureReason?: string }[]> {
  const results: { id: string; engineResult: string; failureDomain: string; failureReason?: string }[] = [];
  for (const benchmark of GOLDEN10) {
    if (ids && !ids.includes(benchmark.id)) { continue; }
    const runtime = new BrowserRuntime({ esbuild });
    const runner = new TrialRunner(runtime);
    const options: TrialOptions = {
      benchmark,
      workRoot,
      cocosairRevision: 'browser-run',
      catalogRevision: CATALOG_REVISION,
      agentProfile: 'REFERENCE',
      environment: { os: process.platform, browser: 'chromium-headless', viewport: '480x360', webglBackend: 'angle-swiftshader' },
      cacheMode: 'cold',
      randomSeed: 0,
      fixtureDir: path.join(repo, 'tools', 'benchmark', 'fixtures', benchmark.id),
      referenceDir: path.join(repo, 'tools', 'benchmark', 'references', 'frozen'),
      runtime,
    };
    const outcome = await runner.runReference(options);
    results.push({
      id: benchmark.id,
      engineResult: outcome.engineResult,
      failureDomain: outcome.failureDomain,
      failureReason: outcome.failureReason,
    });
    console.log(`[${benchmark.id}] ${outcome.engineResult}${outcome.failureReason ? ' — ' + outcome.failureReason.slice(0, 200) : ''}`);
    await runtime.stop();
  }
  return results;
}
