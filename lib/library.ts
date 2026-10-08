import type { RecordingMode, StudioProject } from "@/types/project";

export type LibraryTypeFilter = "all" | RecordingMode;
export type LibraryDateFilter = "any" | "today" | "7-days" | "30-days";
export type LibrarySort = "newest" | "oldest" | "name-asc" | "name-desc" | "duration-desc";

export function filterAndSortProjects(projects: StudioProject[], query: string, type: LibraryTypeFilter, date: LibraryDateFilter, sort: LibrarySort, now = new Date()): StudioProject[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const minimumTime = date === "today" ? startOfToday : date === "7-days" ? now.getTime() - 7 * 86_400_000 : date === "30-days" ? now.getTime() - 30 * 86_400_000 : Number.NEGATIVE_INFINITY;
  const filtered = projects.filter((project) => {
    const matchesQuery = !normalizedQuery || project.title.toLocaleLowerCase().includes(normalizedQuery);
    const matchesType = type === "all" || project.mode === type;
    const createdAt = new Date(project.createdAt).getTime();
    return matchesQuery && matchesType && createdAt >= minimumTime;
  });
  return filtered.sort((a, b) => {
    if (sort === "oldest") return a.createdAt.localeCompare(b.createdAt);
    if (sort === "name-asc") return a.title.localeCompare(b.title);
    if (sort === "name-desc") return b.title.localeCompare(a.title);
    if (sort === "duration-desc") return b.duration - a.duration;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function recordingModeLabel(mode: RecordingMode): string {
  return mode === "screen" ? "Screen" : mode === "screen-camera" ? "Screen + Camera" : "Camera";
}

export function paginateItems<T>(items: T[], page: number, columns: number, rows = 3): { items: T[]; page: number; pageCount: number; pageSize: number } {
  const pageSize = Math.max(1, Math.floor(columns)) * Math.max(1, Math.floor(rows));
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(pageCount, Math.max(1, Math.floor(page)));
  return { items: items.slice((safePage - 1) * pageSize, safePage * pageSize), page: safePage, pageCount, pageSize };
}
