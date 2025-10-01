let currentComponent: any = null;
const components: Record<string, (input?: any) => any> = {};

export function component<T extends Record<string, any>, P = {}>(
  tag: string,
  template: string,
  state: (input?: P) => T,
) {
  const factory = function (input?: P) {
    const root = document.createElement(tag);
    root.innerHTML = template.trim();

    const merged = {...state(), ...state(input)};

    const stateProxy = new Proxy(merged, {
      set(target: T, key: string | symbol, value: any): boolean {
        (target as any)[key] = value;
        updateKey(key.toString());
        return true;
      }
    });

    function toNodeArray(x: Node | Node[] | NodeList): Node[] {
      if (x instanceof Node) return [x];
      if (x instanceof NodeList) return Array.from(x);
      if (Array.isArray(x)) return x.flatMap(toNodeArray);
      return [];
    }

    const bindings: Record<string, { node: Text; template: string }> = {};

    function walk(node: Node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const match = node.textContent?.match(/\{(.*?)\}/);
        if (match) {
          bindings[match[1].trim()] = { node: node as Text, template: node.textContent! };
        }
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        el.getAttributeNames().forEach(attr => {
          if (attr.startsWith("on:")) {
            const event = attr.slice(3);
            const handler = el.getAttribute(attr)?.replace(/[{}]/g, "").trim();
            if (handler && stateProxy[handler]) {
              el.addEventListener(event, stateProxy[handler].bind(stateProxy));
            }
            el.removeAttribute(attr);
          }
        });

        const childTag = el.tagName.toLowerCase();
        if (components[childTag] && childTag !== tag) {
          const childInputs: Record<string, any> = {};
          el.getAttributeNames().forEach(attr => {
            const value = el.getAttribute(attr)!;
            const bindMatch = value.match(/^\{(.*)\}$/);
            if (bindMatch) {
              const key = bindMatch[1].trim();
              childInputs[attr] = stateProxy[key];
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

          for (const r of childRoots) {
            el.parentNode?.insertBefore(r, el);
          }

          el.remove();
        }
      }

      node.childNodes.forEach(walk);
    }

    walk(root);

    function update() {
      for (const key in bindings) {
        updateKey(key.toString());
      }
    }

    function updateKey(key: string) {
      bindings[key].node.data = bindings[key].template.replace(
        new RegExp(`\\{${key}\\}`, 'g'),
        stateProxy[key]
      );
    };

    update();

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

export function router(target: HTMLElement, routes: Record<string, () => any>) {

  function render(path: string) {
    if (currentComponent) {
      target.innerHTML = "";
    }

    const factory = routes[path] || routes["/"];
    if (factory) {
      currentComponent = factory();
      currentComponent.mount(target);
    }
  }

  window.addEventListener("popstate", () => {
    render(window.location.pathname);
  });

  render(window.location.pathname);
}

export function navigate(path: string) {
  history.pushState({}, "", path);
  const event = new PopStateEvent("popstate");
  dispatchEvent(event);
}

export function go(event: Event) {
  event.preventDefault();
  const href = (event.target as HTMLAnchorElement).getAttribute("href")!;
  navigate(href);
}