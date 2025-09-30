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

    const roots = [...templateElement.content.childNodes];

    const stateProxy = new Proxy(state(), {
      set(target: T, key: string | symbol, value: any): boolean {
        (target as any)[key] = value;
        update();
        return true;
      }
    });

    const bindings: { node: Text; key: string, template: string }[] = [];
    function walk(node: Node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const match = node.textContent?.match(/\{(.*?)\}/);
        if (match) {
          bindings.push({ node: node as Text, key: match[1].trim(), template: node.textContent! });
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
          el.replaceWith(...(Array.isArray(c.root) ? c.root : [c.root]));
          if (Array.isArray(c.root)) c.root.forEach(walk);
          else walk(c.root);
        }
      }
      node.childNodes.forEach(walk);
    }
    roots.forEach(walk);

    function update() {
      bindings.forEach(b => {
        b.node.data = b.template.replace(
          new RegExp(`\\{${b.key}\\}`, 'g'),
          stateProxy[b.key]
        );
      });
    }

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

  window.addEventListener("popState", () => {
    render(window.location.pathname);
  });

  render(window.location.pathname);
}

export function navigate(path: string) {
  history.pushState({}, "", path);
  const event = new PopStateEvent("popState");
  dispatchEvent(event);
}

export function go(event: Event) {
  event.preventDefault();
  const href = (event.target as HTMLAnchorElement).getAttribute("href")!;
  navigate(href);
}