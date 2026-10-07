import type { StudioProject } from "@/types/project";
import { normalizeProject } from "@/lib/project";

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
    return projects.map(normalizeProject).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getProject(id: string): Promise<StudioProject | undefined> {
    await this.open();
    const project = await requestResult<StudioProject | undefined>(this.db!.transaction("projects").objectStore("projects").get(id));
    return project ? normalizeProject(project) : undefined;
  }

  async deleteProject(id: string): Promise<void> {
    await this.open();
    const transaction = this.db!.transaction(["projects", "chunks"], "readwrite");
    transaction.objectStore("projects").delete(id);
    transaction.objectStore("chunks").delete(IDBKeyRange.bound([id, "", 0], [id, "\uffff", Number.MAX_SAFE_INTEGER]));
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not delete local project"));
    });
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
