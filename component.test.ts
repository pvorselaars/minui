import { describe, expect, test, beforeEach } from "bun:test";
import { component } from "./component";
import { Window } from "happy-dom";

const window = new Window();
(globalThis as any).HTMLElement = window.HTMLElement;
(globalThis as any).HTMLInputElement = window.HTMLInputElement;
(globalThis as any).HTMLTextAreaElement = window.HTMLTextAreaElement;
(globalThis as any).HTMLSelectElement = window.HTMLSelectElement;
(globalThis as any).customElements = window.customElements;
(globalThis as any).Node = window.Node;
(globalThis as any).CustomEvent = window.CustomEvent;
(globalThis as any).document = window.document;
(globalThis as any).window = window;

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

describe("component()", () => {
  test("should register and render a basic component", async () => {
    const factory = component(
      "hello-world",
      `<div>Hello {name}!</div>`,
      () => ({ name: "Bun" })
    );

    const { mount } = await factory();
    mount(document.body);

    const html = document.body.innerHTML;
    expect(html).toContain("Hello Bun!");
  });

  test("should bind state and update DOM on change", async () => {
    const factory = component(
      "counter-button",
      `<button>{count}</button>`,
      () => ({ count: 0 })
    );

    const { root, mount, state } = await factory();
    mount(document.body);

    const btn = root.querySelector("button")!;
    expect(btn.textContent).toBe("0");

    state.count = 42;
    expect(btn.textContent).toBe("42");
  });

  test("should apply styles only once per component", async () => {
    const factory = component(
      "styled-component",
      `<p>Styled</p>`,
      () => ({}),
      `:host { color: red; }`
    );

    await factory();
    await factory();

    const styleTags = document.head.querySelectorAll("style");
    expect(styleTags.length).toBe(1);
    expect(styleTags[0].textContent).toContain("styled-component");
  });

  test("should support event binding", async () => {
    let clicked = false;

    const factory = component(
      "clickable",
      `<button on:click="clicked = true">Click me</button>`,
      () => ({ clicked })
    );

    const { root, mount, state } = await factory();
    mount(document.body);

    const btn = root.querySelector("button")!;
    btn.click();

    expect(state.clicked).toBe(true);
  });

  test("should support inputs", async () => {
    const factory = component(
    "counter",
    `<div>Count: {count}</div>`,
    (input?: { count: number }) => ({ count: input?.count ?? 0 })
    );

    const { root, mount } = await factory({ count: 10 });
    mount(document.body);

    const div = root.querySelector("div")!;
    expect(div.textContent).toBe("Count: 10");

  });
});

describe("for", () => {
    const factory = component(
        "list",
        `<ul>
            <li for="item in items">{item}</li>
        </ul>`,
        (input?: { items: string[] }) => ({ items: input?.items ?? [] })
    );

    test("should render initial array items", async () => {
        const { root, mount } = await factory({ items: ["A", "B", "C"] });
        mount(document.body);

        const lis = root.querySelectorAll("li");
        expect(lis.length).toBe(3);
        expect(lis[0].textContent).toBe("A");
        expect(lis[1].textContent).toBe("B");
        expect(lis[2].textContent).toBe("C");
    });

    test("should update DOM when array changes", async () => {
        const { root, mount, state } = await factory({ items: ["X", "Y"] });
        mount(document.body);

        let lis = root.querySelectorAll("li");
        expect(lis.length).toBe(2);
        expect(lis[0].textContent).toBe("X");

        // Add a new item
        state.items.push("Z");

        lis = root.querySelectorAll("li");
        expect(lis.length).toBe(3);
        expect(lis[2].textContent).toBe("Z");

        // Remove an item
        state.items.shift();

        lis = root.querySelectorAll("li");
        expect(lis.length).toBe(2);
        expect(lis[0].textContent).toBe("Y");
    });

    /*
    test("should update text when array item changes", async () => {
        const { root, mount, state } = await factory({ items: ["foo", "bar"] });
        mount(document.body);

        const lis = root.querySelectorAll("li");
        expect(lis[0].textContent).toBe("foo");

        state.items[0] = "baz"; // update the first item
        expect(lis[0].textContent).toBe("baz");
    });
    */

});

describe("if", () => {

    const factory = component(
        "if",
        `<p if="{show}">Visible</p>`,
        () => ({ show: true })
    );

    test("should render element when condition is true", async () => {
        const { root, mount } = await factory();
        mount(document.body);

        const p = root.querySelector("p");
        expect(p).not.toBeNull();
        expect(p!.textContent).toBe("Visible");
    });

    test("should not render element when condition is false", async () => {
        const { root, mount, state } = await factory();
        mount(document.body);

        let p = root.querySelector("p");
        expect(p).not.toBeNull();

        state.show = false;
        p = root.querySelector("p");
        expect(p).toBeNull();

        state.show = true;
        p = root.querySelector("p");
        expect(p).not.toBeNull();
        expect(p!.textContent).toBe("Visible");
    });
});

describe("show", () => {

    const factory = component(
    "show",
    `<div show="{visible}">Hello</div>`,
    () => ({ visible: true })
    );

    test("should show element when condition is true", async () => {
        const { root, mount } = await factory();
        mount(document.body);

        const div = root.querySelector("div")!;
        expect(div.style.display).toBe("");
    });

    test("should hide element when condition is false", async () => {
        const { root, mount, state } = await factory();
        mount(document.body);

        const div = root.querySelector("div")!;
        expect(div.style.display).toBe("");

        state.visible = false;
        expect(div.style.display).toBe("none");

        state.visible = true;
        expect(div.style.display).toBe("");
    });
});

describe("bind", () => {

    const factory = component(
        "bind-input",
        `<input bind="name" />`,
        () => ({ name: "Alice" })
    );

    test("state updates input value", async () => {
        const { root, mount, state } = await factory();
        mount(document.body);

        const input = root.querySelector("input")!;
        expect(input.value).toBe("Alice");

        state.name = "Bob";
        expect(input.value).toBe("Bob");
    });

    test("input updates state", async () => {
        const { root, mount, state } = await factory();
        mount(document.body);

        const input = root.querySelector("input")!;
        expect(state.name).toBe("Alice");

        // Simulate user typing
        input.value = "Charlie";
        const event = new Event("input", { bubbles: true });
        Object.defineProperty(event, 'target', { value: input, writable: false });
        input.dispatchEvent(event);

        expect(state.name).toBe("Charlie");
    });

    test("checkbox binding works", async () => {
        const factory = component(
        "bind-checkbox",
        `<input type="checkbox" bind="checked" />`,
        () => ({ checked: true })
        );

        const { root, mount, state } = await factory();
        mount(document.body);

        const checkbox = root.querySelector("input")!;
        expect(checkbox.checked).toBe(true);

        state.checked = false;
        expect(checkbox.checked).toBe(false);

        checkbox.checked = true;
        const event = new Event("input", { bubbles: true });
        Object.defineProperty(event, 'target', { value: checkbox, writable: false });
        checkbox.dispatchEvent(event);

        expect(state.checked).toBe(true);
    });

    test("select binding works", async () => {
        const factory = component(
        "bind-select",
        `<select bind="color">
            <option value="red">Red</option>
            <option value="blue">Blue</option>
        </select>`,
        () => ({ color: "blue" })
        );

        const { root, mount, state } = await factory();
        mount(document.body);

        const select = root.querySelector("select")!;
        expect(select.value).toBe("blue");

        state.color = "red";
        expect(select.value).toBe("red");

        select.value = "blue";

        const event = new Event("input", { bubbles: true });
        Object.defineProperty(event, 'target', { value: select, writable: false });
        select.dispatchEvent(event);

        expect(state.color).toBe("blue");
    });

    test("textarea binding works", async () => {
        const factory = component(
        "bind-textarea",
        `<textarea bind="message"></textarea>`,
        () => ({ message: "Hello World" })
        );

        const { root, mount, state } = await factory();
        mount(document.body);

        const textarea = root.querySelector("textarea")!;
        expect(textarea.value).toBe("Hello World");

        state.message = "Updated message";

        expect(textarea.value).toBe("Updated message");

        textarea.value = "User typed";
        const event = new Event("input", { bubbles: true });
        Object.defineProperty(event, 'target', { value: textarea, writable: false });
        textarea.dispatchEvent(event);

        expect(textarea.value).toBe("User typed");
    });
});