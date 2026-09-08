import type { UserContext } from "@jinhu/shared";
import type { MenuNode } from "./menu";
import { hasAccess, hasAllPermissions } from "./permissions";

export interface NavigationCommand {
  href: string;
  label: string;
  group: string;
  searchText: string;
}

export function buildNavigationCommands(menus: readonly MenuNode[], user: UserContext | null): NavigationCommand[] {
  const commands: NavigationCommand[] = [];
  const seen = new Set<string>();
  const visit = (item: MenuNode, group: string, inheritedModule?: string, ancestorsAllowed = true) => {
    const moduleCode = item.module ?? inheritedModule;
    const allowed = ancestorsAllowed
      && hasAccess(user, item.permission, moduleCode)
      && hasAllPermissions(user, item.permissions ?? []);
    if (!allowed) return;
    if (item.href && !seen.has(item.href)) {
      seen.add(item.href);
      commands.push({
        href: item.href,
        label: item.label,
        group,
        searchText: normalizeSearchText(`${group} ${item.label} ${item.href}`)
      });
    }
    for (const child of item.children ?? []) visit(child, group, moduleCode, allowed);
  };
  for (const menu of menus) visit(menu, menu.label, menu.module);
  return commands;
}

export function filterNavigationCommands(commands: readonly NavigationCommand[], query: string): NavigationCommand[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return commands.slice(0, 20);
  return commands.filter((command) => command.searchText.includes(normalized)).slice(0, 20);
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}
