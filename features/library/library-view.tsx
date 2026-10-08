"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, MoreVerticalIcon, Search01Icon, Upload01Icon, Video01Icon } from "@hugeicons/core-free-icons";
import { LocalProjectStore } from "@/lib/storage/project-store";
import { useTheme } from "@/components/theme-provider";
import { filterAndSortProjects, paginateItems, recordingModeLabel, type LibraryDateFilter, type LibrarySort, type LibraryTypeFilter } from "@/lib/library";
import type { StudioProject } from "@/types/project";

const demoCards = [
  ["Intro video", "/figma/thumbnail-person.jpeg", "Today at 10:24 AM", "12:34"],
  ["Product demo walkthrough", "/figma/thumbnail-abstract.jpeg", "Yesterday at 4:15 PM", "26:18"],
  ["Feature design review", "/figma/thumbnail-dashboard.jpeg", "Apr 24, 2025", "06:42"],
  ["Customer interview", "/figma/thumbnail-woman.jpeg", "Apr 22, 2025", "15:09"],
];
type LibraryCard = { title: string; image: string; date: string; duration: string; project?: StudioProject };

export function LibraryView({ onRecord, onImport, onOpen }: { onRecord: () => void; onImport: () => void; onOpen: (project: StudioProject) => void }) {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<LibraryTypeFilter>("all");
  const [dateFilter, setDateFilter] = useState<LibraryDateFilter>("any");
  const [sort, setSort] = useState<LibrarySort>("newest");
  const [page, setPage] = useState(1);
  const [columns, setColumns] = useState(4);
  const gridRef = useRef<HTMLDivElement>(null);
  const [store] = useState(() => new LocalProjectStore());
  const { theme } = useTheme();
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  useEffect(() => { void store.listProjects().then(setProjects).catch(() => setProjects([])); }, [store]);
  useEffect(() => {
    let disposed = false;
    const urls: string[] = [];
    void Promise.all(projects.map(async (project) => {
      if (!project.thumbnailAssetId) return;
      const chunks = await store.getChunks(project.id, project.thumbnailAssetId);
      if (!chunks.length) return;
      const url = URL.createObjectURL(new Blob(chunks, { type: "image/jpeg" })); urls.push(url); return [project.id, url] as const;
    })).then((pairs) => { if (!disposed) setThumbnailUrls(Object.fromEntries(pairs.filter(Boolean) as Array<readonly [string, string]>)); });
    return () => { disposed = true; urls.forEach(URL.revokeObjectURL); };
  }, [projects, store]);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const update = () => setColumns(Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").length));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);
  const filteredProjects = filterAndSortProjects(projects, query, typeFilter, dateFilter, sort);
  const showDemoCards = !projects.length && typeFilter === "all" && dateFilter === "any";
  const allCards: LibraryCard[] = projects.length ? filteredProjects.map((project) => ({ title: project.title, image: thumbnailUrls[project.id] ?? (theme === "dark" ? "/thumbnail-dark.png" : "/thumbnail-light.png"), date: new Date(project.createdAt).toLocaleString(), duration: formatDuration(project.duration), project })) : showDemoCards ? demoCards.filter(([title]) => title.toLowerCase().includes(query.toLowerCase())).map(([title, image, date, duration]) => ({ title, image, date, duration })) : [];
  const pagination = paginateItems(allCards, page, columns);
  const cards = pagination.items;

  async function removeProject(project: StudioProject) {
    if (!window.confirm(`Delete “${project.title}” and its locally stored recording chunks?`)) return;
    await store.deleteProject(project.id);
    setProjects((items) => items.filter((item) => item.id !== project.id));
  }

  return <section className="library" aria-labelledby="library-heading">
    <div className="section-heading"><div><h1 id="library-heading">Your recordings</h1><p>All your videos and screen recordings, stored only in this browser.</p></div><div className="library-actions"><button className="secondary" onClick={onImport}><HugeiconsIcon icon={Upload01Icon} size={16} /> Import video</button><button className="primary" onClick={onRecord}>New recording</button></div></div>
    <div className="filters"><label className="search"><HugeiconsIcon icon={Search01Icon} size={17} /><input aria-label="Search recordings" placeholder="Search recordings…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label><label className="filter-select"><span className="sr-only">Recording type</span><select aria-label="Recording type" value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value as LibraryTypeFilter); setPage(1); }}><option value="all">All types</option><option value="screen">Screen</option><option value="screen-camera">Screen + Camera</option><option value="camera">Camera</option></select></label><label className="filter-select"><span className="sr-only">Date added</span><select aria-label="Date added" value={dateFilter} onChange={(event) => { setDateFilter(event.target.value as LibraryDateFilter); setPage(1); }}><option value="any">Any time</option><option value="today">Today</option><option value="7-days">Last 7 days</option><option value="30-days">Last 30 days</option></select></label><label className="filter-select"><span className="sr-only">Sort recordings</span><select aria-label="Sort recordings" value={sort} onChange={(event) => { setSort(event.target.value as LibrarySort); setPage(1); }}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="duration-desc">Longest first</option></select></label></div>
    <div className="recording-grid" ref={gridRef}>{cards.map(({ title, image, date, duration, project }, index) => <article className={`recording-card ${project ? "openable" : ""}`} key={`${title}-${date}`} onClick={() => project && onOpen(project)}>
      <div className="thumb"><Image src={image} alt="" fill priority={index === 0} unoptimized={image.startsWith("blob:")} sizes="(max-width: 700px) 100vw, 266px" /><span>{duration}</span>{project ? <button aria-label={`Delete ${title}`} onClick={(event) => { event.stopPropagation(); void removeProject(project); }}><HugeiconsIcon icon={Delete02Icon} size={17} /></button> : <span className="demo-more" aria-hidden="true"><HugeiconsIcon icon={MoreVerticalIcon} size={17} /></span>}</div>
      <h2>{title}</h2><p>{date}</p><small><HugeiconsIcon icon={Video01Icon} size={12} /> {project ? recordingModeLabel(project.mode) : "Screen recording"}</small>
    </article>)}</div>
    {!allCards.length ? <div className="library-empty"><strong>No recordings found</strong><p>Try a different search, type, date, or sort option.</p><button className="secondary" onClick={() => { setQuery(""); setTypeFilter("all"); setDateFilter("any"); setSort("newest"); setPage(1); }}>Clear filters</button></div> : null}
    {pagination.pageCount > 1 ? <nav className="pagination" aria-label="Recording pages"><button className="secondary" disabled={pagination.page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>{Array.from({ length: pagination.pageCount }, (_, index) => index + 1).map((number) => <button key={number} className={number === pagination.page ? "active" : ""} aria-current={number === pagination.page ? "page" : undefined} onClick={() => setPage(number)}>{number}</button>)}<button className="secondary" disabled={pagination.page === pagination.pageCount} onClick={() => setPage((value) => Math.min(pagination.pageCount, value + 1))}>Next</button></nav> : null}
    {!projects.length && cards.length ? <p className="demo-note">Preview content is shown until you make your first local recording.</p> : null}
  </section>;
}

function formatDuration(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
