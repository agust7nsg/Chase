/** An explicit test-build flag, never evidence of a paid entitlement on the server. */
export function allowProSimulation(development: boolean, testBuild?: string): boolean {
  return development || testBuild === 'true';
}
export const proSimulationEnabled = allowProSimulation(
  typeof __DEV__ !== 'undefined' && __DEV__, process.env.EXPO_PUBLIC_ENABLE_PRO_SIMULATION,
);
