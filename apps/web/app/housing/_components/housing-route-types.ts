import type { Route } from "next";
import type { UrlObject } from "node:url";

export function routeWithSearch<R extends Route>(
  route: R,
  query: URLSearchParams
): R | `${R}?${string}` {
  return query.size ? `${route}?${query.toString()}` : route;
}

export function routeUrlObject(href: string): UrlObject {
  const url = new URL(href, "https://workbench.local");
  return {
    pathname: url.pathname,
    query: Object.fromEntries(url.searchParams),
    hash: url.hash
  };
}

export function detailUrlObject(pathname: string): UrlObject {
  return { pathname };
}
