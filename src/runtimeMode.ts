export function shouldUseDevelopmentScenario(isDevelopment: boolean, search: string): boolean {
  if (!isDevelopment) {
    return false;
  }
  const parameters = new URLSearchParams(search);
  return [...parameters.keys()].some((key) => key === "mpScenario" || key.startsWith("mp") && key.endsWith("Scenario"));
}
