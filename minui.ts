export function component<T extends Record<string, any>>(
  template: string,
  state: () => T,
) {
  return function () {
    const root = document.createElement("div");
    root.innerHTML = template;

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
      node.childNodes.forEach(walk);
    }
    walk(root);

    root.querySelectorAll<HTMLElement>("*").forEach(el => {
        el.getAttributeNames().forEach(attr => {
            if (attr.startsWith("on:")) {
                const event = attr.slice(3);
                const handler = el.getAttribute(attr)?.replace(/[{}]/g, "").trim();
                if (handler && stateProxy[handler]) {
                    el.addEventListener(event, stateProxy[handler].bind(stateProxy));
                }
                el.removeAttribute(attr);
            }});
    });

    function update() {
      bindings.forEach(b => {
        b.node.data = b.template.replace(
            new RegExp(`\\{${b.key}\\}`, 'g'),
            stateProxy[b.key]
        );
      });
    }

    return {
      mount(target: HTMLElement) {
        target.appendChild(root);
        update();
      },
      state
    };
  };
}
