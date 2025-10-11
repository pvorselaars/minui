import { go } from "./router";
import { stores, subscribers } from "./store";

const components: Record<string, (input?: any) => any> = {};
const styles = new Set<string>();

function registerStyle(tag: string, style?: string) {
  if (style && !styles.has(tag)) {
    styles.add(tag);
    const styleEl = document.createElement('style');
    styleEl.textContent = style.replace(/(^|\})\s*([^{}]+)\s*\{/g, (_, brace, selector) => {
      const parts = selector.split(","); 
      const transformed = parts.map((s: any) => {
        s = s.trim();
        if (s.startsWith(":host")) return s.replace(":host", tag);
        return `${tag} ${s}`;
      });
      const indent = "      ";
      const joined = transformed.join(",\n" + indent);
      return `${brace}\n${indent}${joined} {`;
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

    const bindings: Array<{ 
      node: HTMLElement;
      template: string;
      dependencies: string[];
    }> = [];

    const conditionals: Array<{
      placeholder: Comment;
      template: Element;
      expression: string;
      dependencies: string[];
      context: Record<string, any>;
    }> = [];

    const loops: Array<{
      placeholder: Comment;
      template: Element;
      itemVar: string;
      indexVar: string | null;
      arrayExpr: string;
      dependencies: string[];
      renderedNodes: Node[];
    }> = [];

    const conditionalVisibilty: Array<{
      node: HTMLElement;
      expression: string;
      dependencies: string[];
      style: string;
    }> = [];

    const attributeBindings: Array<{
      element: HTMLElement;
      attribute: string;
      expression: string;
      dependencies: string[];
      context: Record<string, any>;
    }> = [];

    const childComponents: Array<{
      instance: any;
      bindings: Array<{
        inputKey: string;
        stateKey: string;
        dependencies: string[];
      }>;
    }> = [];

    const resolvedState = state(input);

    const fullState = Object.create(
      Object.getPrototypeOf(resolvedState || {}),
      {
        go: { value: go, enumerable: true },
        ...Object.getOwnPropertyDescriptors(resolvedState || {}),
        ...Object.getOwnPropertyDescriptors(routeParams || {}),
      }
    );

    const computedProperties = new Map<string, {
      getter: () => any;
      dependencies: Set<string>;
    }>();

    const descriptors = Object.getOwnPropertyDescriptors(fullState);

    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor.get) {
        computedProperties.set(key, {
          getter: descriptor.get,
          dependencies: new Set()
        });
      }
    }

    const usedStoreKeys = new Map<any, Set<string>>();
    const stateStores = new Map<string, any>();
    Object.entries(fullState).forEach(([key, value]) => {
      if (value && typeof value === 'object' && stores.has(value)) {
        stateStores.set(key, value);
      }
    });

    function createDeepProxy(obj: any, path: string[] = []): any {
      if (obj === null || typeof obj !== 'object') {
        return obj;
      }

      if (obj.__proxy) {
        return obj;
      }

      if (Array.isArray(obj)) {
        const arrayProxy = new Proxy(obj, {
          get(target: any, key: string | symbol): any {
            if (key === '__proxy') {
              return true;
            }

            if (currentlyTracking && typeof key === 'string' && key !== 'emit' && key !== '__proxy') {
              const rootKey = path.length > 0 ? path[0] : key.toString();
              currentlyTracking.add(rootKey);
            }

            const value = target[key];

            if (typeof value === 'function' && ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'].includes(key as string)) {
              return function(this: any, ...args: any[]) {
                const result = value.apply(this, args);
                
                const rootKey = path.length > 0 ? path[0] : 'length';
                updateKey(rootKey);
                
                return result;
              };
            }

            if (typeof value === 'object' && value !== null) {
              return createDeepProxy(value, [...path, key.toString()]);
            }
            return value;
          },
          set(target: any, key: string | symbol, value: any): boolean {
            const isAlreadyProxy = value && typeof value === 'object' && value.__proxy;
            
            if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof RegExp) && !isAlreadyProxy) {
              target[key] = value;

              const newPath = [...path, key.toString()];
              Object.defineProperty(target, key, {
                value: createDeepProxy(value, newPath),
                writable: true,
                enumerable: true,
                configurable: true
              });
            } else {
              target[key] = value;
            }
            
            const rootKey = path.length > 0 ? path[0] : key.toString();
            const fullPath = [...path, key.toString()].join('.');
            
            if (stores.has(target)) {
              const subscribersMap = subscribers.get(target);
              if (subscribersMap && typeof key === 'string') {
                const keySubscribers = subscribersMap.get(key);
                if (keySubscribers) {
                  keySubscribers.forEach(callback => callback());
                }
              }
            }
            
            updateKey(rootKey);
            
            if (fullPath !== rootKey) {
              updateKey(fullPath);
            }
            
            for (let i = 1; i < path.length; i++) {
              const intermediatePath = path.slice(0, i + 1).join('.');
              updateKey(intermediatePath);
            }

            
            return true;
          }
        });

        return arrayProxy;
      }

      const proxy = new Proxy(obj, {
        get(target: any, key: string | symbol): any {
          if (key === '__proxy') {
            return true;
          }
          
          // Track property access for computed dependencies
          if (currentlyTracking && typeof key === 'string' && key !== 'emit' && key !== '__proxy') {
            const rootKey = path.length > 0 ? path[0] : key.toString();
            currentlyTracking.add(rootKey);
          }
          
          const value = target[key];
          if (typeof value === 'object' && value !== null && key !== 'emit') {
            return createDeepProxy(value, [...path, key.toString()]);
          }
          return value;
        },
        set(target: any, key: string | symbol, value: any): boolean {
          const isAlreadyProxy = value && typeof value === 'object' && value.__isMinuiProx;
          
          if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof RegExp) && !isAlreadyProxy) {
            target[key] = value;

            const newPath = [...path, key.toString()];
            Object.defineProperty(target, key, {
              value: createDeepProxy(value, newPath),
              writable: true,
              enumerable: true,
              configurable: true
            });
          } else {
            target[key] = value;
          }
          
          const rootKey = path.length > 0 ? path[0] : key.toString();
          const fullPath = [...path, key.toString()].join('.');
          
          if (stores.has(target)) {
            const subscribersMap = subscribers.get(target);
            if (subscribersMap && typeof key === 'string') {
              const keySubscribers = subscribersMap.get(key);
              if (keySubscribers) {
                keySubscribers.forEach(callback => callback());
              }
            }
          }
          
          updateKey(rootKey);
          
          if (fullPath !== rootKey) {
            updateKey(fullPath);
          }
          
          for (let i = 1; i < path.length; i++) {
            const intermediatePath = path.slice(0, i + 1).join('.');
            updateKey(intermediatePath);
          }

          if (value && typeof value === 'object') {
            function triggerNested(obj: any, parentPath: string) {
              for (const k in obj) {
                const nestedPath = parentPath + '.' + k;
                updateKey(nestedPath);
                if (typeof obj[k] === 'object' && obj[k] !== null) {
                  triggerNested(obj[k], nestedPath);
                }
              }
            }
            triggerNested(value, fullPath);
          }
          
          return true;
        }
      });

      return proxy;
    }

    const stateProxy = createDeepProxy(fullState, []);

    let currentlyTracking: Set<string> | null = null;

    computedProperties.forEach((computed, key) => {
      currentlyTracking = new Set();
      try {
        computed.getter.call(stateProxy);
      } catch (e) {
      }
      computed.dependencies = currentlyTracking;
      currentlyTracking = null;

      Object.defineProperty(stateProxy, key, {
        get() {
          const previousTracking = currentlyTracking;
          currentlyTracking = new Set();
          
          const result = computed.getter.call(stateProxy);
          
          computed.dependencies = currentlyTracking;
          currentlyTracking = previousTracking;
          
          return result;
        },
        enumerable: true,
        configurable: true
      });
    });

    Object.defineProperty(stateProxy, 'getByPath', {
      value: (pathString: string) => {
        return pathString.split('.').reduce((acc: any, k) => acc?.[k], stateProxy);
      },
      enumerable: false,
      writable: false
    });

    Object.defineProperty(stateProxy, 'setByPath', {
      value: (pathString: string, value: any) => {
        const keys = pathString.split('.');
        const lastKey = keys.pop()!;
        const parent = keys.reduce((acc: any, k) => acc?.[k], stateProxy);
        if (parent && typeof parent === 'object') {
          parent[lastKey] = value;
          return true;
        }
        return false;
      },
      enumerable: false,
      writable: false
    });

    function toNodeArray(x: Node | Node[] | NodeList): Node[] {
      if (x instanceof Node) return [x];
      if (x instanceof NodeList) return Array.from(x);
      if (Array.isArray(x)) return x.flatMap(toNodeArray);
      return [];
    }

    function evaluateExpression(expr: string, context: Record<string, any> = {}): any {
      try {
        const scope = new Proxy({ ...stateProxy, ...context }, {
          get(target, key: string) {
            return key in target ? (target as any)[key] : undefined;
          }
        });

        return new Function("state", `with(state) { return ${expr} }`)(scope);
      } catch {
        return undefined;
      }
    }

    function extractDependencies(expr: string, loopContext: Record<string, any> = {}): string[] {
      const deps = new Set<string>();

      const stateKeys = Object.keys(stateProxy);
      const loopKeys = Object.keys(loopContext);

      const cleanExpr = expr.replace(/\?\./g, '.');

      for (const key of stateKeys) {
        const regex = new RegExp(`\\b${key}(?:\\.(\\w+(?:\\.\\w+)*))?\\b`, 'g');
        let match;
        while ((match = regex.exec(cleanExpr)) !== null) {
          const propertyPath = match[1];
          if (propertyPath) {
            deps.add(`${key}.${propertyPath}`);
          } else {
            deps.add(key);
          }
        }
      }

      for (const key of loopKeys) {
        const regex = new RegExp(`\\b${key}(?:\\.(\\w+(?:\\.\\w+)*))?\\b`, 'g');
        let match;
        while ((match = regex.exec(cleanExpr)) !== null) {
          const propertyPath = match[1];
          if (propertyPath) {
            deps.add(`${key}.${propertyPath}`);
          } else {
            deps.add(key);
          }
        }
      }

      return Array.from(deps);
    }

    function walk(node: Node, loopContext: Record<string, any> = {}) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        const matches = text.match(/\{(.*?)\}/g);
        if (!matches) return;

        let result = text;
        for (const match of matches) {
          const key = match.slice(1, -1).trim();
          const cleanKey = key.replace(/\?\./g, '.');
          const rootVar = cleanKey.split(/[.\[\(]/)[0];

          const store = stateStores.get(rootVar);
          if (store) {
            const storeAccessPattern = new RegExp(`\\b${rootVar}\\.(\\w+)`, 'g');
            let match = storeAccessPattern.exec(cleanKey);
            if (match !== null) {
              if (!usedStoreKeys.has(store)) {
                usedStoreKeys.set(store, new Set());
              }
              usedStoreKeys.get(store)!.add(match[1]);
              bindings.push({node: node as HTMLElement, template: text, dependencies: [match[1]]});
            }
          } else if (rootVar in stateProxy && !(rootVar in loopContext)) {
            const deps = computedProperties.has(rootVar) ? [rootVar] : [key];
            bindings.push({node: node as HTMLElement, template: text, dependencies: deps});
          }

          const value = evaluateExpression(key, loopContext);
          result = result.replace(match, String(value ?? ''));
          (node as Text).data = result;
        }
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;

        if (el.hasAttribute('if')) {
          const expression = el.getAttribute('if')!.trim();
          const shouldRender = !!evaluateExpression(expression, loopContext);
          
          const placeholder = document.createComment(`if:${expression}`);
          el.parentNode?.insertBefore(placeholder, el);
          
          const templateClone = el.cloneNode(true) as Element;
          templateClone.removeAttribute('if');
          
          conditionals.push({
            placeholder,
            template: templateClone,
            expression,
            dependencies: extractDependencies(expression),
            context: loopContext
          });
          
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }
          
          if (shouldRender) {
            const rendered = templateClone.cloneNode(true) as Element;
            placeholder.parentNode?.insertBefore(rendered, placeholder.nextSibling);
            walk(rendered, loopContext);
          }
          
          return;
        }

        if (el.hasAttribute('for')) {
          const forExpr = el.getAttribute('for')!.trim();
          const match = forExpr.match(/^(\w+)(?:\s*,\s*(\w+))?\s+in\s+(.+)$/);
          
          if (match) {
            const itemVar = match[1];
            const indexVar = match[2] || null;
            const arrayExpr = match[3];
            
            const placeholder = document.createComment(`for:${forExpr}`);
            el.parentNode?.insertBefore(placeholder, el);
            
            const templateClone = el.cloneNode(true) as Element;
            templateClone.removeAttribute('for');
            
            const loopData = {
              placeholder,
              template: templateClone,
              itemVar,
              indexVar,
              arrayExpr,
              dependencies: extractDependencies(arrayExpr),
              renderedNodes: [] as Node[]
            };
            
            loops.push(loopData);
            el.remove();
            
            renderLoop(loopData, loopContext);
            return;
          }
        }

        if (el.hasAttribute("show")) {
          const expression = el.getAttribute('show')!.trim();
          conditionalVisibilty.push({
            node: el,
            expression,
            dependencies: extractDependencies(expression),
            style: ''
          });
          el.removeAttribute("show");
        }

        if (el.hasAttribute("bind")) {
          const key = el.getAttribute('bind')!.trim();
          const val = stateProxy.getByPath(key);
          if (el instanceof HTMLInputElement) {
            if (el.type === 'checkbox') {
              el.checked = !!val;
            } else if (el.type === 'radio') {
              el.checked = el.value === val;
            } else {
              el.value = val ?? '';
            }
          } else if (el instanceof HTMLSelectElement) {
            el.value = val ?? '';
          } else if (el instanceof HTMLTextAreaElement) {
            el.value = val ?? '';
          }
          
          const updateState = (e: Event) => {
            const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
            if (target instanceof HTMLInputElement) {
              if (target.type === 'checkbox') {
                stateProxy.setByPath(key, target.checked);
              } else if (target.type === 'radio') {
                stateProxy.setByPath(key, target.checked ? target.value : '');
              } else {
                stateProxy.setByPath(key, target.value);
              }
            } else {
              stateProxy.setByPath(key, target.value);
            }
          };
          
          el.addEventListener('input', updateState);
          el.addEventListener('change', updateState);
          
          const dependencies = extractDependencies(key);
          bindings.push({node: el, template: `{${key}}`, dependencies });
        }
        el.removeAttribute("bind");

        const childTag = el.tagName.toLowerCase();
        if (components[childTag] && childTag !== tag) {
          const childInputs: Record<string, any> = {};
          const eventListeners: Array<{event: string, handler: Function}> = [];
          const inputBindings: Array<{inputKey: string, stateKey: string, dependencies: string[]}> = [];

          el.getAttributeNames().forEach(attr => {
            if (attr.startsWith("on:")) {
              const eventName = attr.slice(3);
              const expr = el.getAttribute(attr)?.trim();
              if (expr) {
                eventListeners.push({
                  event: eventName,
                  handler: (e: Event) => {
                    const ctx = { ...stateProxy, ...window, event: e };
                    try {
                      const fn = new Function(...Object.keys(ctx), `with(this){ return (${expr}) }`);
                      fn.call(stateProxy, ...Object.values(ctx));
                    } catch (err) {
                      console.error(`Error evaluating child component event "${expr}":`, err);
                    }
                  }
                });
              }
              return;
            }

            const value = el.getAttribute(attr)!;
            const bindMatch = value.match(/^\{(.*)\}$/);
            if (bindMatch) {
              const key = bindMatch[1].trim();
              const resolvedValue = evaluateExpression(key, loopContext);
              childInputs[attr] = resolvedValue;
              
              const dependencies = extractDependencies(key);
              inputBindings.push({
                inputKey: attr,
                stateKey: key,
                dependencies
              });
            } else {
              try {
                childInputs[attr] = JSON.parse(value);
              } catch {
                childInputs[attr] = value;
              }
            }
          });

          const c = components[childTag](childInputs);
          const childRoots = toNodeArray(c.root);

          eventListeners.forEach(({event, handler}) => {
            childRoots.forEach(root => {
              if (root instanceof Element) {
                root.addEventListener(event, handler as EventListener);
              }
            });
          });

          // Store child component instance with its bindings
          if (inputBindings.length > 0) {
            childComponents.push({
              instance: c,
              bindings: inputBindings
            });
          }

          if (el.parentElement) {
            c.mount(el.parentElement, el);
            el.remove();
          } else {
            // If no parent yet, just replace the element
            const childRoots = toNodeArray(c.root);
            childRoots.forEach(root => {
              el.parentNode?.insertBefore(root, el);
            });
            el.remove();
          }

          return;
        }

        el.getAttributeNames().forEach(attr => {
          if (attr.startsWith("on:")) {
            const eventName = attr.slice(3);
            const expr = el.getAttribute(attr)?.trim();
            if (expr) {
              el.addEventListener(eventName, (e: Event) => {
                const ctx = {...stateProxy, ...loopContext, ...window, event: e};
                try {
                  const fn = new Function(...Object.keys(ctx), `with(this){ return (${expr}) }`);
                  fn.call(stateProxy, ...Object.values(ctx));
                } catch (err) {
                  console.error(`Error evaluating event "${expr}":`, err);
                }
              });
            }
            el.removeAttribute(attr);
          } else {
            const expr = el.getAttribute(attr);
            if (expr) {
              const result = evaluateExpression(expr, loopContext);
              if (result !== undefined) {
                const dependencies = extractDependencies(expr, loopContext);
                if (dependencies.length > 0) {
                  attributeBindings.push({
                    element: el,
                    attribute: attr,
                    expression: expr,
                    dependencies,
                    context: loopContext
                  });
                }
                el.setAttribute(attr, result);
              }
            }
          }
        });

        for (const child of Array.from(node.childNodes)) {
          walk(child, loopContext);
        }
      }
    }

    function renderLoop(loopData: typeof loops[0], parentContext: Record<string, any> = {}) {
      const nodesToRemove = new Set(loopData.renderedNodes);
      
      for (let i = conditionals.length - 1; i >= 0; i--) {
        const placeholder = conditionals[i].placeholder;
        for (const node of nodesToRemove) {
          if (node.contains(placeholder)) {
            conditionals.splice(i, 1);
            break;
          }
        }
      }
      
      for (let i = loops.length - 1; i >= 0; i--) {
        if (loops[i] === loopData) continue;
        const placeholder = loops[i].placeholder;
        for (const node of nodesToRemove) {
          if (node.contains(placeholder)) {
            loops.splice(i, 1);
            break;
          }
        }
      }
      
      loopData.renderedNodes.forEach(node => node.parentNode?.removeChild(node));
      loopData.renderedNodes = [];

      const array = evaluateExpression(loopData.arrayExpr, parentContext);
      if (!Array.isArray(array)) return;

      const fragment = document.createDocumentFragment();

      for (let index = 0; index < array.length; index++) {
        const item = array[index];
        const context = { ...parentContext, [loopData.itemVar]: item };
        if (loopData.indexVar) context[loopData.indexVar] = index;
        const rendered = loopData.template.cloneNode(true) as Element;
        walk(rendered, context);
        fragment.appendChild(rendered);
        loopData.renderedNodes.push(rendered);
      }

      loopData.placeholder.parentNode?.insertBefore(fragment, loopData.placeholder.nextSibling);
    }

    walk(root);

    function updateConditionals(changedKey: string) {
      conditionals.forEach(cond => {
        if (!cond.dependencies.includes(changedKey)) return;
        
        const shouldRender = !!evaluateExpression(cond.expression, cond.context);
        const currentlyRendered = cond.placeholder.nextSibling && 
                                  cond.placeholder.nextSibling.nodeType === Node.ELEMENT_NODE;
        
        if (shouldRender && !currentlyRendered) {
          const rendered = cond.template.cloneNode(true) as Element;
          cond.placeholder.parentNode?.insertBefore(rendered, cond.placeholder.nextSibling);
          walk(rendered, cond.context);
        } else if (!shouldRender && currentlyRendered) {
          cond.placeholder.nextSibling?.remove();
        }
      });
    }

    function updateLoops(changedKey: string) {
      loops.forEach(loopData => {
        if (!loopData.dependencies.includes(changedKey)) return;
        renderLoop(loopData);
      });
    }

    function updateChildComponents(changedKey: string) {
      childComponents.forEach(child => {
        child.bindings.forEach(binding => {
          if (!binding.dependencies.includes(changedKey)) return;
          
          const newValue = evaluateExpression(binding.stateKey);
          
          if (child.instance.state) {
            child.instance.state[binding.inputKey] = newValue;
          }
        });
      });
    }

    function updateVisibility(changedKey: string) {
      conditionalVisibilty.forEach(cond => {
        if (!cond.dependencies.includes(changedKey)) return;
        
        const shouldShow = !!evaluateExpression(cond.expression);
        const currentlyShowing = cond.node.style.display !== 'none';
        
        if (shouldShow && !currentlyShowing) {
          cond.node.style.display = cond.style;
        } else if (!shouldShow && currentlyShowing) {
          cond.style = cond.node.style.display;
          cond.node.style.display = 'none';
        }
      });
    }

    function updateAttributes(changedKey: string) {
      attributeBindings.forEach(binding => {
        if (!binding.dependencies.includes(changedKey)) return;
        
        const result = evaluateExpression(binding.expression, binding.context);
        const booleanAttributes = new Set(["disabled", "readonly", "checked", "selected"]);
        if (booleanAttributes.has(binding.attribute)) {
          binding.element.toggleAttribute(binding.attribute, !!result);
        } else {
          binding.element.setAttribute(binding.attribute, result);
        }
      });
    }

    function updateBindings(changedKey: string) {
      bindings.forEach(binding => {
        if (!binding.dependencies.includes(changedKey)) return;

        const el = binding.node as HTMLElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

        let result = binding.template;
        const matches = binding.template.match(/\{(.*?)\}/g);
        if (matches) {
          for (const match of matches) {
            const expr = match.slice(1, -1).trim();
            const value = evaluateExpression(expr);
            result = result.replace(match, String(value ?? ''));
          }
        }

        if (el instanceof HTMLInputElement) {
          if (el.type === "checkbox") {
            const expr = binding.template.match(/\{(.*?)\}/)?.[1]?.trim() || binding.dependencies[0];
            el.checked = !!evaluateExpression(expr);
          } else if (el.type === "radio") {
            const expr = binding.template.match(/\{(.*?)\}/)?.[1]?.trim() || binding.dependencies[0];
            el.checked = el.value === evaluateExpression(expr);
          } else {
            el.value = result.replace(/^\{|\}$/g, '');
          }
        } else if (el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
          el.value = result.replace(/^\{|\}$/g, '');
        } else if ("data" in el) {
          (el as any).data = result;
        }
      });
    }

    function updateKey(key: string) {
      updateBindings(key);
      updateConditionals(key);
      updateLoops(key);
      updateVisibility(key);
      updateAttributes(key);
      updateChildComponents(key);
      
      computedProperties.forEach((computed, computedKey) => {
        const rootKey = key.split('.')[0];
        
        if (computed.dependencies.has(rootKey) || computed.dependencies.has(key)) {
          updateKey(computedKey);
        }
      });
    }

    function update() {
      for (const key of Object.keys(stateProxy)) {
        updateKey(key.toString());
      }
    }

    update();

    const unsubscribers: Array<() => void> = [];
    usedStoreKeys.forEach((keys, store) => {
      const subscribersMap = subscribers.get(store);
      if (subscribersMap) {
        keys.forEach(key => {
          if (!subscribersMap.has(key)) {
            subscribersMap.set(key, new Set());
          }
          const callback = () => updateKey(key);
          subscribersMap.get(key)!.add(callback);
          unsubscribers.push(() => subscribersMap.get(key)?.delete(callback));
        });
      }
    });

    Object.defineProperty(stateProxy, 'emit', {
      value: (name: string, detail?: any) => {
        root.dispatchEvent(
          new CustomEvent(name, { detail, bubbles: true })
        );
      },
      enumerable: false
    });

    return {
      root: root,
      mount(target: HTMLElement, before?: HTMLElement) {
        if (before) {
          target.insertBefore(root, before);
        } else {
          target.appendChild(root);
        }
        update();
        if ('mounted' in stateProxy && typeof (stateProxy as any).mounted === 'function') {
          (stateProxy as any).mounted();
        }
      },
      state: stateProxy,
      unmount() {
        root.parentElement?.removeChild(root);
        unsubscribers.forEach(unsub => unsub());
        if ('unmounted' in stateProxy && typeof (stateProxy as any).unmounted === 'function') {
          (stateProxy as any).unmounted();
        }
      }
    };
  };

  components[tag.toLowerCase()] = factory;
  return factory;
}