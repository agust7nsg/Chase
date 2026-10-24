/** App-side guard only. The server separately controls the temporary test window. */
export const scannerProSimulation = (development: boolean, requested: boolean): boolean => development && requested;
export const scannerSimulationHeaders = (enabled?: boolean): Record<string, string> => enabled ? { 'X-Chase-Pro-Simulation': '1' } : {};
