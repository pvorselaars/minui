let currentComponent: any = null;

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

export function go(path: string) {
  history.pushState({}, "", path);
  const event = new PopStateEvent("popstate");
  dispatchEvent(event);
}