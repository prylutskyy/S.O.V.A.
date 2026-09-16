export interface IStorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export class ChromeSessionStorageAdapter implements IStorageAdapter {
  public async get<T>(key: string): Promise<T | null> {
    if (typeof chrome === 'undefined' || !chrome.storage) return null;
    const storage = chrome.storage.session || chrome.storage.local;
    const result = await storage.get(key);
    return result[key] || null;
  }

  public async set<T>(key: string, value: T): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    const storage = chrome.storage.session || chrome.storage.local;
    await storage.set({ [key]: value });
  }

  public async remove(key: string): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    const storage = chrome.storage.session || chrome.storage.local;
    await storage.remove(key);
  }
}

export class InMemoryStorageAdapter implements IStorageAdapter {
  private storage = new Map<string, any>();

  public async get<T>(key: string): Promise<T | null> {
    return this.storage.has(key) ? this.storage.get(key) : null;
  }

  public async set<T>(key: string, value: T): Promise<void> {
    this.storage.set(key, value);
  }

  public async remove(key: string): Promise<void> {
    this.storage.delete(key);
  }
}
