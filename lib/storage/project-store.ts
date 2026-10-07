import type { StudioProject } from "@/types/project";

const DB_NAME = "studio-recorder";
const VERSION = 1;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export class LocalProjectStore {
  private db?: IDBDatabase;

  async open(): Promise<void> {
    if (this.db) return;
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("chunks")) {
        const chunks = db.createObjectStore("chunks", { keyPath: ["projectId", "source", "index"] });
        chunks.createIndex("by-project-source", ["projectId", "source"]);
      }
    };
    this.db = await requestResult(request);
  }

  async putProject(project: StudioProject): Promise<void> {
    await this.open();
    await requestResult(this.db!.transaction("projects", "readwrite").objectStore("projects").put(project));
  }

  async listProjects(): Promise<StudioProject[]> {
    await this.open();
    const projects = await requestResult(this.db!.transaction("projects").objectStore("projects").getAll());
    return projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async putChunk(projectId: string, source: string, index: number, blob: Blob): Promise<void> {
    await this.open();
    await requestResult(this.db!.transaction("chunks", "readwrite").objectStore("chunks").put({ projectId, source, index, blob }));
  }

  async getChunks(projectId: string, source: string): Promise<Blob[]> {
    await this.open();
    const request = this.db!.transaction("chunks").objectStore("chunks").index("by-project-source").getAll([projectId, source]);
    const rows = await requestResult<Array<{ index: number; blob: Blob }>>(request);
    return rows.sort((a, b) => a.index - b.index).map((row) => row.blob);
  }
}
