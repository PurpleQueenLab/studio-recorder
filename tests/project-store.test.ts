import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { LocalProjectStore } from "@/lib/storage/project-store";
import { createProject } from "@/lib/project";

describe("LocalProjectStore", () => {
  it("persists projects and ordered chunks locally", async () => {
    const store = new LocalProjectStore();
    const project = createProject("screen", new Date("2026-10-07T10:00:00Z"));
    await store.putProject(project);
    await store.putChunk(project.id, "screen", 1, new Blob(["b"]));
    await store.putChunk(project.id, "screen", 0, new Blob(["a"]));
    expect((await store.listProjects())[0].id).toBe(project.id);
    expect(await Promise.all((await store.getChunks(project.id, "screen")).map((chunk) => chunk.text()))).toEqual(["a", "b"]);
    await store.deleteProject(project.id);
    expect(await store.getProject(project.id)).toBeUndefined();
    expect(await store.getChunks(project.id, "screen")).toEqual([]);
  });

  it("keeps imported audio assets isolated inside the owning local project", async () => {
    const store = new LocalProjectStore();
    const project = createProject("screen", new Date("2026-10-07T11:00:00Z"));
    const assetId = "local-music";
    project.assets.push({ id: assetId, kind: "music", name: "theme.wav", mimeType: "audio/wav", chunkCount: 1, duration: 3 });
    await store.putProject(project);
    await store.putChunk(project.id, assetId, 0, new Blob(["local-only"]));
    expect((await store.getProject(project.id))?.assets[0].name).toBe("theme.wav");
    expect(await (await store.getChunks(project.id, assetId))[0].text()).toBe("local-only");
    await store.deleteProject(project.id);
  });
});
