import { describe, test, expect, beforeEach } from "bun:test";
import { stores, subscribers, registerStore } from "./store";

describe("store registration", () => {
  beforeEach(() => {
    stores.clear();
    subscribers.clear();
  });

  test("registers a new store", () => {
    const store = { count: 0 };
    const result = registerStore(store);

    expect(result).toBe(store);                  // returns same store
    expect(stores.has(store)).toBe(true);        // store added to stores
    expect(subscribers.has(store)).toBe(true);   // subscribers map created
    expect(subscribers.get(store)?.size).toBe(0); // no keys yet
  });

  test("registering the same store twice does not duplicate", () => {
    const store = { value: 42 };
    registerStore(store);
    registerStore(store);                       // second registration

    expect(stores.size).toBe(1);                // still only one store
    expect(subscribers.size).toBe(1);           // only one subscriber map
  });

  test("subscribers map is empty initially", () => {
    const store = { foo: "bar" };
    registerStore(store);

    const map = subscribers.get(store);
    expect(map).toBeInstanceOf(Map);
    expect(map?.size).toBe(0);
  });
});

describe("store reactive system", () => {
  beforeEach(() => {
    stores.clear();
    subscribers.clear();
  });

  test("subscribing to a store key", () => {
    const store = registerStore({ count: 0 });
    
    const callback = () => {};
    const keySubscribers = new Set<() => void>();
    keySubscribers.add(callback);
    subscribers.get(store)?.set("count", keySubscribers);

    expect(subscribers.get(store)?.get("count")?.has(callback)).toBe(true);
  });

  test("triggering subscriber callbacks when key changes", () => {
    const store = registerStore({ count: 0 });

    let updatedValue = 0;
    const callback = () => {
      updatedValue = store.count;
    };

    // Add subscriber
    const keySubscribers = new Set<() => void>();
    keySubscribers.add(callback);
    subscribers.get(store)?.set("count", keySubscribers);

    // Simulate store update
    store.count = 5;
    subscribers.get(store)?.get("count")?.forEach(cb => cb());

    expect(updatedValue).toBe(5);
  });

  test("multiple subscribers for same key are called", () => {
    const store = registerStore({ value: 10 });

    let a = 0, b = 0;
    const cb1 = () => { a = store.value; };
    const cb2 = () => { b = store.value; };

    const keySubs = new Set<() => void>();
    keySubs.add(cb1);
    keySubs.add(cb2);
    subscribers.get(store)?.set("value", keySubs);

    store.value = 42;
    subscribers.get(store)?.get("value")?.forEach(cb => cb());

    expect(a).toBe(42);
    expect(b).toBe(42);
  });

  test("updating an unregistered key does not fail", () => {
    const store = registerStore({ foo: "bar" });
    expect(() => {
      subscribers.get(store)?.get("nonexistent")?.forEach(cb => cb());
    }).not.toThrow();
  });
});