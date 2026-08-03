export interface CandidatePage<T> {
  items: T[];
  total: number;
}

export async function collectAllCandidatePages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<CandidatePage<T>>,
  keyOf: (item: T) => string,
  pageSize = 100
): Promise<T[]> {
  const byKey = new Map<string, T>();
  let page = 1;
  let fetchedCount = 0;
  let total = 0;

  do {
    const response = await fetchPage(page, pageSize);
    total = response.total;
    fetchedCount += response.items.length;
    for (const item of response.items) {
      const key = keyOf(item);
      if (key && !byKey.has(key)) byKey.set(key, item);
    }
    if (response.items.length === 0) break;
    page += 1;
  } while (fetchedCount < total);

  return [...byKey.values()];
}

export function isRetainedCatalogValue(candidateValues: string[], currentValue: string | null | undefined): currentValue is string {
  return Boolean(currentValue) && !candidateValues.includes(currentValue!);
}
