export function canCreateHazardFromPage({
  forcedOverdueOnly
}: {
  forcedOverdueOnly?: boolean;
}): boolean {
  return forcedOverdueOnly !== true;
}
