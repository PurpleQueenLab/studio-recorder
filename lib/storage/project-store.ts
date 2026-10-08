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

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted"));
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
    const transaction = this.db!.transaction("projects", "readwrite");
    const completed = transactionComplete(transaction);
    await Promise.all([requestResult(transaction.objectStore("projects").put(project)), completed]);
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
    await transactionComplete(transaction);
  }

  async putChunk(projectId: string, source: string, index: number, blob: Blob): Promise<void> {
    await this.open();
    const transaction = this.db!.transaction("chunks", "readwrite");
    const completed = transactionComplete(transaction);
    await Promise.all([requestResult(transaction.objectStore("chunks").put({ projectId, source, index, blob })), completed]);
  }

  async getChunks(projectId: string, source: string): Promise<Blob[]> {
    await this.open();
    const request = this.db!.transaction("chunks").objectStore("chunks").index("by-project-source").getAll([projectId, source]);
    const rows = await requestResult<Array<{ index: number; blob: Blob }>>(request);
    return rows.sort((a, b) => a.index - b.index).map((row) => row.blob);
  }

  async validatePrimaryMedia(project: StudioProject, source: string): Promise<Blob> {
    const descriptor = project.sources.find((item) => item.kind === source);
    if (!descriptor) throw new Error("The recording has no primary video source metadata.");
    const chunks = await this.getChunks(project.id, source);
    if (!chunks.length || chunks.length !== descriptor.chunkCount || chunks.some((chunk) => chunk.size === 0)) {
      throw new Error("The primary video was not fully saved in browser storage.");
    }
    const blob = new Blob(chunks, { type: descriptor.mimeType });
    if (!blob.size) throw new Error("The saved primary video is empty.");
    return blob;
  }
}
