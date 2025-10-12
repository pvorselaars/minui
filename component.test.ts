import { describe, expect, test, beforeEach } from "bun:test";
import { component } from "./component";
import { Window } from "happy-dom";

async function nextTick() {
  await Promise.resolve();
}

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
  const factory = component(
    "hello-world",
    `Hello {name}!`,
    () => ({ name: "Bun" })
  );

  test("should register and render a basic component", async () => {
    const { mount } = factory();
    mount(document.body);

    const html = document.body.innerHTML;
    expect(html).toBe("<hello-world>Hello Bun!</hello-world>");
  });

  test("should render subcomponents", async () => {
    const factory = component(
      "hello-subcomponent",
      `<hello-world></hello-world><hello-world></hello-world>`,
      () => ({ name: "Bun" })
    );

    const { mount } = factory();
    mount(document.body);

    const html = document.body.innerHTML;
    expect(html).toBe("<hello-subcomponent><hello-world>Hello Bun!</hello-world><hello-world>Hello Bun!</hello-world></hello-subcomponent>");
  });

  test("should bind state and update DOM on change", async () => {
    const factory = component(
      "counter-button",
      `<button>{count}</button>`,
      () => ({ count: 0 })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const btn = root.querySelector("button")!;
    expect(btn.textContent).toBe("0");

    state.count = 42;
    await nextTick();
    expect(btn.textContent).toBe("42");
  });

  test("should apply styles only once per component", async () => {
    const factory = component(
      "styled-component",
      `<p>Styled</p>`,
      () => ({}),
      `
      :host { 
        color: red; 
      }
      h,
      p {
        color: blue;
      }
      `
    );

    factory();
    factory();

    const styleTags = document.head.querySelectorAll("style");
    expect(styleTags.length).toBe(1);
    expect(styleTags[0].textContent).toBe(
      `
      styled-component { 
        color: red; 
      }
      styled-component h,
      styled-component p {
        color: blue;
      }
      `);
  });

  test("should support event binding", async () => {
    let clicked = false;

    const factory = component(
      "clickable",
      `<button on:click="clicked = true">Click me</button>`,
      () => ({ clicked })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const btn = root.querySelector("button")!;
    btn.click();

    await nextTick();
    expect(state.clicked).toBe(true);
  });

  test("should support inputs", async () => {
    const factory = component(
      "counter",
      `<div>Count: {count}</div>`,
      (input?: { count: number }) => ({ count: input?.count ?? 0 })
    );

    let { root, mount } = factory({ count: 10 });
    mount(document.body);

    const div = root.querySelector("div")!;
    expect(div.textContent).toBe("Count: 10");
  });

  test("should pass inputs to sub component", async () => {
    const child = component(
      "child-comp",
      `<p>Child count: {count}</p>`,
      (input?: { count: number }) => ({
        count: input?.count ?? 0
      })
    );

    const parent = component(
      "parent-comp",
      `<div>
        <child-comp count={count}></child-comp>
      </div>`,
      () => ({
        count: 5
      })
    );

    const { root, mount, state } = parent();
    mount(document.body);

    const p = root.querySelector("child-comp p")!;
    expect(p.textContent).toBe("Child count: 5");

    state.count = 15;
    await nextTick();
    expect(p.textContent).toBe("Child count: 15");
  });

  test("should cleanup on unmount", async () => {
    const factory = component(
      "cleanup-test",
      `<button on:click="count++">Count: {count}</button>`,
      () => ({ count: 0 })
    );

    const { mount, unmount, state } = factory();
    mount(document.body);

    expect(document.body.innerHTML).toContain("Count: 0");

    state.count = 5;
    await nextTick();
    expect(document.body.innerHTML).toContain("Count: 5");

    unmount();
    expect(document.body.innerHTML).toBe("");
  });

  test("should call mounted lifecycle", async () => {
    let mountedCalled = false;

    const factory = component(
      "lifecycle-test",
      `<div>Test</div>`,
      () => ({
        mounted() {
          mountedCalled = true;
        }
      })
    );

    const { mount } = factory();
    mount(document.body);

    expect(mountedCalled).toBe(true);
  });

  test("should call unmounted lifecycle", async () => {
    let unmountedCalled = false;

    const factory = component(
      "lifecycle-unmount",
      `<div>Test</div>`,
      () => ({
        unmounted() {
          unmountedCalled = true;
        }
      })
    );

    const { mount, unmount } = factory();
    mount(document.body);
    unmount();

    expect(unmountedCalled).toBe(true);
  });

  test("should emit custom events", async () => {
    const factory = component(
      "emitter",
      `<button on:click="emit('custom', { value: 42 })">Emit</button>`,
      () => ({})
    );

    const { root, mount } = factory();
    mount(document.body);

    let eventData: any = null;
    root.addEventListener('custom', ((e: CustomEvent) => {
      eventData = e.detail;
    }) as EventListener);

    const btn = root.querySelector("button")!;
    btn.click();

    await nextTick();
    expect(eventData).toEqual({ value: 42 });
  });

  test("should handle multiple state changes in batch", async () => {
    const factory = component(
      "batch-test",
      `<div>{a} {b} {c}</div>`,
      () => ({ a: 1, b: 2, c: 3 })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const div = root.querySelector("div")!;
    expect(div.textContent).toBe("1 2 3");

    // Multiple changes should batch into single update
    state.a = 10;
    state.b = 20;
    state.c = 30;

    await nextTick();
    expect(div.textContent).toBe("10 20 30");
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
    const { root, mount } = factory({ items: ["A", "B", "C"] });
    mount(document.body);

    const lis = root.querySelectorAll("li");
    expect(lis.length).toBe(3);
    expect(lis[0].textContent).toBe("A");
    expect(lis[1].textContent).toBe("B");
    expect(lis[2].textContent).toBe("C");
  });

  test("should update DOM when array changes", async () => {
    const { root, mount, state } = factory({ items: ["X", "Y"] });
    mount(document.body);

    let lis = root.querySelectorAll("li");
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe("X");

    // Add a new item
    state.items.push("Z");
    await nextTick();

    lis = root.querySelectorAll("li");
    expect(lis.length).toBe(3);
    expect(lis[2].textContent).toBe("Z");

    // Remove an item
    state.items.shift();
    await nextTick();

    lis = root.querySelectorAll("li");
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe("Y");
  });

  test("should handle empty arrays", async () => {
    const { root, mount, state } = factory({ items: [] });
    mount(document.body);

    let lis = root.querySelectorAll("li");
    expect(lis.length).toBe(0);

    state.items.push("First");
    await nextTick();

    lis = root.querySelectorAll("li");
    expect(lis.length).toBe(1);
    expect(lis[0].textContent).toBe("First");
  });

  test("should support index variable", async () => {
    const factory = component(
      "indexed-list",
      `<ul>
        <li for="item, i in items">{i}: {item}</li>
      </ul>`,
      () => ({ items: ["A", "B", "C"] })
    );

    const { root, mount } = factory();
    mount(document.body);

    const lis = root.querySelectorAll("li");
    expect(lis.length).toBe(3);
    expect(lis[0].textContent).toBe("0: A");
    expect(lis[1].textContent).toBe("1: B");
    expect(lis[2].textContent).toBe("2: C");
  });

  test('for-loop elements support event binding', async () => {
    const factory = component(
      'for-event',
      `<ul><li for="item, i in items" on:click="last = item">{item}</li></ul>`,
      () => ({ items: ['A', 'B', 'C'], last: null as string | null })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const lis = root.querySelectorAll('li');
    const second = lis[1] as HTMLLIElement;
    second.click();

    await nextTick();
    expect(state.last).toBe('B');
  });

  test('for-loop supports select(i) with selected-by', async () => {
    const factory = component(
      'for-select',
      `<div class=results>
        <div selected-by=selected on:click="select(i)" for="item, i in items">{item}</div>
      </div>`,
      () => ({
        items: ['A','B','C'],
        selected: -1,
        select(i: number) { this.selected = i }
      })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const divs = root.querySelectorAll('.results > div');
    expect(divs[0].className).toBe('');

    // call the method directly
    state.select(1);
    await nextTick();
    expect(divs[1].className).toBe('selected');

    // click the third
    const evt = new Event('click', { bubbles: true });
    Object.defineProperty(evt, 'target', { value: divs[2], writable: false });
    (divs[2] as HTMLElement).dispatchEvent(evt);
    await nextTick();
    expect(divs[2].className).toBe('selected');
  });

  test("should handle nested loops", async () => {
    const factory = component(
      "nested-loops",
      `<div for="group in groups">
        <span for="item in group">{item}</span>
      </div>`,
      () => ({ groups: [["a", "b"], ["c", "d"]] })
    );

    const { root, mount } = factory();
    mount(document.body);

    const divs = root.querySelectorAll("div");
    expect(divs.length).toBe(2);
    
    const spans = root.querySelectorAll("span");
    expect(spans.length).toBe(4);
    expect(spans[0].textContent).toBe("a");
    expect(spans[1].textContent).toBe("b");
    expect(spans[2].textContent).toBe("c");
    expect(spans[3].textContent).toBe("d");
  });
});

describe("if", () => {
  const factory = component(
    "if",
    `<p if=show>Visible</p>`,
    () => ({ show: true })
  );

  test("should render element when condition is true", async () => {
    const { root, mount } = factory();
    mount(document.body);

    const p = root.querySelector("p");
    expect(p).not.toBeNull();
    expect(p!.textContent).toBe("Visible");
  });

  test("should not render element when condition is false", async () => {
    const { root, mount, state } = factory();
    mount(document.body);

    let p = root.querySelector("p");
    expect(p).not.toBeNull();

    state.show = false;
    await nextTick();
    p = root.querySelector("p");
    expect(p).toBeNull();

    state.show = true;
    await nextTick();
    p = root.querySelector("p");
    expect(p).not.toBeNull();
    expect(p!.textContent).toBe("Visible");
  });

  test("should handle complex conditions", async () => {
    const factory = component(
      "complex-if",
      `<div if="count > 5 && active">Show me</div>`,
      () => ({ count: 10, active: true })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    let div = root.querySelector("div");
    expect(div).not.toBeNull();

    state.count = 3;
    await nextTick();
    div = root.querySelector("div");
    expect(div).toBeNull();

    state.count = 10;
    state.active = false;
    await nextTick();
    div = root.querySelector("div");
    expect(div).toBeNull();
  });
});

describe("show", () => {
  const factory = component(
    "show",
    `<div show=visible>Hello</div>`,
    () => ({ visible: true })
  );

  test("should show element when condition is true", async () => {
    const { root, mount } = factory();
    mount(document.body);

    const div = root.querySelector("div")!;
    expect(div.style.display).toBe("");
  });

  test("should hide element when condition is false", async () => {
    const { root, mount, state } = factory();
    mount(document.body);

    const div = root.querySelector("div")!;
    expect(div.style.display).toBe("");

    state.visible = false;
    await nextTick();
    expect(div.style.display).toBe("none");

    state.visible = true;
    await nextTick();
    expect(div.style.display).toBe("");
  });

  test("should preserve original display value", async () => {
    const factory = component(
      "show-display",
      `<div show=visible style="display: flex;">Flex</div>`,
      () => ({ visible: true })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const div = root.querySelector("div")!;
    expect(div.style.display).toBe("flex");

    state.visible = false;
    await nextTick();
    expect(div.style.display).toBe("none");

    state.visible = true;
    await nextTick();
    expect(div.style.display).toBe("flex");
  });
});

describe("bind", () => {
  const factory = component(
    "bind-input",
    `<input bind="name" />`,
    () => ({ name: "Alice" })
  );

  test("state updates input value", async () => {
    const { root, mount, state } = factory();
    mount(document.body);

    const input = root.querySelector("input")!;
    expect(input.value).toBe("Alice");

    state.name = "Bob";
    await nextTick();
    expect(input.value).toBe("Bob");
  });

  test("input updates state", async () => {
    const { root, mount, state } = factory();
    mount(document.body);

    const input = root.querySelector("input")!;
    expect(state.name).toBe("Alice");

    // Simulate user typing
    input.value = "Charlie";
    const event = new Event("input", { bubbles: true });
    Object.defineProperty(event, 'target', { value: input, writable: false });
    input.dispatchEvent(event);

    await nextTick();
    expect(state.name).toBe("Charlie");
  });

  test("checkbox binding works", async () => {
    const factory = component(
      "bind-checkbox",
      `<input type="checkbox" bind="checked" />`,
      () => ({ checked: true })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const checkbox = root.querySelector("input")!;
    expect(checkbox.checked).toBe(true);

    state.checked = false;
    await nextTick();
    expect(checkbox.checked).toBe(false);

    checkbox.checked = true;
    const event = new Event("input", { bubbles: true });
    Object.defineProperty(event, 'target', { value: checkbox, writable: false });
    checkbox.dispatchEvent(event);

    await nextTick();
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

    const { root, mount, state } = factory();
    mount(document.body);

    const select = root.querySelector("select")!;
    expect(select.value).toBe("blue");

    state.color = "red";
    await nextTick();
    expect(select.value).toBe("red");

    select.value = "blue";
    const event = new Event("input", { bubbles: true });
    Object.defineProperty(event, 'target', { value: select, writable: false });
    select.dispatchEvent(event);

    await nextTick();
    expect(state.color).toBe("blue");
  });

  test("textarea binding works", async () => {
    const factory = component(
      "bind-textarea",
      `<textarea bind="message"></textarea>`,
      () => ({ message: "Hello World" })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const textarea = root.querySelector("textarea")!;
    expect(textarea.value).toBe("Hello World");

    state.message = "Updated message";
    await nextTick();
    expect(textarea.value).toBe("Updated message");

    textarea.value = "User typed";
    const event = new Event("input", { bubbles: true });
    Object.defineProperty(event, 'target', { value: textarea, writable: false });
    textarea.dispatchEvent(event);

    await nextTick();
    expect(state.message).toBe("User typed");
  });

  test("deep binding works", async () => {
    const factory = component(
      "bind-deep",
      `<input type=text bind=obj.prop.prop />`,
      () => ({ obj: { prop: { prop: "value" }} })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const input = root.querySelector("input")!;
    expect(input.value).toBe("value");

    input.value = "new value"
    const event = new Event("input", { bubbles: true });
    Object.defineProperty(event, 'target', { value: input, writable: false });
    input.dispatchEvent(event);

    await nextTick();
    expect(state.obj.prop.prop).toBe("new value");
  });

  test("radio button binding works", async () => {
    const factory = component(
      "bind-radio",
      `<div>
        <input type="radio" bind="color" value="red" />
        <input type="radio" bind="color" value="blue" />
      </div>`,
      () => ({ color: "red" })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const radios = root.querySelectorAll("input");
    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);

    state.color = "blue";
    await nextTick();
    expect(radios[0].checked).toBe(false);
    expect(radios[1].checked).toBe(true);
  });
});

describe("attribute binding", () => {
  const factory = component(
    "btn",
    `<button disabled=disabled>Click!</button>`,
    () => ({ disabled: true })
  );

  test("should evaluate expression for attribute", async () => {
    const { root, mount } = factory();
    mount(document.body);

    const btn = root.querySelector("button")!;
    expect(btn.disabled).toBe(true);
  });

  test("state change should update attribute", async () => {
    const { root, mount, state } = factory();
    mount(document.body);

    const btn = root.querySelector("button")!;
    expect(btn.disabled).toBe(true);

    state.disabled = false;
    await nextTick();
    expect(btn.disabled).toBe(false);
  });

  test("should handle dynamic class attributes", async () => {
    const factory = component(
      "dynamic-class",
      `<div class="active ? 'on' : 'off'">Status</div>`,
      () => ({ active: false })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const div = root.querySelector("div")!;
    expect(div.className).toBe("off");

    state.active = true;
    await nextTick();
    expect(div.className).toBe("on");
  });

  test("should handle data attributes", async () => {
    const factory = component(
      "data-attrs",
      `<div data-id=id>Item</div>`,
      () => ({ id: 123 })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const div = root.querySelector("div")!;
    expect(div.getAttribute("data-id")).toBe("123");

    state.id = 456;
    await nextTick();
    expect(div.getAttribute("data-id")).toBe("456");
  });
});

describe("subcomponent array propagation", () => {
  test("should pass array to subcomponent", async () => {
    const childFactory = component(
      "item-list",
      `<ul><li for="item in items">{item}</li></ul>`,
      (input?: { items: string[] }) => ({ items: input?.items ?? [] })
    );

    const parentFactory = component(
      "parent-list",
      `<item-list items={myItems}></item-list>`,
      () => ({ myItems: ["A", "B", "C"] })
    );

    const { mount } = parentFactory();
    mount(document.body);

    const lis = document.querySelectorAll("li");
    expect(lis.length).toBe(3);
    expect(lis[0].textContent).toBe("A");
    expect(lis[1].textContent).toBe("B");
    expect(lis[2].textContent).toBe("C");
  });

  test("should update subcomponent when parent array changes (push)", async () => {
    const childFactory = component(
      "child-list",
      `<ul><li for="item in items">{item}</li></ul>`,
      (input?: { items: string[] }) => ({ items: input?.items ?? [] })
    );

    const parentFactory = component(
      "parent-container",
      `<child-list items={data}></child-list>`,
      () => ({ data: ["X", "Y"] })
    );

    const { mount, state } = parentFactory();
    mount(document.body);

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe("X");
    expect(lis[1].textContent).toBe("Y");

    state.data.push("Z");
    await nextTick();

    lis = document.querySelectorAll("li");
    expect(lis.length).toBe(3);
    expect(lis[2].textContent).toBe("Z");
  });

  test("should update subcomponent when parent array changes (pop)", async () => {
    const childFactory = component(
      "child-list2",
      `<ul><li for="item in items">{item}</li></ul>`,
      (input?: { items: string[] }) => ({ items: input?.items ?? [] })
    );

    const parentFactory = component(
      "parent-container2",
      `<child-list2 items={data}></child-list2>`,
      () => ({ data: ["A", "B", "C"] })
    );

    const { mount, state } = parentFactory();
    mount(document.body);

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(3);

    state.data.pop();
    await nextTick();

    lis = document.querySelectorAll("li");
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe("A");
    expect(lis[1].textContent).toBe("B");
  });

  test("should update subcomponent when parent array changes (shift)", async () => {
    const childFactory = component(
      "child-list3",
      `<ul><li for="item in items">{item}</li></ul>`,
      (input?: { items: string[] }) => ({ items: input?.items ?? [] })
    );

    const parentFactory = component(
      "parent-container3",
      `<child-list3 items={data}></child-list3>`,
      () => ({ data: ["First", "Second", "Third"] })
    );

    const { mount, state } = parentFactory();
    mount(document.body);

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(3);
    expect(lis[0].textContent).toBe("First");

    state.data.shift();
    await nextTick();

    lis = document.querySelectorAll("li");
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe("Second");
    expect(lis[1].textContent).toBe("Third");
  });

  test("should update subcomponent when parent array is replaced", async () => {
    const childFactory = component(
      "child-list4",
      `<ul><li for="item in items">{item}</li></ul>`,
      (input?: { items: string[] }) => ({ items: input?.items ?? [] })
    );

    const parentFactory = component(
      "parent-container4",
      `<child-list4 items={data}></child-list4>`,
      () => ({ data: ["Old1", "Old2"] })
    );

    const { mount, state } = parentFactory();
    mount(document.body);

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe("Old1");

    state.data = ["New1", "New2", "New3"];
    await nextTick();

    lis = document.querySelectorAll("li");
    expect(lis.length).toBe(3);
    expect(lis[0].textContent).toBe("New1");
    expect(lis[1].textContent).toBe("New2");
    expect(lis[2].textContent).toBe("New3");
  });

  test("should propagate array of objects to subcomponent", async () => {
    const childFactory = component(
      "user-list",
      `<ul><li for="user in users">{user.name} - {user.age}</li></ul>`,
      (input?: { users: Array<{name: string, age: number}> }) => ({ 
        users: input?.users ?? [] 
      })
    );

    const parentFactory = component(
      "user-container",
      `<user-list users={people}></user-list>`,
      () => ({ 
        people: [
          { name: "Alice", age: 30 },
          { name: "Bob", age: 25 }
        ]
      })
    );

    const { mount, state } = parentFactory();
    mount(document.body);

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe("Alice - 30");
    expect(lis[1].textContent).toBe("Bob - 25");

    state.people.push({ name: "Charlie", age: 35 });
    await nextTick();

    lis = document.querySelectorAll("li");
    expect(lis.length).toBe(3);
    expect(lis[2].textContent).toBe("Charlie - 35");
  });

  test("should handle multiple subcomponents with different arrays", async () => {
    const listFactory = component(
      "simple-list",
      `<ul><li for="item in items">{item}</li></ul>`,
      (input?: { items: string[] }) => ({ items: input?.items ?? [] })
    );

    const parentFactory = component(
      "multi-list",
      `<div>
        <simple-list items={fruits}></simple-list>
        <simple-list items={vegetables}></simple-list>
      </div>`,
      () => ({ 
        fruits: ["Apple", "Banana"],
        vegetables: ["Carrot", "Broccoli"]
      })
    );

    const { mount, state } = parentFactory();
    mount(document.body);

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(4);
    expect(lis[0].textContent).toBe("Apple");
    expect(lis[1].textContent).toBe("Banana");
    expect(lis[2].textContent).toBe("Carrot");
    expect(lis[3].textContent).toBe("Broccoli");

    state.fruits.push("Orange");
    await nextTick();

    lis = document.querySelectorAll("li");
    expect(lis.length).toBe(5);
    expect(lis[2].textContent).toBe("Orange");

    state.vegetables.shift();
    await nextTick();

    lis = document.querySelectorAll("li");
    expect(lis.length).toBe(4);
  });

  test("should work with nested subcomponents and arrays", async () => {
    const innerListFactory = component(
      "inner-list-comp",
      `<ul><li for="item in items">{item}</li></ul>`,
      (input?: { items: string[] }) => ({ items: input?.items ?? [] })
    );

    const middleFactory = component(
      "middle-wrapper-comp",
      `<div><inner-list-comp items={data}></inner-list-comp></div>`,
      (input?: { data: string[] }) => ({ data: input?.data ?? [] })
    );

    const parentFactory = component(
      "nested-parent-comp",
      `<middle-wrapper-comp data={myItems}></middle-wrapper-comp>`,
      () => ({ myItems: ["One", "Two"] })
    );

    const { mount, state } = parentFactory();
    mount(document.body);

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe("One");
    expect(lis[1].textContent).toBe("Two");

    state.myItems.push("Three");
    await nextTick();

    lis = document.querySelectorAll("li");
    expect(lis.length).toBe(3);
    expect(lis[2].textContent).toBe("Three");
  });

  test("should handle empty arrays", async () => {
    const childFactory = component(
      "empty-list",
      `<ul><li for="item in items">{item}</li></ul>`,
      (input?: { items: string[] }) => ({ items: input?.items ?? [] })
    );

    const parentFactory = component(
      "empty-parent",
      `<empty-list items={data}></empty-list>`,
      () => ({ data: [] as string[] })
    );

    const { mount, state } = parentFactory();
    mount(document.body);

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(0);

    state.data.push("First");
    state.data.push("Second");
    await nextTick();

    lis = document.querySelectorAll("li");
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe("First");
    expect(lis[1].textContent).toBe("Second");
  });

  test("should update subcomponent when using splice", async () => {
    const childFactory = component(
      "splice-list",
      `<ul><li for="item in items">{item}</li></ul>`,
      (input?: { items: string[] }) => ({ items: input?.items ?? [] })
    );

    const parentFactory = component(
      "splice-parent",
      `<splice-list items={data}></splice-list>`,
      () => ({ data: ["A", "B", "C", "D"] })
    );

    const { mount, state } = parentFactory();
    mount(document.body);

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(4);

    state.data.splice(1, 2);
    await nextTick();

    lis = document.querySelectorAll("li");
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe("A");
    expect(lis[1].textContent).toBe("D");
  });

  test("should handle subcomponent with non-array props alongside arrays", async () => {
    const childFactory = component(
      "mixed-props",
      `<div>
        <h3>{title}</h3>
        <ul><li for="item in items">{item}</li></ul>
      </div>`,
      (input?: { title: string, items: string[] }) => ({ 
        title: input?.title ?? "",
        items: input?.items ?? [] 
      })
    );

    const parentFactory = component(
      "mixed-parent",
      `<mixed-props title={heading} items={list}></mixed-props>`,
      () => ({ 
        heading: "My List",
        list: ["Item1", "Item2"]
      })
    );

    const { mount, state } = parentFactory();
    mount(document.body);

    const h3 = document.querySelector("h3");
    expect(h3?.textContent).toBe("My List");

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(2);

    state.heading = "Updated List";
    state.list.push("Item3");
    await nextTick();

    expect(h3?.textContent).toBe("Updated List");
    lis = document.querySelectorAll("li");
    expect(lis.length).toBe(3);
    expect(lis[2].textContent).toBe("Item3");
  });

  test("should update child when parent uses derived state from input", async () => {
    const childFactory = component(
      "derived-list",
      `<ul><li for="item in items">{item}</li></ul>`,
      (input?: { items: string[] }) => ({ 
        items: input?.items ?? [] 
      })
    );

    const parentFactory = component(
      "derived-parent",
      `<derived-list items={items}></derived-list>`,
      (input?: { items: string[] }) => ({ 
        items: input?.items ?? []
      })
    );

    const { mount, state } = parentFactory({ items: ["A", "B"] });
    mount(document.body);

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe("A");

    state.items = ["X", "Y", "Z"];
    await nextTick();

    lis = document.querySelectorAll("li");
    expect(lis.length).toBe(3);
    expect(lis[0].textContent).toBe("X");
    expect(lis[1].textContent).toBe("Y");
    expect(lis[2].textContent).toBe("Z");
  });
});

describe("computed properties", () => {
  test("should support getter as computed property", async () => {
    const factory = component(
      "computed-test",
      `<div>{doubled}</div>`,
      () => ({
        count: 5,
        get doubled() {
          return this.count * 2;
        }
      })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const div = root.querySelector("div")!;
    expect(div.textContent).toBe("10");

    state.count = 10;
    await nextTick();
    expect(div.textContent).toBe("20");
  });

  test("should support computed property in for loop", async () => {
    const factory = component(
      "computed-filter",
      `
        <input bind="query" />
        <ul><li for="item in filtered">{item}</li></ul>
      `,
      () => ({
        items: ["Apple", "Banana", "Cherry"],
        query: "",
        get filtered() {
          return this.query 
            ? this.items.filter((item: string) => item.toLowerCase().includes(this.query.toLowerCase()))
            : this.items;
        }
      })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    let lis = root.querySelectorAll("li");
    expect(lis.length).toBe(3);

    state.query = "a";
    await nextTick();
    lis = root.querySelectorAll("li");
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe("Apple");
    expect(lis[1].textContent).toBe("Banana");

    state.query = "";
    await nextTick();
    lis = root.querySelectorAll("li");
    expect(lis.length).toBe(3);
  });

  test("should update computed when dependent array changes", async () => {
    const factory = component(
      "computed-array-dep",
      `<div>{count}</div>`,
      () => ({
        items: [1, 2, 3],
        get count() {
          return this.items.length;
        }
      })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const div = root.querySelector("div")!;
    expect(div.textContent).toBe("3");

    state.items.push(4);
    await nextTick();
    expect(div.textContent).toBe("4");

    state.items = [1, 2];
    await nextTick();
    expect(div.textContent).toBe("2");
  });

  test("should handle chained computed properties", async () => {
    const factory = component(
      "chained-computed",
      `<div>{quadrupled}</div>`,
      () => ({
        count: 5,
        get doubled() {
          return this.count * 2;
        },
        get quadrupled() {
          return this.doubled * 2;
        }
      })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const div = root.querySelector("div")!;
    expect(div.textContent).toBe("20");

    state.count = 3;
    await nextTick();
    expect(div.textContent).toBe("12");
  });

  test("should support multiple computed properties", async () => {
    const factory = component(
      "multi-computed",
      `<div>{sum} {product}</div>`,
      () => ({
        a: 2,
        b: 3,
        get sum() {
          return this.a + this.b;
        },
        get product() {
          return this.a * this.b;
        }
      })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const div = root.querySelector("div")!;
    expect(div.textContent).toBe("5 6");

    state.a = 4;
    await nextTick();
    expect(div.textContent).toBe("7 12");
  });
});

describe('attribute bindings with loopContext', () => {
  test('updates class attribute based on loop variable', async () => {
    const factory = component(
      'loop-test',
      `<div for="item in items" class="id === item.id ? 'selected' : ''">Item</div>`,
      () => ({ items: [{ id: 0 }, { id: 1 }], id: 0 })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const divs = root.querySelectorAll('div');
    expect(divs[0].className).toBe('selected');
    expect(divs[1].className).toBe('');

    state.id = 1;
    await nextTick();
    expect(divs[0].className).toBe('');
    expect(divs[1].className).toBe('selected');
  });

  test('tracks state variables outside loops correctly', async () => {
    const factory = component(
      'state-test',
      `<div class="active ? 'on' : 'off'">Status</div>`,
      () => ({ active: false })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const div = root.querySelector('div')!;
    expect(div.className).toBe('off');

    state.active = true;
    await nextTick();
    expect(div.className).toBe('on');

    state.active = false;
    await nextTick();
    expect(div.className).toBe('off');
  });

  test('selected-by optimization toggles selected class efficiently', async () => {
    const factory = component(
      'select-opt',
      `<ul><li for="item, i in items" selected-by="selected">{item}</li></ul>`,
      () => ({ items: ['One', 'Two', 'Three'], selected: 0 })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const lis = root.querySelectorAll('li');
    expect(lis[0].className).toBe('selected');
    expect(lis[1].className).toBe('');
    expect(lis[2].className).toBe('');

    // Change selection and ensure classes update
    state.selected = 2;
    await nextTick();

    expect(lis[0].className).toBe('');
    expect(lis[1].className).toBe('');
    expect(lis[2].className).toBe('selected');
  });
});

describe("edge cases and error handling", () => {
  test("should handle undefined values in text interpolation", async () => {
    const factory = component(
      "undefined-test",
      `<div>{value}</div>`,
      () => ({ value: undefined as string | undefined })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const div = root.querySelector("div")!;
    expect(div.textContent).toBe("");

    state.value = "defined";
    await nextTick();
    expect(div.textContent).toBe("defined");
  });

  test("should handle null values", async () => {
    const factory = component(
      "null-test",
      `<div>{value}</div>`,
      () => ({ value: null as string | null })
    );

    const { root, mount } = factory();
    mount(document.body);

    const div = root.querySelector("div")!;
    expect(div.textContent).toBe("");
  });

  test("should handle nested object updates", async () => {
    const factory = component(
      "nested-test",
      `<div>{user.name} - {user.age}</div>`,
      () => ({ user: { name: "Alice", age: 30 } })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const div = root.querySelector("div")!;
    expect(div.textContent).toBe("Alice - 30");

    state.user.name = "Bob";
    await nextTick();
    expect(div.textContent).toBe("Bob - 30");

    state.user = { name: "Charlie", age: 25 };
    await nextTick();
    expect(div.textContent).toBe("Charlie - 25");
  });

  test("should handle rapid successive updates", async () => {
    const factory = component(
      "rapid-test",
      `<div>{count}</div>`,
      () => ({ count: 0 })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    const div = root.querySelector("div")!;

    // Rapid updates should batch
    for (let i = 1; i <= 100; i++) {
      state.count = i;
    }

    await nextTick();
    expect(div.textContent).toBe("100");
  });

  test("should handle array sort and reverse", async () => {
    const factory = component(
      "sort-test",
      `<ul><li for="item in items">{item}</li></ul>`,
      () => ({ items: [3, 1, 2] })
    );

    const { root, mount, state } = factory();
    mount(document.body);

    let lis = root.querySelectorAll("li");
    expect(lis[0].textContent).toBe("3");

    state.items.sort();
    await nextTick();

    lis = root.querySelectorAll("li");
    expect(lis[0].textContent).toBe("1");
    expect(lis[1].textContent).toBe("2");
    expect(lis[2].textContent).toBe("3");

    state.items.reverse();
    await nextTick();

    lis = root.querySelectorAll("li");
    expect(lis[0].textContent).toBe("3");
    expect(lis[1].textContent).toBe("2");
    expect(lis[2].textContent).toBe("1");
  });
});

test('parent listens to child component events via on:custom attribute', async () => {
  const child = component(
    'event-child',
    `<button on:click="emit('child-event', { value: 7 })">Fire</button>`,
    () => ({})
  );

  const parent = component(
    'event-parent',
    `<event-child on:child-event="received = event.detail"></event-child>`,
    () => ({ received: null as any })
  );

  const { root, mount, state } = parent();
  mount(document.body);

  const btn = root.querySelector('event-child button') as HTMLButtonElement;
  btn.click();

  await nextTick();
  expect(state.received).toEqual({ value: 7 });
});