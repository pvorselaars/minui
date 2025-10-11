let currentComponent: any = null;

export function router(target: HTMLElement, routes: Record<string, (inputs?: any, routeParams?: any) => any>) {

   function parseUrl(url: string) {
    const [path, queryString] = url.split("?");
    const params: Record<string, string> = {};
    if (queryString) {
      queryString.split("&").forEach(pair => {
        const [key, value] = pair.split("=");
        params[decodeURIComponent(key)] = decodeURIComponent(value ?? "");
      });
    }
    return { path, params };
  }

  function render(url: string) {
    const { path, params } = parseUrl(url);

    if (currentComponent) {
      currentComponent.unmount();
    }

    const factory = routes[path] || routes["/"];
    if (factory) {
      currentComponent = factory(undefined, params);
      currentComponent.mount(target);
    }
  }

  window.addEventListener("popstate", async () => {
    render(window.location.pathname + window.location.search);
  });

  render(window.location.pathname + window.location.search);
}

export function go(path: string) {
  history.pushState({}, "", path);
  const event = new Event("popstate", { bubbles: true });
  window.dispatchEvent(event);
}