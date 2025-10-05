export const subscribers = new Map<any, Map<string, Set<() => void>>>();

export const stores = new Set<any>();

export function registerStore<T extends Record<string, any>>(store: T): T {
  if (stores.has(store)) {
    return store;
  }
  
  subscribers.set(store, new Map());
  stores.add(store);
    
  return store;
}