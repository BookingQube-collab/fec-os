export type DepartmentTreeRow = {
  id: string;
  name: string;
  code?: string | null;
  active?: boolean;
  sort_order?: number;
  parent_id?: string | null;
};

export type DepartmentTreeItem<T extends DepartmentTreeRow> = T & { depth: number };

export function sortDepartmentsTree<T extends DepartmentTreeRow>(rows: T[]): DepartmentTreeItem<T>[] {
  const ids = new Set(rows.map((r) => r.id));
  const byParent = new Map<string | null, T[]>();
  for (const row of rows) {
    const parentKey = row.parent_id && ids.has(row.parent_id) ? row.parent_id : null;
    const list = byParent.get(parentKey) ?? [];
    list.push(row);
    byParent.set(parentKey, list);
  }
  const sortSibs = (list: T[]) =>
    list.sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name),
    );
  for (const list of byParent.values()) sortSibs(list);

  const out: DepartmentTreeItem<T>[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    for (const row of byParent.get(parentId) ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push({ ...row, depth });
      walk(row.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function departmentPathName(
  dept: Pick<DepartmentTreeRow, "id" | "name" | "parent_id">,
  byId: Map<string, Pick<DepartmentTreeRow, "name" | "parent_id">>,
): string {
  const parts = [dept.name];
  let parentId = dept.parent_id;
  const guard = new Set<string>([dept.id]);
  while (parentId && !guard.has(parentId)) {
    const parent = byId.get(parentId);
    if (!parent) break;
    parts.unshift(parent.name);
    guard.add(parentId);
    parentId = parent.parent_id;
  }
  return parts.join(" / ");
}

export function formatDepartmentTreeLabel(name: string, depth: number): string {
  if (depth <= 0) return name;
  return `${"\u00a0\u00a0".repeat(depth)}↳ ${name}`;
}

export function departmentChildrenOf<T extends DepartmentTreeRow>(rows: T[], parentId: string): T[] {
  return rows.filter((row) => row.parent_id === parentId);
}
