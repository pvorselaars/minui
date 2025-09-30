let currentComponent: any = null;
const components: Record<string, () => any> = {};

export function component<T extends Record<string, any>>(
  tag: string,
  template: string,
  state: () => T,
) {
  const factory = function () {
    const templateElement = document.createElement("template");
    templateElement.innerHTML = template.trim();

    const stateProxy = new Proxy(state(), {
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

        const tag = el.tagName.toLowerCase();
        if (components[tag]) {
          const c = components[tag]();
          const childRoots = toNodeArray(c.root);
          const p = el.parentNode as HTMLElement;

          for (const r of childRoots) {
            p.insertBefore(r, el);
          }

          el.remove();
          childRoots.forEach(walk);
        }
      }

      node.childNodes.forEach(walk);
    }

    let roots = [...templateElement.content.childNodes];
    roots.forEach(walk);
    roots = [...templateElement.content.childNodes];

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
      root: roots,
      mount(target: HTMLElement) {
        roots.forEach(node => target.appendChild(node));
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