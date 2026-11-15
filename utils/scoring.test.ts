import { getWeightedTotal } from './scoring';
import { expect, test } from 'vitest';

test('getWeightedTotal calculates weighted average correctly', () => {
  const props = {
    sim_terrain: 0.8,
    sim_thermal: 0.4,
    sim_materials: 0.5,
    sim_volatiles: 0.9,
    sim_aeolian: 0.2,
    sim_atmospheric: 0.6,
    sim_subsurface: 0.7
  };
  const weights = { terrain: 1, thermal: 1, materials: 1, volatiles: 1, aeolian: 1, atmospheric: 1, subsurface: 1 };
  const enabled = { terrain: true, thermal: true, materials: true, volatiles: true, aeolian: true, atmospheric: true, subsurface: true };

  const total = getWeightedTotal(props, weights, enabled);
  
  // (0.8 + 0.4 + 0.5 + 0.9 + 0.2 + 0.6 + 0.7) / 7 = 4.1 / 7 ≈ 0.5857
  expect(total).toBeCloseTo(0.5857, 4);
});

test('getWeightedTotal handles disabled dimensions', () => {
  const props = {
    sim_terrain: 1.0,
    sim_thermal: 0.0,
  };
  const weights = { terrain: 1, thermal: 1 };
  const enabled = { terrain: true, thermal: false };

  const total = getWeightedTotal(props, weights, enabled);
  
  // (1.0) / 1 = 1.0
  expect(total).toBe(1.0);
});

test('getWeightedTotal handles missing data with fallback logic', () => {
  // Missing terrain data (null), should skip (assuming no other fallbacks for terrain)
  const props = {
    sim_terrain: null,
    sim_thermal: 0.5,
    wind_p95: 10, // Used for atmospheric fallback
    aod: 0.2      // Used for atmospheric fallback
  };
  const weights = { terrain: 1, thermal: 1, atmospheric: 1 };
  const enabled = { terrain: true, thermal: true, atmospheric: true };

  // Atmospheric: min(1, ((10/25) + 0.2)/2) = min(1, (0.4+0.2)/2) = 0.3
  // Thermal: 0.5
  // Terrain skipped
  // total = (0.5 + 0.3) / 2 = 0.4
  const total = getWeightedTotal(props, weights, enabled);
  
  expect(total).toBeCloseTo(0.4, 2);
});
