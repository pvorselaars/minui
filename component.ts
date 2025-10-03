import { go } from "./router";

const components: Record<string, (input?: any) => any> = {};

export function component<T extends Record<string, any>, P = {}>(
  tag: string,
  template: string,
  state: (this: T & { emit: (eventName: string, detail?: any) => void}, input?: P) => T
) {
  type State = T & { emit: (eventName: string, detail?: any) => void };

  const factory = function (input?: P) {
    const root = document.createElement(tag);
    root.innerHTML = template.trim();

    const fullState: T & { emit: (eventName: string, detail?: any) => void }= {
      go,
      ...state.call({} as any, undefined),
      ...state.call({} as any, input),
      emit: () => {},
      ...input
    }

    const stateProxy = new Proxy(fullState, {
      set(target: T, key: string | symbol, value: any): boolean {
        (target as any)[key] = value;
        updateKey(key.toString());
        return true;
      }
    }) as State;

    function toNodeArray(x: Node | Node[] | NodeList): Node[] {
      if (x instanceof Node) return [x];
      if (x instanceof NodeList) return Array.from(x);
      if (Array.isArray(x)) return x.flatMap(toNodeArray);
      return [];
    }

    const bindings: Record<string, { node: Text; template: string }> = {};
    const conditionals: Array<{
      placeholder: Comment;
      template: Element;
      expression: string;
      dependencies: string[];
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

    function evaluateExpression(expr: string, context: Record<string, any> = {}): any {
      try {
        const allVars = {...stateProxy, ...context};
        const func = new Function(...Object.keys(allVars), `return ${expr}`);
        return func(...Object.values(allVars));
      } catch (e) {
        console.error(`Failed to evaluate expression: ${expr}`, e);
        return false;
      }
    }

    function extractDependencies(expr: string): string[] {
      const deps = new Set<string>();
      const stateKeys = Object.keys(stateProxy);
      
      for (const key of stateKeys) {
        if (new RegExp(`\\b${key}\\b`).test(expr)) {
          deps.add(key);
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
          const rootVar = key.split(/[.\[\(]/)[0];

          if (rootVar in stateProxy && !(rootVar in loopContext)) {
            bindings[key] = { node: node as Text, template: text };
          }

          const value = evaluateExpression(key, loopContext);
          result = result.replace(match, String(value ?? ''));
          (node as Text).data = result;
        }
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;

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
            if (el.parentNode) {
              el.parentNode.removeChild(el);
            }
            
            renderLoop(loopData, loopContext);
            return;
          }
        }

        if (el.hasAttribute('if')) {
          const expression = el.getAttribute('if')!.replace(/[{}]/g, '').trim();
          const shouldRender = !!evaluateExpression(expression, loopContext);
          
          const placeholder = document.createComment(`if:${expression}`);
          el.parentNode?.insertBefore(placeholder, el);
          
          const templateClone = el.cloneNode(true) as Element;
          templateClone.removeAttribute('if');
          
          conditionals.push({
            placeholder,
            template: templateClone,
            expression,
            dependencies: extractDependencies(expression)
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

        const childTag = el.tagName.toLowerCase();
        if (components[childTag] && childTag !== tag) {
          const childInputs: Record<string, any> = {};
          const eventListeners: Array<{event: string, handler: Function}> = [];

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
                      new Function(...Object.keys(ctx), `return ${expr}`)(...Object.values(ctx));
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
            } else {
              try {
                childInputs[attr] = JSON.parse(value);
              } catch {
                childInputs[attr] = value;
              }
            }
          });

          const c = components[childTag](childInputs)
          const childRoots = toNodeArray(c.root);

          eventListeners.forEach(({event, handler}) => {
            childRoots.forEach(root => {
              if (root instanceof Element) {
                root.addEventListener(event, handler as EventListener);
              }
            });
          });

          for (const r of childRoots) {
            el.parentNode?.insertBefore(r, el);
          }

          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }

          return;
        }

        el.getAttributeNames().forEach(attr => {
          if (attr.startsWith("on:")) {
            const eventName = attr.slice(3);
            const expr = el.getAttribute(attr)?.trim();
            if (expr) {
              el.addEventListener(eventName, (e: Event) => {
                const ctx = {...stateProxy, ...window, event: e};
                try {
                  const fn = new Function(...Object.keys(ctx), `with(this){ return (${expr}) }`);
                  fn.call(stateProxy, ...Object.values(ctx));
                } catch (err) {
                  console.error(`Error evaluating event "${expr}":`, err);
                }
              });
            } 
        
            el.removeAttribute(attr);
          }

          if (attr.startsWith("bind:")) {
            const prop = attr.slice(5);
            const stateKey = el.getAttribute(attr)?.replace(/[{}]/g, "").trim();
            
            if (stateKey && stateKey in stateProxy) {
              if (el instanceof HTMLInputElement) {
                if (el.type === 'checkbox') {
                  el.checked = !!stateProxy[stateKey];
                } else if (el.type === 'radio') {
                  el.checked = el.value === stateProxy[stateKey];
                } else {
                  el.value = stateProxy[stateKey] ?? '';
                }
              } else if (el instanceof HTMLSelectElement) {
                el.value = stateProxy[stateKey] ?? '';
              } else if (el instanceof HTMLTextAreaElement) {
                el.value = stateProxy[stateKey] ?? '';
              }
              
              // Listen for changes
              const updateState = (e: Event) => {
                const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
                if (target instanceof HTMLInputElement && target.type === 'checkbox') {
                  (stateProxy as any)[stateKey] = target.checked;
                } else if (target instanceof HTMLInputElement && target.type === 'radio') {
                  if (target.checked) {
                    (stateProxy as any)[stateKey] = target.value;
                  }
                } else {
                  (stateProxy as any)[stateKey] = target.value;
                }
              };
              
              el.addEventListener('input', updateState);
              el.addEventListener('change', updateState);
              
              bindings[stateKey] = { node: el as any, template: `{${stateKey}}` };

              bindings[stateKey].node = {
                set data(value: string) {
                  if (el instanceof HTMLInputElement) {
                    if (el.type === 'checkbox') {
                      el.checked = !!value;
                    } else if (el.type === 'radio') {
                      el.checked = el.value === value;
                    } else {
                      el.value = value ?? '';
                    }
                  } else if (el instanceof HTMLSelectElement) {
                    el.value = value ?? '';
                  }
                }
              } as any;
              
            }
            
            el.removeAttribute(attr);
          }

        });

        node.childNodes.forEach(child => walk(child, loopContext));
      }
    }

    function renderLoop(loopData: typeof loops[0], parentContext: Record<string, any> = {}) {
      loopData.renderedNodes.forEach(node => {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      });

      loopData.renderedNodes = [];
      
      const array = evaluateExpression(loopData.arrayExpr, parentContext);
      
      if (!Array.isArray(array)) {
        console.warn(`For loop expression did not return an array: ${loopData.arrayExpr}`);
        return;
      }
      
      array.forEach((item, index) => {
        const context = {
          ...parentContext,
          [loopData.itemVar]: item
        };
        
        if (loopData.indexVar) {
          context[loopData.indexVar] = index;
        }
        
        const rendered = loopData.template.cloneNode(true) as Element;
        const parent = loopData.placeholder.parentNode;
        if (!parent) return;
        
        const marker = document.createComment('loop-item-start');
        parent.insertBefore(marker, loopData.placeholder.nextSibling);
        
        parent.insertBefore(rendered, marker.nextSibling);
        
        walk(rendered, context);
        
        const insertedNodes: Node[] = [];
        let current = marker.nextSibling;
        while (current) {
          if (current.nodeType === Node.COMMENT_NODE && 
              (current.textContent === 'loop-item-start' || current === loopData.placeholder)) {
            break;
          }
          insertedNodes.push(current);
          current = current.nextSibling;
        }
        
        parent.removeChild(marker);
        
        loopData.renderedNodes.push(...insertedNodes);
      });
    }

    walk(root);

    function update() {
      for (const key in bindings) {
        updateKey(key.toString());
      }
    }

    function updateConditionals(changedKey: string) {
      conditionals.forEach(cond => {
        if (!cond.dependencies.includes(changedKey)) return;
        
        const shouldRender = !!evaluateExpression(cond.expression);
        const currentlyRendered = cond.placeholder.nextSibling && 
                                   cond.placeholder.nextSibling.nodeType === Node.ELEMENT_NODE;
        
        if (shouldRender && !currentlyRendered) {
          const rendered = cond.template.cloneNode(true) as Element;
          cond.placeholder.parentNode?.insertBefore(rendered, cond.placeholder.nextSibling);
          walk(rendered);
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

    function updateKey(key: string) {
      for (const bindingKey in bindings) {
        const rootVar = bindingKey.split(/[.\[\(]/)[0];
        if (rootVar === key) {
          const value = evaluateExpression(bindingKey);
          bindings[bindingKey].node.data = bindings[bindingKey].template.replace(
            new RegExp(`\\{${bindingKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`, 'g'),
            value
          );
        }
      }
      updateConditionals(key);
      updateLoops(key);
    };

    update();

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
      mount(target: HTMLElement) {
        target.appendChild(root);
        update();
      },
      state: stateProxy
    };
  };

  components[tag.toLowerCase()] = factory;
  return factory;
}