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
});
