import { Task, Category } from "./types";

const DB_NAME = "TodoApp";
const DB_VERSION = 1;
const TASKS_STORE = "tasks";
const CATEGORIES_STORE = "categories";

let dbInstance: IDBDatabase | null = null;

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(TASKS_STORE)) {
        const taskStore = db.createObjectStore(TASKS_STORE, { keyPath: "id" });
        taskStore.createIndex("category", "category", { unique: false });
        taskStore.createIndex("status", "status", { unique: false });
        taskStore.createIndex("priority", "priority", { unique: false });
        taskStore.createIndex("dueDate", "dueDate", { unique: false });
      }
      if (!db.objectStoreNames.contains(CATEGORIES_STORE)) {
        db.createObjectStore(CATEGORIES_STORE, { keyPath: "id" });
      }
    };
  });
}

export const db = {
  async addTask(task: Task): Promise<void> {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(TASKS_STORE, "readwrite");
      const store = tx.objectStore(TASKS_STORE);
      const request = store.add(task);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
    });
  },

  async updateTask(task: Task): Promise<void> {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(TASKS_STORE, "readwrite");
      const store = tx.objectStore(TASKS_STORE);
      const request = store.put(task);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
    });
  },

  async deleteTask(id: string): Promise<void> {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(TASKS_STORE, "readwrite");
      const store = tx.objectStore(TASKS_STORE);
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
    });
  },

  async getTasks(): Promise<Task[]> {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(TASKS_STORE, "readonly");
      const store = tx.objectStore(TASKS_STORE);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  },

  async getTaskById(id: string): Promise<Task | undefined> {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(TASKS_STORE, "readonly");
      const store = tx.objectStore(TASKS_STORE);
      const request = store.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  },

  async getTasksByCategory(category: string): Promise<Task[]> {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(TASKS_STORE, "readonly");
      const store = tx.objectStore(TASKS_STORE);
      const index = store.index("category");
      const request = index.getAll(category);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  },

  async addCategory(category: Category): Promise<void> {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(CATEGORIES_STORE, "readwrite");
      const store = tx.objectStore(CATEGORIES_STORE);
      const request = store.add(category);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
    });
  },

  async getCategories(): Promise<Category[]> {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(CATEGORIES_STORE, "readonly");
      const store = tx.objectStore(CATEGORIES_STORE);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  },
};
