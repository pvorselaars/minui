import { go } from "./router";

const components: Record<string, (input?: any) => any> = {};
const styles = new Set<string>();

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
              notify(path.length > 0 ? path[0] : 'length');
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
          
          if (value && typeof value === 'object' && !isAlreadyProxy && 
              !(value instanceof Date) && !(value instanceof RegExp)) {
            target[key] = createProxy(value, [...path, key.toString()]);
          } else {
            target[key] = value;
          }

          const rootKey = path.length > 0 ? path[0] : key.toString();
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
        const scope = { ...stateProxy, ...context };
        // Ensure emit is always available
        if (!scope.emit && stateProxy.emit) {
          scope.emit = stateProxy.emit;
        }
        return new Function("state", `with(state) { return ${expr} }`)(scope);
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
      
      // Process all pending updates
      const updatedBindings = new Set<typeof bindings[0]>();
      
      keys.forEach(k => {
        bindings.forEach(binding => {
          if (binding.deps.has(k) && !updatedBindings.has(binding)) {
            updatedBindings.add(binding);
            binding.update();
          }
        });

        // Check if any computed properties depend on this key
        computeds.forEach((computed, computedKey) => {
          if (computed.deps.has(k)) {
            // Re-add computed key to trigger its dependents
            pendingKeys.add(computedKey);
          }
        });
      });
      
      // If computeds added more keys, flush again
      if (pendingKeys.size > 0) {
        flushUpdates();
      }
    }

    // Create a reactive binding with cleanup
    function bind(updateFn: () => void, context: Record<string, any> = {}): () => void {
      const [, deps] = track(() => {
        try { updateFn(); } catch (e) {}
      }, context);
      
      const binding = { update: updateFn, deps };
      bindings.push(binding);
      
      // Return cleanup function
      const cleanup = () => {
        const idx = bindings.indexOf(binding);
        if (idx > -1) bindings.splice(idx, 1);
      };
      
      cleanups.push(cleanup);
      return cleanup;
    }

    // Walk the DOM and setup bindings
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
          template.removeAttribute('for');
          
          el.parentNode?.insertBefore(placeholder, el);
          el.remove();

          let rendered: Node[] = [];

          bind(() => {
            // Remove old nodes
            rendered.forEach(n => (n as HTMLElement).remove());
            rendered = [];

            const array = evaluate(arrayExpr, context);
            if (!Array.isArray(array)) return;

            const fragment = document.createDocumentFragment();
            for (let i = 0; i < array.length; i++) {
              const itemContext = { 
                ...context, 
                [itemVar]: array[i],
                ...(indexVar ? { [indexVar]: i } : {})
              };
              const clone = template.cloneNode(true) as Element;
              walk(clone, itemContext);
              fragment.appendChild(clone);
              rendered.push(clone);
            }

            placeholder.parentNode?.insertBefore(fragment, placeholder.nextSibling);
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
                const scope = { ...stateProxy, ...context, event: e };
                try {
                  new Function(...Object.keys(scope), `with(this){ ${expr} }`).call(stateProxy, ...Object.values(scope));
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

        childBindings.forEach(({ key, expr }) => {
          bind(() => {
            const newValue = evaluate(expr, context);
            if (childInstance.state) {
              childInstance.state[key] = newValue;
            }
          }, context);
        });

        childEvents.forEach(({event, handler}) => {
          childInstance.root.addEventListener(event, handler);
          cleanups.push(() => {
            el.removeEventListener(event, handler);
          });
        });


        childInstance.mount(el.parentElement, el);
        el.remove();

        return;
      }

      // Handle event bindings
      el.getAttributeNames().forEach(attr => {
        if (attr.startsWith('on:')) {
          const eventName = attr.slice(3);
          const expr = el.getAttribute(attr)?.trim();
          if (expr) {
            // Capture context at the time of handler creation
            const capturedContext = { ...context };
            
            const handler = (e: Event) => {
              // Merge captured context with state and globals
              const fullScope = { ...stateProxy, ...capturedContext, event: e };
              // Ensure emit is available in event handlers
              if (stateProxy.emit) {
                fullScope.emit = stateProxy.emit;
              }
              
              try {
                const keys = Object.keys(fullScope);
                const values = Object.values(fullScope);
                // Use statement mode (no return) to allow multiple statements
                const fn = new Function(...keys, `with(this){ ${expr} }`);
                fn.call(stateProxy, ...values);
              } catch (err) {
                console.error(`Error in event handler "${expr}":`, err);
                console.error('Available scope:', Object.keys(fullScope));
              }
            };
            
            el.addEventListener(eventName, handler);
            
            // Cleanup event listener
            cleanups.push(() => {
              el.removeEventListener(eventName, handler);
            });
          }
          el.removeAttribute(attr);
        } else {
          // Handle attribute bindings
          const expr = el.getAttribute(attr);
          if (expr) {
            bind(() => {
              const result = evaluate(expr, context);
              if (result !== undefined) {
                const booleanAttrs = new Set(['disabled', 'readonly', 'checked', 'selected']);
                if (booleanAttrs.has(attr)) {
                  el.toggleAttribute(attr, !!result);
                } else {
                  el.setAttribute(attr, result);
                }
              }
            }, context);
          }
        }
      });

      // Recurse into children
      Array.from(el.childNodes).forEach(child => walk(child, context));
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
