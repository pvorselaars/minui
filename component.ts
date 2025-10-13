import { go } from "./router";

// Lightweight runtime profiler. Enable by setting env MINUI_PROFILER=1 when running (Node/Bun).
const PROFILER_ENABLED = typeof process !== 'undefined' && process.env && process.env.MINUI_PROFILER === '1';

export const __minui_profiler__ = {
  enabled: PROFILER_ENABLED,
  totalBindingsCreated: 0,
  totalBindCalls: 0,
  bindingUpdates: 0,
  bindingUpdateTime: 0, // ms
  flushCount: 0,
  flushTime: 0, // ms
  depMapSamples: [] as number[],
  reset() {
    this.totalBindingsCreated = 0;
    this.totalBindCalls = 0;
    this.bindingUpdates = 0;
    this.bindingUpdateTime = 0;
    this.flushCount = 0;
    this.flushTime = 0;
    this.depMapSamples.length = 0;
  },
  snapshot() {
    return {
      enabled: this.enabled,
      totalBindingsCreated: this.totalBindingsCreated,
      totalBindCalls: this.totalBindCalls,
      bindingUpdates: this.bindingUpdates,
      bindingUpdateTime: this.bindingUpdateTime,
      flushCount: this.flushCount,
      flushTime: this.flushTime,
      avgFlushTime: this.flushCount ? this.flushTime / this.flushCount : 0,
      depMapSamples: Array.from(this.depMapSamples)
    };
  }
};

const components: Record<string, (input?: any) => any> = {};
const styles = new Set<string>();

// Global caches for compiled expressions/statements to avoid recompilation.
const __expr_cache__: Map<string, Function> = new Map();
const __param_stmt_cache__: Map<string, Function> = new Map();

function getExprFn(expr: string) {
  let fn = __expr_cache__.get(expr);
  if (!fn) {
    fn = new Function("state", `with(state){ return ${expr} }`);
    __expr_cache__.set(expr, fn);
  }
  return fn;
}

function getParamStmtFn(keys: string[], expr: string) {
  const keySig = keys.join('|');
  const cacheKey = `${keySig}::${expr}`;
  let fn = __param_stmt_cache__.get(cacheKey);
  if (!fn) {
    fn = new Function(...keys, `with(this){ ${expr} }`);
    __param_stmt_cache__.set(cacheKey, fn);
  }
  return fn;
}

// Helper to wait for batched updates (useful for tests)
export async function nextTick() {
  await Promise.resolve();
}

function registerStyle(tag: string, style?: string) {
  if (style && !styles.has(tag)) {
    styles.add(tag);
    const styleEl = document.createElement('style');
    styleEl.textContent = style.replace(/(^|\})\s*([^{}]+)\s*\{/g, (_, brace, selector) => {
      const parts = selector.split(",");
      const transformed = parts.map((s: string) => {
        s = s.trim();
        if (s.startsWith(":host")) return s.replace(":host", tag);
        return `${tag} ${s}`;
      });
      return `${brace}\n      ${transformed.join(",\n      ")} {`;
    });
    document.head.appendChild(styleEl);
  }
}

export function component<S>(
  tag: string,
  template: string,
  state: (input?: any) => S,
  style?: string
) {
  if (components[tag]) throw new Error(`Component '${tag}' already exists!`);
  registerStyle(tag, style);

  const factory = function (input?: any, routeParams?: any) {
    const root = document.createElement(tag);
    root.innerHTML = template.trim();

    // All reactive bindings (text, attributes, conditionals, loops, etc.)
    const bindings: Array<{
      update: () => void;
      deps: Set<string>;
    }> = [];

    // depMap maps a dependency key (root state key) to an array of binding ids that depend on it.
    // Using numeric ids and a registry reduces Set allocations and can be iterated quickly.
    const depMap: Map<string, number[]> = new Map();
    const bindingRegistry: Map<number, { update: () => void; deps: Set<string> }> = new Map();
    let bindingIdCounter = 0;

    // pendingOldValues stores the previous value for a root key during a batch so optimized handlers
    // can know what changed (used by optimized index handlers).
    const pendingOldValues: Map<string, any> = new Map();

    // pendingArrayOps stores recent array mutator operations (push/pop/shift/unshift/splice)
    // keyed by root state key so `for` can perform incremental updates instead of full re-renders.
    const pendingArrayOps: Map<string, { op: string; args: any[] }> = new Map();

    // Cleanup functions for memory leak prevention
    const cleanups: Array<() => void> = [];

    // Batch update state
    let updateScheduled = false;
    const pendingKeys = new Set<string>();

    // Create reactive state
    const resolvedState = state(input);
    const fullState = Object.create(
      Object.getPrototypeOf(resolvedState || {}),
      {
        go: { value: go, enumerable: true },
        ...Object.getOwnPropertyDescriptors(resolvedState || {}),
        ...Object.getOwnPropertyDescriptors(routeParams || {}),
      }
    );

    // Dependency tracking
    let tracking: Set<string> | null = null;

    // Track computed properties and their dependencies
    const computeds = new Map<string, { getter: () => any; deps: Set<string> }>();
    for (const [key, desc] of Object.entries(Object.getOwnPropertyDescriptors(fullState))) {
      if (desc.get) {
        computeds.set(key, { getter: desc.get, deps: new Set() });
      }
    }

    // Create reactive proxy
    const stateProxy = createProxy(fullState, []);

    // Setup computed properties on proxy and track their dependencies
    computeds.forEach((computed, key) => {
      // Initial dependency tracking
      const prev = tracking;
      tracking = new Set();
      try {
        computed.getter.call(stateProxy);
        computed.deps = tracking;
      } catch (e) {}
      tracking = prev;

      Object.defineProperty(stateProxy, key, {
        get() {
          // Track this computed as a dependency if we're tracking
          if (tracking) {
            tracking.add(key);
          }
          
          // Re-track dependencies on each access
          const prevTracking = tracking;
          tracking = new Set();
          const result = computed.getter.call(stateProxy);
          computed.deps = tracking;
          tracking = prevTracking;
          
          return result;
        },
        enumerable: true,
        configurable: true
      });
    });

    // Proxy factory with automatic dependency tracking
    function createProxy(obj: any, path: string[]): any {
      if (obj === null || typeof obj !== 'object') return obj;
      if (obj.__proxy) return obj;

      const handler: ProxyHandler<any> = {
        get(target, key: string | symbol) {
          if (key === '__proxy') return true;
          
          // Track access
          if (tracking && typeof key === 'string' && key !== 'emit') {
            const rootKey = path.length > 0 ? path[0] : key;
            tracking.add(rootKey);
          }

          const value = target[key];

          // Wrap array methods
          if (Array.isArray(target) && typeof value === 'function' && 
              ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'].includes(key as string)) {
            return function(...args: any[]) {
              const result = value.apply(target, args);
              const rootKey = path.length > 0 ? path[0] : 'length';
              // Record simple array ops for incremental handling in `for`
              try {
                pendingArrayOps.set(rootKey, { op: key.toString(), args });
              } catch {}
              notify(rootKey);
              return result;
            };
          }

          // Recurse into objects
          if (typeof value === 'object' && value !== null) {
            return createProxy(value, [...path, key.toString()]);
          }

          return value;
        },

        set(target, key: string | symbol, value: any) {
          const isAlreadyProxy = value?.__proxy;
          // Capture previous root-level value for optimized handlers (selected-by fast-path)
          const rootKey = path.length > 0 ? path[0] : key.toString();
          try {
            if (!pendingOldValues.has(rootKey)) {
              (pendingOldValues as Map<string, any>).set(rootKey, (fullState as any)[rootKey]);
            }
          } catch {}

          if (value && typeof value === 'object' && !isAlreadyProxy && 
              !(value instanceof Date) && !(value instanceof RegExp)) {
            target[key] = createProxy(value, [...path, key.toString()]);
          } else {
            target[key] = value;
          }

          notify(rootKey);

          return true;
        }
      };

      return new Proxy(obj, handler);
    }

    // Helper: evaluate expression with automatic tracking
    function track<T>(fn: () => T, context: Record<string, any> = {}): [T, Set<string>] {
      const deps = new Set<string>();
      const prev = tracking;
      tracking = deps;
      
      try {
        const result = fn();
        return [result, deps];
      } finally {
        tracking = prev;
      }
    }

    // Helper: evaluate expression in scope
    function evaluate(expr: string, context: Record<string, any> = {}): any {
      try {
        const ctx: Record<string, any> = context && typeof context === 'object' ? Object.assign({}, context) : {};
        if (!('emit' in ctx) && (stateProxy as any).emit) ctx.emit = (stateProxy as any).emit;

        const scope = new Proxy(ctx, {
          has(target, prop) {
            return prop in target || prop in stateProxy;
          },
          get(target, prop, receiver) {
            if (prop in target) return (target as any)[prop];
            return (stateProxy as any)[prop as any];
          },
          ownKeys(target) {
            return Reflect.ownKeys(target);
          },
          getOwnPropertyDescriptor(target, prop) {
            const desc = Object.getOwnPropertyDescriptor(target, prop as any);
            if (desc) return desc;
            return undefined;
          }
        });

        const fn = getExprFn(expr);
        return fn(scope);
      } catch {
        return undefined;
      }
    }

    // Notify all bindings that depend on a key (batched)
    function notify(key: string) {
      pendingKeys.add(key);
      
      if (!updateScheduled) {
        updateScheduled = true;
        queueMicrotask(() => {
          flushUpdates();
        });
      }
    }

    function flushUpdates() {
      if (pendingKeys.size === 0) return;

      const keys = Array.from(pendingKeys);
      pendingKeys.clear();
      updateScheduled = false;

      // Process all pending updates using depMap for O(sum(deps touched)) instead of O(keys * allBindings)
      const updatedBindings = new Set<number>();

      const flushStart = __minui_profiler__.enabled ? Date.now() : 0;

      for (const k of keys) {
        if (__minui_profiler__.enabled) {
          __minui_profiler__.depMapSamples.push(depMap.get(k)?.length ?? 0);
        }
        // (no optimized index updates)

        const set = depMap.get(k);
        if (set) {
          // Snapshot ids and resolve to bindings from registry; this allows lazy cleanup of removed bindings
          const listIds = Array.from(set);
          for (const id of listIds) {
            const binding = bindingRegistry.get(id);
            if (!binding) continue; // was removed
            if (!updatedBindings.has(id)) {
              updatedBindings.add(id);
              if (__minui_profiler__.enabled) {
                const bStart = Date.now();
                binding.update();
                const bEnd = Date.now();
                __minui_profiler__.bindingUpdates++;
                __minui_profiler__.bindingUpdateTime += (bEnd - bStart);
              } else {
                binding.update();
              }
            }
          }
        }

        // Check if any computed properties depend on this key
        computeds.forEach((computed, computedKey) => {
          if (computed.deps.has(k)) {
            // Re-add computed key to trigger its dependents
            pendingKeys.add(computedKey);
          }
        });
      }

      // If computeds added more keys, flush again
      if (pendingKeys.size > 0) {
        flushUpdates();
      }

      // Clear the pendingOldValues map after processing so future changes capture new old-values
      pendingOldValues.clear();

      // Clear pending array ops map
      pendingArrayOps.clear();

      if (__minui_profiler__.enabled) {
        const flushEnd = Date.now();
        __minui_profiler__.flushCount++;
        __minui_profiler__.flushTime += (flushEnd - flushStart);
      }
    }

    // Create a reactive binding with cleanup
    function bind(updateFn: () => void, context: Record<string, any> = {}): () => void {
      if (__minui_profiler__.enabled) __minui_profiler__.totalBindCalls++;

      const [, deps] = track(() => {
        try { updateFn(); } catch (e) {}
      }, context);

      const binding = { update: updateFn, deps };
      bindings.push(binding);

      if (__minui_profiler__.enabled) __minui_profiler__.totalBindingsCreated++;

      // Assign a numeric id and store in registry
      const id = ++bindingIdCounter;
      bindingRegistry.set(id, binding);

      // Register binding id in depMap arrays
      for (const d of deps) {
        let arr = depMap.get(d);
        if (!arr) {
          arr = [];
          depMap.set(d, arr);
        }
        arr.push(id);
      }

      // Return cleanup function
      const cleanup = () => {
        const idx = bindings.indexOf(binding);
        if (idx > -1) bindings.splice(idx, 1);

        // Remove binding id from depMap arrays
        for (const d of deps) {
          const arr = depMap.get(d);
          if (arr) {
            const p = arr.indexOf(id);
            if (p > -1) arr.splice(p, 1);
            if (arr.length === 0) depMap.delete(d);
          }
        }

        // Remove from registry
        bindingRegistry.delete(id);
      };

      cleanups.push(cleanup);
      return cleanup;
    }

    // Walk the DOM and setup bindings
    // Collect dynamic parts inside a subtree (used for per-item aggregation)
    function collectDynamicParts(root: Element) {
      const parts: Array<any> = [];

      // Text nodes with {expr} - walk the subtree manually (TreeWalker/NodeFilter not available in some test DOMs)
      function walkText(n: Node) {
        if (n.nodeType === (Node as any).ELEMENT_NODE) {
          const el = n as Element;
          // Skip subtrees that have their own directives or are child components
          if (el.hasAttribute('for') || el.hasAttribute('if')) return;
          const childTag = el.tagName.toLowerCase();
          if (components[childTag] && childTag !== tag) return;
        }

        if (n.nodeType === (Node as any).TEXT_NODE) {
          const text = n.textContent || '';
          if (text.includes('{')) {
            const matches = text.match(/\{(.*?)\}/g);
            if (matches) parts.push({ type: 'text', node: n as Text, template: text, matches });
          }
        }

        Array.from(n.childNodes).forEach(child => walkText(child));
      }

      walkText(root as unknown as Node);

      // Attributes treated as expressions (exclude directives and events)
      const elems = root.querySelectorAll('*');
      elems.forEach(el => {
        el.getAttributeNames().forEach(attr => {
          if (attr === 'if' || attr === 'for' || attr === 'bind' || attr.startsWith('on:')) return;
          const raw = el.getAttribute(attr);
          if (raw != null) {
            parts.push({ type: 'attr', node: el as HTMLElement, attr, expr: raw });
          }
        });
      });

      return parts;
    }

    function walk(node: Node, context: Record<string, any> = {}) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        const matches = text.match(/\{(.*?)\}/g);
        if (matches) {
          const template = text;
          bind(() => {
            let result = template;
            for (const match of matches) {
              const expr = match.slice(1, -1).trim();
              const value = evaluate(expr, context);
              result = result.replace(match, String(value ?? ''));
            }
            (node as Text).data = result;
          }, context);
        }
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;

      // Handle 'if' directive
      if (el.hasAttribute('if')) {
        const expr = el.getAttribute('if')!.trim();
        const placeholder = document.createComment(`if:${expr}`);
        const template = el.cloneNode(true) as Element;
        template.removeAttribute('if');
        
        el.parentNode?.insertBefore(placeholder, el);
        el.remove();

        let rendered: Element | null = null;

        bind(() => {
          const shouldShow = !!evaluate(expr, context);
          if (shouldShow && !rendered) {
            rendered = template.cloneNode(true) as Element;
            placeholder.parentNode?.insertBefore(rendered, placeholder.nextSibling);
            walk(rendered, context);
            const next = placeholder.nextSibling as Element | null;
            if (next && next.nodeType === Node.ELEMENT_NODE) {
              rendered = next as Element;
            }
          } else if (!shouldShow && rendered) {
            rendered.remove();
            rendered = null;
          }
        }, context);

        return;
      }

      // Handle 'for' directive
      if (el.hasAttribute('for')) {
        const forExpr = el.getAttribute('for')!.trim();
        const match = forExpr.match(/^(\w+)(?:\s*,\s*(\w+))?\s+in\s+(.+)$/);
        
        if (match) {
          const [, itemVar, indexVar, arrayExpr] = match;
          const placeholder = document.createComment(`for:${forExpr}`);
          const template = el.cloneNode(true) as Element;
          // Optional optimization attribute to enable O(1) selected-item toggles.
          // Usage: <li for="item, i in items" selected-by="selected"> ... </li>
          const selectedBy = el.getAttribute('selected-by');
          template.removeAttribute('for');
          template.removeAttribute('selected-by');
          
          el.parentNode?.insertBefore(placeholder, el);
          el.remove();

          let rendered: Node[] = [];

          bind(() => {
            const array = evaluate(arrayExpr, context);
            if (!Array.isArray(array)) return;

            // Check for a recent array op recorded by the proxy wrapper. If it's a simple append/remove,
            // perform incremental DOM updates instead of full re-render.
            const rootKey = (arrayExpr.split('.')[0]) as string;
            const opInfo = pendingArrayOps.get(rootKey);

            const tryIncremental = () => {
              if (!opInfo) return false;
              const op = opInfo.op;

              if (op === 'push') {
                // Append new items for each arg
                const parent = placeholder.parentNode!;
                for (let a = 0; a < opInfo.args.length; a++) {
                  const i = array.length - opInfo.args.length + a;
                  const itemContext = { ...context, [itemVar]: array[i], ...(indexVar ? { [indexVar]: i } : {}) };
                  const clone = template.cloneNode(true) as Element;
                  const parts = collectDynamicParts(clone as Element);
                  if (parts.length > 0) {
                    const updateItem = () => {
                      for (const p of parts) {
                        if (p.type === 'text') {
                          let result = p.template;
                          for (const match of p.matches) {
                            const expr = match.slice(1, -1).trim();
                            const value = evaluate(expr, itemContext);
                            result = result.replace(match, String(value ?? ''));
                          }
                          (p.node as Text).data = result;
                        } else if (p.type === 'attr') {
                          const res = evaluate(p.expr, itemContext);
                          if (res !== undefined) {
                            const booleanAttrs = new Set(['disabled', 'readonly', 'checked', 'selected']);
                            if (booleanAttrs.has(p.attr)) {
                              (p.node as HTMLElement).toggleAttribute(p.attr, !!res);
                            } else {
                              (p.node as HTMLElement).setAttribute(p.attr, String(res));
                            }
                          }
                        }
                      }
                    };
                    bind(updateItem, itemContext);
                    // Ensure event attributes on the clone are attached
                    attachEventAttributes(clone, itemContext);
                    // Walk child nodes for nested directives
                    Array.from((clone as Element).childNodes).forEach(child => walk(child, itemContext));
                  } else {
                    // Ensure event attributes on the clone are attached and process children
                    attachEventAttributes(clone, itemContext);
                    walk(clone, itemContext);
                  }
                  // Insert after last rendered node (append). If none, insert after placeholder.
                  if (rendered.length > 0) {
                    const last = rendered[rendered.length - 1];
                    last.parentNode?.insertBefore(clone, (last as Node).nextSibling);
                  } else {
                    parent.insertBefore(clone, placeholder.nextSibling);
                  }

                  // selected-by: simple per-clone binding that updates className when the
                  // selected state key changes. This is simpler and avoids optimized index
                  // bookkeeping.
                  if (selectedBy && indexVar) {
                    const stateKey = selectedBy.trim();
                    try {
                      bind(() => {
                        try {
                          const cur = (stateProxy as any)[stateKey];
                          const curIdx = cur != null ? Number(cur) : null;
                          if (curIdx === i) {
                            (clone as HTMLElement).className = 'selected';
                          } else {
                            (clone as HTMLElement).className = '';
                          }
                        } catch {}
                      }, itemContext);
                    } catch {}
                  }

                  rendered.push(clone);
                }
                return true;
              }

              if (op === 'pop') {
                // Remove last node
                const last = rendered.pop();
                if (last) {
                  const hn = last as any as HTMLElement;
                  hn.remove();
                }
                return true;
              }

              // For other ops (shift/unshift/splice/sort/reverse) do full re-render
              return false;
            };

            if (!tryIncremental()) {
              // Full re-render fallback
              for (const n of rendered) {
                const hn = n as any as HTMLElement;
                hn.remove();
              }
              rendered = [];

              const fragment = document.createDocumentFragment();
              for (let i = 0; i < array.length; i++) {
                const itemContext = { 
                  ...context, 
                  [itemVar]: array[i],
                  ...(indexVar ? { [indexVar]: i } : {})
                };
                const clone = template.cloneNode(true) as Element;

                const parts = collectDynamicParts(clone as Element);
                if (parts.length > 0) {
                  const updateItem = () => {
                    for (const p of parts) {
                      if (p.type === 'text') {
                        let result = p.template;
                        for (const match of p.matches) {
                          const expr = match.slice(1, -1).trim();
                          const value = evaluate(expr, itemContext);
                          result = result.replace(match, String(value ?? ''));
                        }
                        (p.node as Text).data = result;
                      } else if (p.type === 'attr') {
                        const res = evaluate(p.expr, itemContext);
                        if (res !== undefined) {
                          const booleanAttrs = new Set(['disabled', 'readonly', 'checked', 'selected']);
                          if (booleanAttrs.has(p.attr)) {
                            (p.node as HTMLElement).toggleAttribute(p.attr, !!res);
                          } else {
                            (p.node as HTMLElement).setAttribute(p.attr, String(res));
                          }
                        }
                      }
                    }
                  };

                  bind(updateItem, itemContext);
                  Array.from((clone as Element).childNodes).forEach(child => walk(child, itemContext));
                  // Ensure event attributes are attached for the clone
                  attachEventAttributes(clone, itemContext);
                  // selected-by: per-clone binding for full render
                  if (selectedBy && indexVar) {
                    const stateKey = selectedBy.trim();
                    bind(() => {
                      try {
                        const cur = (stateProxy as any)[stateKey];
                        const curIdx = cur != null ? Number(cur) : null;
                        if (curIdx === i) {
                          (clone as HTMLElement).className = 'selected';
                        } else {
                          (clone as HTMLElement).className = '';
                        }
                      } catch {}
                    }, itemContext);
                  }
                } else {
                  walk(clone, itemContext);
                  attachEventAttributes(clone, itemContext);
                  if (selectedBy && indexVar) {
                    const stateKey = selectedBy.trim();
                    bind(() => {
                      try {
                        const cur = (stateProxy as any)[stateKey];
                        const curIdx = cur != null ? Number(cur) : null;
                        if (curIdx === i) {
                          (clone as HTMLElement).className = 'selected';
                        } else {
                          (clone as HTMLElement).className = '';
                        }
                      } catch {}
                    }, itemContext);
                  }
                }

                fragment.appendChild(clone);
                rendered.push(clone);
              }

              placeholder.parentNode?.insertBefore(fragment, placeholder.nextSibling);
            }
          }, context);

          return;
        }
      }

      // Handle 'show' directive
      if (el.hasAttribute('show')) {
        const expr = el.getAttribute('show')!.trim();
        el.removeAttribute('show');
        
        let originalDisplay = '';
        bind(() => {
          const shouldShow = !!evaluate(expr, context);
          if (shouldShow && el.style.display === 'none') {
            el.style.display = originalDisplay;
          } else if (!shouldShow && el.style.display !== 'none') {
            originalDisplay = el.style.display;
            el.style.display = 'none';
          }
        }, context);
      }

      // Handle 'bind' directive
      if (el.hasAttribute('bind')) {
        const key = el.getAttribute('bind')!.trim();
        el.removeAttribute('bind');

        const getValue = () => key.split('.').reduce((acc: any, k) => acc?.[k], stateProxy);
        const setValue = (val: any) => {
          const keys = key.split('.');
          const last = keys.pop()!;
          const parent = keys.reduce((acc: any, k) => acc?.[k], stateProxy);
          if (parent) parent[last] = val;
        };

        // Initial value
        const initialValue = getValue();
        if (el instanceof HTMLInputElement) {
          if (el.type === 'checkbox') el.checked = !!initialValue;
          else if (el.type === 'radio') el.checked = el.value === initialValue;
          else el.value = initialValue ?? '';
        } else if (el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
          el.value = initialValue ?? '';
        }

        // State -> DOM
        bind(() => {
          const value = getValue();
          if (el instanceof HTMLInputElement) {
            if (el.type === 'checkbox') el.checked = !!value;
            else if (el.type === 'radio') el.checked = el.value === value;
            else el.value = value ?? '';
          } else if (el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
            el.value = value ?? '';
          }
        }, context);

        // DOM -> State
        const updateState = (e: Event) => {
          const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
          if (target instanceof HTMLInputElement) {
            if (target.type === 'checkbox') setValue(target.checked);
            else if (target.type === 'radio') setValue(target.checked ? target.value : '');
            else setValue(target.value);
          } else {
            setValue(target.value);
          }
        };

        el.addEventListener('input', updateState);
        el.addEventListener('change', updateState);
        
        // Cleanup event listeners
        cleanups.push(() => {
          el.removeEventListener('input', updateState);
          el.removeEventListener('change', updateState);
        });
      }

      // Handle child components
      const childTag = el.tagName.toLowerCase();
      if (components[childTag] && childTag !== tag) {
        const childInputs: Record<string, any> = {};
        const childEvents: Array<{event: string, handler: any}> = [];
        const childBindings: Array<{ key: string; expr: string }> = [];

        el.getAttributeNames().forEach(attr => {
          if (attr.startsWith('on:')) {
            const eventName = attr.slice(3);
            const expr = el.getAttribute(attr)?.trim();
            if (expr) {
              const handlerFn = (e: Event) => {
                // Avoid enumerating `stateProxy` (spreading the proxy triggers traps and
                // registers unwanted dependencies). Instead pass only captured context keys
                // plus `event` as parameters; the function runs with `this=stateProxy` so
                // unqualified identifiers still resolve to properties on the state proxy.
                try {
                  const captured = { ...context };
                  const keys = [...Object.keys(captured), 'event'];
                  const values = [
                    ...Object.values(captured).map(v => (typeof v === 'function' ? v.bind(stateProxy) : v)),
                    e
                  ];
                  const fn = getParamStmtFn(keys, expr);
                  fn.call(stateProxy, ...values);
                  try { flushUpdates(); } catch {}
                } catch (err) {
                  console.error(`Error in event handler:`, err);
                }
              };

              childEvents.push({event: eventName, handler: handlerFn});
            }

            return;
          }

          const value = el.getAttribute(attr)!;
          const bindMatch = value.match(/^\{(.*)\}$/);

          if (bindMatch) {
            const expr = bindMatch[1].trim();
              childInputs[attr] = evaluate(expr, context);
              childBindings.push({ key: attr, expr });
            } else {
              try {
                childInputs[attr] = JSON.parse(value);
              } catch {
                childInputs[attr] = value;
            }
          }
        });

        const childInstance = components[childTag](childInputs);

        // Aggregate child input bindings into a single binding to reduce work
        if (childBindings.length > 0) {
          bind(() => {
            for (const { key, expr } of childBindings) {
              const newValue = evaluate(expr, context);
              if (childInstance.state) {
                childInstance.state[key] = newValue;
              }
            }
          }, context);
        }

        childEvents.forEach(({event, handler}) => {
          // Attach listeners to child root and ensure cleanup removes from the same element
          childInstance.root.addEventListener(event, handler);
          cleanups.push(() => {
            childInstance.root.removeEventListener(event, handler);
          });
        });

        childInstance.mount(el.parentElement, el);
        el.remove();

        return;
      }

      // Handle event bindings
      // Collect attributes and events. Attributes are treated as expressions (original behavior)
      const attrExprs: Array<{ attr: string; expr: string }> = [];
      const booleanAttrs = new Set(['disabled', 'readonly', 'checked', 'selected']);

      el.getAttributeNames().forEach(attr => {
        if (attr.startsWith('on:')) {
          const eventName = attr.slice(3);
          const expr = el.getAttribute(attr)?.trim();
          if (expr) {
            // Capture only the local context keys to avoid enumerating the state proxy.
            const capturedContext = { ...context };
            const paramKeys = [...Object.keys(capturedContext), 'event'];

            const handler = (e: Event) => {
              try {
                // Bind functions to stateProxy and provide event as last arg
                const values = [
                  ...Object.values(capturedContext).map(v => (typeof v === 'function' ? v.bind(stateProxy) : v)),
                  e
                ];
                const fn = getParamStmtFn(paramKeys, expr);
                fn.call(stateProxy, ...values);
                try { flushUpdates(); } catch {}
              } catch (err) {
                console.error(`Error in event handler "${expr}":`, err);
                console.error('Available context keys:', paramKeys);
              }
            };

            el.addEventListener(eventName, handler);

            // Cleanup event listener
            cleanups.push(() => {
              el.removeEventListener(eventName, handler);
            });
          }

          el.removeAttribute(attr);
          return;
        }

        const raw = el.getAttribute(attr);
        if (raw == null) return;

        // Preserve original behavior: treat attribute value as an expression to evaluate in scope
        attrExprs.push({ attr, expr: raw });
      });

      // Aggregate all attribute expressions into a single binding to reduce number of binds
      if (attrExprs.length > 0) {
          bind(() => {
            for (const { attr, expr } of attrExprs) {
              const result = evaluate(expr, context);
              if (result !== undefined) {
                if (booleanAttrs.has(attr)) {
                  el.toggleAttribute(attr, !!result);
                } else {
                  el.setAttribute(attr, String(result));
                }
              }
            }
          }, context);
        }

      // Recurse into children
      Array.from(el.childNodes).forEach(child => walk(child, context));
    }

    // Attach only event attributes (on:...) for an element using provided context.
    // This is used by the optimized per-item rendering path which avoids calling full `walk(clone)`.
    function attachEventAttributes(el: Element, context: Record<string, any> = {}) {
      el.getAttributeNames().forEach(attr => {
        if (!attr.startsWith('on:')) return;
        const eventName = attr.slice(3);
        const expr = el.getAttribute(attr)?.trim();
        if (!expr) return;

        const capturedContext = { ...context };
        // Use parameterized statement function so local loop variables (e.g. i) are passed as params
        const paramKeys = [...Object.keys(capturedContext), 'event'];
        const paramFn = getParamStmtFn(paramKeys, expr);
        const handler = (e: Event) => {
          // Bind function values from capturedContext to stateProxy for correct method `this`.
          const values = [...Object.values(capturedContext).map(v => (typeof v === 'function' ? v.bind(stateProxy) : v)), e];
          try {
            paramFn.call(stateProxy, ...values);
          } catch (err) {
            console.error(`Error in event handler "${expr}":`, err);
          }
        };

        el.addEventListener(eventName, handler);
        cleanups.push(() => el.removeEventListener(eventName, handler));
        el.removeAttribute(attr);
      });
    }

    walk(root);

    // Emit helper
    Object.defineProperty(stateProxy, 'emit', {
      value: (name: string, detail?: any) => {
        root.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
      },
      enumerable: false
    });

    return {
      root,
      mount(target: HTMLElement, before?: HTMLElement) {
        if (before) {
          target.insertBefore(root, before);
        } else {
          target.appendChild(root);
        }
        
        // Flush any pending updates from initialization
        flushUpdates();
        
        if ('mounted' in stateProxy && typeof (stateProxy as any).mounted === 'function') {
          (stateProxy as any).mounted();
        }
      },
      state: stateProxy,
      unmount() {
        root.remove();
        
        // Run all cleanup functions
        cleanups.forEach(cleanup => cleanup());
        cleanups.length = 0;
        
        // Clear all bindings
        bindings.length = 0;
        
        if ('unmounted' in stateProxy && typeof (stateProxy as any).unmounted === 'function') {
          (stateProxy as any).unmounted();
        }
      }
    };
  };

  components[tag.toLowerCase()] = factory;
  return factory;
}
