import { describe, test, expect, beforeEach } from "bun:test";
import { router, go } from "./router";
import { component } from "./component";
import { Window } from "happy-dom";

const window = new Window({ url: 'http://localhost' });
(globalThis as any).HTMLElement = window.HTMLElement;
(globalThis as any).HTMLInputElement = window.HTMLInputElement;
(globalThis as any).HTMLTextAreaElement = window.HTMLTextAreaElement;
(globalThis as any).HTMLSelectElement = window.HTMLSelectElement;
(globalThis as any).customElements = window.customElements;
(globalThis as any).Node = window.Node;
(globalThis as any).CustomEvent = window.CustomEvent;
(globalThis as any).document = window.document;
(globalThis as any).window = window;
(globalThis as any).history = window.history;

describe("router", () => {
    let target = document.body;
    const Home = component("home", "Home", () => ({}));
    const About = component("about", "About", () => ({}));
    const Page = component("page", "{id}", () => ({}));
    const routes = { "/": Home, "/about": About, "/page": Page };

    router(target, routes);

    beforeEach(async () => {
        go('/');
    });

    test("renders default route", async () => {
        expect(target.innerHTML).toBe('<home>Home</home>');
    });

    test("go() updates current component", async () => {
        go("/about");
        expect(target.innerHTML).toBe('<about>About</about>');
    });

    test("renders correct route with params", async () => {
        go("/page?id=42");
        expect(target.innerHTML).toBe('<page>42</page>');
    });

    test("unknown route falls back to default", async () => {
        go("/notfound");
        expect(target.innerHTML).toBe('<home>Home</home>');
    });

    test("handles query parameters with special characters", async () => {
        const Special = component("special", "{message} {id}", () => ({}));
        const specialRoutes = { "/": Home, "/special": Special };
        router(target, specialRoutes);

        go("/special?message=hello%20world&id=123%2Btest");
        expect(target.innerHTML).toBe('<special>hello world 123+test</special>');
    });

    test("handles multiple query parameters", async () => {
        const MultiParam = component("multiparam", "{a} {b} {c}", () => ({}));
        const multiRoutes = { "/": Home, "/multi": MultiParam };
        router(target, multiRoutes);

        go("/multi?a=1&b=2&c=3");
        expect(target.innerHTML).toBe('<multiparam>1 2 3</multiparam>');
    });

    test("handles empty query parameter values", async () => {
        const EmptyParam = component("emptyparam", "{empty} {present}", () => ({}));
        const emptyRoutes = { "/": Home, "/empty": EmptyParam };
        router(target, emptyRoutes);

        go("/empty?empty=&present=value");
        expect(target.innerHTML).toBe('<emptyparam> value</emptyparam>');
    });
});
