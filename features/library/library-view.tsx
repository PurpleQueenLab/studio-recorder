"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, MoreVerticalIcon, Search01Icon, Video01Icon } from "@hugeicons/core-free-icons";
import { LocalProjectStore } from "@/lib/storage/project-store";
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
  const [store] = useState(() => new LocalProjectStore());
  useEffect(() => { void store.listProjects().then(setProjects).catch(() => setProjects([])); }, [store]);
  const cards = projects.length ? projects.filter((project) => project.title.toLowerCase().includes(query.toLowerCase())).map((project) => ({ title: project.title, image: "/figma/thumbnail-dashboard.jpeg", date: new Date(project.createdAt).toLocaleString(), duration: formatDuration(project.duration), project })) : demoCards.filter(([title]) => title.toLowerCase().includes(query.toLowerCase())).map(([title, image, date, duration]) => ({ title, image, date, duration, project: undefined }));

  async function removeProject(project: StudioProject) {
    if (!window.confirm(`Delete “${project.title}” and its locally stored recording chunks?`)) return;
    await store.deleteProject(project.id);
    setProjects((items) => items.filter((item) => item.id !== project.id));
  }

  return <section className="library" aria-labelledby="library-heading">
    <div className="section-heading"><div><h1 id="library-heading">Your recordings</h1><p>All your videos and screen recordings, stored only in this browser.</p></div><button className="primary" onClick={onRecord}>New recording</button></div>
    <div className="filters"><label className="search"><HugeiconsIcon icon={Search01Icon} size={17} /><input aria-label="Search recordings" placeholder="Search recordings…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><button>All types <span>⌄</span></button><button>Date added <span>⌄</span></button><button>Newest first <span>⌄</span></button></div>
    <div className="recording-grid">{cards.map(({ title, image, date, duration, project }, index) => <article className={`recording-card ${project ? "openable" : ""}`} key={`${title}-${date}`} onClick={() => project && onOpen(project)}>
      <div className="thumb"><Image src={image} alt="" fill priority={index === 0} sizes="(max-width: 700px) 100vw, 266px" /><span>{duration}</span>{project ? <button aria-label={`Delete ${title}`} onClick={(event) => { event.stopPropagation(); void removeProject(project); }}><HugeiconsIcon icon={Delete02Icon} size={17} /></button> : <button aria-label={`More actions for ${title}`} onClick={(event) => event.stopPropagation()}><HugeiconsIcon icon={MoreVerticalIcon} size={17} /></button>}</div>
      <h2>{title}</h2><p>{date}</p><small><HugeiconsIcon icon={Video01Icon} size={12} /> {project ? "Open local project" : "Screen recording"}</small>
    </article>)}</div>
    {!projects.length && <p className="demo-note">Preview content is shown until you make your first local recording.</p>}
  </section>;
}

function formatDuration(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
