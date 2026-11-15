export const DIMS = [
  { key: 'terrain', label: 'Terrain', sim: 'sim_terrain' },
  { key: 'thermal', label: 'Thermal', sim: 'sim_thermal' },
  { key: 'materials', label: 'Materials', sim: 'sim_materials' },
  { key: 'volatiles', label: 'Volatiles', sim: 'sim_volatiles' },
  { key: 'aeolian', label: 'Aeolian', sim: 'sim_aeolian' },
  { key: 'atmospheric', label: 'Atmospheric', sim: 'sim_atmospheric' },
  { key: 'subsurface', label: 'Subsurface', sim: 'sim_subsurface' },
] as const;

export function getWeightedTotal(p: Record<string, any>, weights: Record<string, number>, enabled: Record<string, boolean>) {
  let total = 0, wacc = 0;
  for (const d of DIMS) {
    if (!enabled[d.key]) continue;
    let v = p[d.sim];
    // Synthetic fallback for new dimensions if missing
    if (v === null || v === undefined || Number.isNaN(Number(v))) {
      if (d.key === 'atmospheric') v = Math.min(1, ((p.wind_p95 || 0) / 25 + (p.aod || 0)) / 2);
      else if (d.key === 'subsurface') v = Math.min(1, ((p.permafrost || 0) + (p.soil_moist || 0)) / 2);
      else continue;
    }
    const w = weights[d.key] ?? 1;
    total += Number(v) * w;
    wacc += w;
  }
  return wacc > 0 ? total / wacc : 0;
}
