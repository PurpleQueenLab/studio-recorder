"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MoreVerticalIcon, Search01Icon, Video01Icon } from "@hugeicons/core-free-icons";
import { LocalProjectStore } from "@/lib/storage/project-store";
import type { StudioProject } from "@/types/project";

const demoCards = [
  ["Intro video", "/figma/thumbnail-person.jpeg", "Today at 10:24 AM", "12:34"],
  ["Product demo walkthrough", "/figma/thumbnail-abstract.jpeg", "Yesterday at 4:15 PM", "26:18"],
  ["Feature design review", "/figma/thumbnail-dashboard.jpeg", "Apr 24, 2025", "06:42"],
  ["Customer interview", "/figma/thumbnail-woman.jpeg", "Apr 22, 2025", "15:09"],
];

export function LibraryView({ onRecord }: { onRecord: () => void }) {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  useEffect(() => { void new LocalProjectStore().listProjects().then(setProjects).catch(() => setProjects([])); }, []);
  const cards = projects.length ? projects.map((project) => [project.title, "/figma/thumbnail-dashboard.jpeg", new Date(project.createdAt).toLocaleString(), formatDuration(project.duration)]) : demoCards;

  return <section className="library" aria-labelledby="library-heading">
    <div className="section-heading"><div><h1 id="library-heading">Your recordings</h1><p>All your videos and screen recordings, stored only in this browser.</p></div><button className="primary" onClick={onRecord}>New recording</button></div>
    <div className="filters"><label className="search"><HugeiconsIcon icon={Search01Icon} size={17} /><input aria-label="Search recordings" placeholder="Search recordings…" /></label><button>All types <span>⌄</span></button><button>Date added <span>⌄</span></button><button>Newest first <span>⌄</span></button></div>
    <div className="recording-grid">{cards.map(([title, image, date, duration], index) => <article className="recording-card" key={`${title}-${date}`}>
      <div className="thumb"><Image src={image} alt="" fill priority={index === 0} sizes="(max-width: 700px) 100vw, 266px" /><span>{duration}</span><button aria-label={`More actions for ${title}`}><HugeiconsIcon icon={MoreVerticalIcon} size={17} /></button></div>
      <h2>{title}</h2><p>{date}</p><small><HugeiconsIcon icon={Video01Icon} size={12} /> Screen recording</small>
    </article>)}</div>
    {!projects.length && <p className="demo-note">Preview content is shown until you make your first local recording.</p>}
  </section>;
}

function formatDuration(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
