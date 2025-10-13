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

  function matchRoute(path: string, routes: Record<string, any>) {
    // First try exact match
    if (routes[path]) {
      return { factory: routes[path], params: {} };
    }

    // Then try pattern matching for routes with parameters
    for (const routePattern of Object.keys(routes)) {
      const paramNames: string[] = [];
      const regexPattern = routePattern.replace(/:([^\/]+)/g, (match, paramName) => {
        paramNames.push(paramName);
        return "([^/]+)";
      });

      const regex = new RegExp(`^${regexPattern}$`);
      const match = path.match(regex);

      if (match) {
        const routeParams: Record<string, string> = {};
        paramNames.forEach((name, index) => {
          routeParams[name] = decodeURIComponent(match[index + 1]);
        });
        return { factory: routes[routePattern], params: routeParams };
      }
    }

    // Fall back to default route
    return { factory: routes["/"], params: {} };
  }

  function render(url: string) {
    const { path, params: queryParams } = parseUrl(url);

    if (currentComponent) {
      currentComponent.unmount();
    }

    const { factory, params: routeParams } = matchRoute(path, routes);
    if (factory) {
      currentComponent = factory(undefined, { ...queryParams, ...routeParams });
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