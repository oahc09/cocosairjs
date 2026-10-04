import '../../../../docs/manual/examples/manual-port-recipes/main';
interface PreviewRecipe {
    construct(): Promise<unknown>;
    pauseRestart(): Promise<unknown>;
    negatives(): Promise<unknown>;
    release(): Promise<unknown>;
}
const api = (
    window as unknown as {
        __portRecipes: { recipes: Record<string, PreviewRecipe> };
    }
).__portRecipes;
const recipe = api.recipes['r6-optional-svcs'];
const log = document.getElementById('log')!;
for (const name of ['construct', 'pauseRestart', 'negatives', 'release'] as const) {
    document.getElementById('btn-' + name)!.addEventListener('click', () => {
        recipe[name]().then(
            (result) => {
                log.textContent = JSON.stringify(result, null, 2);
            },
            (error) => {
                log.textContent = String(error);
            },
        );
    });
}
document.getElementById('hud')!.textContent = '先 construct，再 Run Optional Services；点击画布解锁音频。';
export {};
