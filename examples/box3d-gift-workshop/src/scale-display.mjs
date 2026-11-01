/** Presentation reads the CURRENT qualified native instance, never receipts[0]. */
export function scaleDisplay(station, candidates, contactSupported) {
    const history = [...station.receipts.values()];
    const item = candidates.length === 1 ? candidates[0] : null;
    const key = item && `${item.itemId}:${item.itemGeneration}`;
    const valid =
        contactSupported &&
        item &&
        station.identity === key &&
        !item.held &&
        item.motion?.enabled &&
        item.motion.type === 2 &&
        !item.motion.massPending &&
        Number.isFinite(item.motion.mass);
    const receipt = valid && station.receipts.get(key);
    const matching =
        receipt &&
        receipt.roundGeneration === station.roundGeneration &&
        receipt.itemId === item.itemId &&
        receipt.itemGeneration === item.itemGeneration &&
        receipt.skuId === item.skuId &&
        receipt.measuredMass === item.motion.mass &&
        receipt.configVersion === station.config.configVersion &&
        receipt.scope === station.scope;
    return {
        value: valid ? `${item.motion.mass.toFixed(3)} kg` : '— kg',
        status: !contactSupported
            ? '称重暂不可用：公开接触未获支持'
            : !candidates.length
              ? '秤台为空；历史凭证不是当前称重'
              : candidates.length > 1
                ? '秤台有多件商品，不能称重'
                : matching
                  ? `✓ ${item.itemId} / 第${item.itemGeneration}代当前凭证有效`
                  : station.reason,
        history: history.length
            ? `历史凭证 ${history.length} 份：` +
              history.map((r) => `${r.itemId}/g${r.itemGeneration} ${r.measuredMass.toFixed(3)}kg`).join('，')
            : '尚无历史称重凭证',
    };
}
