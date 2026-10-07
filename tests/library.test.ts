import { describe, expect, it } from "vitest";
import { filterAndSortProjects, recordingModeLabel } from "@/lib/library";
import { createProject } from "@/lib/project";

function project(title: string, mode: "screen" | "screen-camera" | "camera", createdAt: string, duration: number) {
  return { ...createProject(mode, new Date(createdAt)), title, createdAt, updatedAt: createdAt, duration };
}

const projects = [
  project("Weekly demo", "screen-camera", "2026-10-07T08:00:00Z", 120),
  project("Camera update", "camera", "2026-10-05T08:00:00Z", 45),
  project("Old screen tour", "screen", "2026-08-01T08:00:00Z", 300),
];

describe("recording library controls", () => {
  it("filters by title, recording type, and recency", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    expect(filterAndSortProjects(projects, "demo", "all", "any", "newest", now).map((item) => item.title)).toEqual(["Weekly demo"]);
    expect(filterAndSortProjects(projects, "", "camera", "7-days", "newest", now).map((item) => item.title)).toEqual(["Camera update"]);
    expect(filterAndSortProjects(projects, "", "screen", "30-days", "newest", now)).toEqual([]);
  });

  it("sorts without mutating the stored project order", () => {
    const original = projects.map((item) => item.title);
    expect(filterAndSortProjects(projects, "", "all", "any", "name-asc").map((item) => item.title)).toEqual(["Camera update", "Old screen tour", "Weekly demo"]);
    expect(filterAndSortProjects(projects, "", "all", "any", "duration-desc").map((item) => item.duration)).toEqual([300, 120, 45]);
    expect(projects.map((item) => item.title)).toEqual(original);
  });

  it("uses clear human-readable mode labels", () => {
    expect(recordingModeLabel("screen-camera")).toBe("Screen + Camera");
    expect(recordingModeLabel("camera")).toBe("Camera");
  });
});
