"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, MoreVerticalIcon, Search01Icon, Video01Icon } from "@hugeicons/core-free-icons";
import { LocalProjectStore } from "@/lib/storage/project-store";
import { filterAndSortProjects, recordingModeLabel, type LibraryDateFilter, type LibrarySort, type LibraryTypeFilter } from "@/lib/library";
import type { StudioProject } from "@/types/project";

const demoCards = [
  ["Intro video", "/figma/thumbnail-person.jpeg", "Today at 10:24 AM", "12:34"],
  ["Product demo walkthrough", "/figma/thumbnail-abstract.jpeg", "Yesterday at 4:15 PM", "26:18"],
  ["Feature design review", "/figma/thumbnail-dashboard.jpeg", "Apr 24, 2025", "06:42"],
  ["Customer interview", "/figma/thumbnail-woman.jpeg", "Apr 22, 2025", "15:09"],
];

export function LibraryView({ onRecord, onOpen }: { onRecord: () => void; onOpen: (project: StudioProject) => void }) {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<LibraryTypeFilter>("all");
  const [dateFilter, setDateFilter] = useState<LibraryDateFilter>("any");
  const [sort, setSort] = useState<LibrarySort>("newest");
  const [store] = useState(() => new LocalProjectStore());
  useEffect(() => { void store.listProjects().then(setProjects).catch(() => setProjects([])); }, [store]);
  const filteredProjects = filterAndSortProjects(projects, query, typeFilter, dateFilter, sort);
  const showDemoCards = !projects.length && typeFilter === "all" && dateFilter === "any";
  const cards = projects.length ? filteredProjects.map((project) => ({ title: project.title, image: "/figma/thumbnail-dashboard.jpeg", date: new Date(project.createdAt).toLocaleString(), duration: formatDuration(project.duration), project })) : showDemoCards ? demoCards.filter(([title]) => title.toLowerCase().includes(query.toLowerCase())).map(([title, image, date, duration]) => ({ title, image, date, duration, project: undefined })) : [];

  async function removeProject(project: StudioProject) {
    if (!window.confirm(`Delete “${project.title}” and its locally stored recording chunks?`)) return;
    await store.deleteProject(project.id);
    setProjects((items) => items.filter((item) => item.id !== project.id));
  }

  return <section className="library" aria-labelledby="library-heading">
    <div className="section-heading"><div><h1 id="library-heading">Your recordings</h1><p>All your videos and screen recordings, stored only in this browser.</p></div><button className="primary" onClick={onRecord}>New recording</button></div>
    <div className="filters"><label className="search"><HugeiconsIcon icon={Search01Icon} size={17} /><input aria-label="Search recordings" placeholder="Search recordings…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className="filter-select"><span className="sr-only">Recording type</span><select aria-label="Recording type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as LibraryTypeFilter)}><option value="all">All types</option><option value="screen">Screen</option><option value="screen-camera">Screen + Camera</option><option value="camera">Camera</option></select></label><label className="filter-select"><span className="sr-only">Date added</span><select aria-label="Date added" value={dateFilter} onChange={(event) => setDateFilter(event.target.value as LibraryDateFilter)}><option value="any">Any time</option><option value="today">Today</option><option value="7-days">Last 7 days</option><option value="30-days">Last 30 days</option></select></label><label className="filter-select"><span className="sr-only">Sort recordings</span><select aria-label="Sort recordings" value={sort} onChange={(event) => setSort(event.target.value as LibrarySort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="duration-desc">Longest first</option></select></label></div>
    <div className="recording-grid">{cards.map(({ title, image, date, duration, project }, index) => <article className={`recording-card ${project ? "openable" : ""}`} key={`${title}-${date}`} onClick={() => project && onOpen(project)}>
      <div className="thumb"><Image src={image} alt="" fill priority={index === 0} sizes="(max-width: 700px) 100vw, 266px" /><span>{duration}</span>{project ? <button aria-label={`Delete ${title}`} onClick={(event) => { event.stopPropagation(); void removeProject(project); }}><HugeiconsIcon icon={Delete02Icon} size={17} /></button> : <span className="demo-more" aria-hidden="true"><HugeiconsIcon icon={MoreVerticalIcon} size={17} /></span>}</div>
      <h2>{title}</h2><p>{date}</p><small><HugeiconsIcon icon={Video01Icon} size={12} /> {project ? recordingModeLabel(project.mode) : "Screen recording"}</small>
    </article>)}</div>
    {!cards.length ? <div className="library-empty"><strong>No recordings found</strong><p>Try a different search, type, date, or sort option.</p><button className="secondary" onClick={() => { setQuery(""); setTypeFilter("all"); setDateFilter("any"); setSort("newest"); }}>Clear filters</button></div> : null}
    {!projects.length && cards.length ? <p className="demo-note">Preview content is shown until you make your first local recording.</p> : null}
  </section>;
}

function formatDuration(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
