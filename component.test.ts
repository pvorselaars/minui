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
  const factory = component(
    "hello-world",
    `Hello {name}!`,
    () => ({ name: "Bun" })
  );

  test("should register and render a basic component", async () => {

    const { mount } = await factory();
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

    const { mount } = await factory();
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

    await factory();
    await factory();

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

    let { root, mount } = await factory({ count: 10 });
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

    const { root, mount, state } = await parent();
    mount(document.body);

    const p = root.querySelector("child-comp p")!;
    expect(p.textContent).toBe("Child count: 5");

    state.count = 15;
    expect(p.textContent).toBe("Child count: 15");

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
        `<p if=show>Visible</p>`,
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
    `<div show=visible>Hello</div>`,
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

        expect(state.message).toBe("User typed");
    });

    test("deep binding works", async () => {
        const factory = component(
        "bind-deep",
        `<input type=text bind=obj.prop.prop />`,
        () => ({ obj: { prop: { prop: "value" }} })
        );

        const { root, mount, state } = await factory();
        mount(document.body);

        const input = root.querySelector("input")!;
        expect(input.value).toBe("value");

        input.value = "new value"
        const event = new Event("input", { bubbles: true });
        Object.defineProperty(event, 'target', { value: input, writable: false });
        input.dispatchEvent(event);

        expect(state.obj.prop.prop).toBe("new value");
    });

});

describe("attribute binding", () => {

    const factory = component(
    "btn",
    `<button disabled=disabled>Click!</button>`,
    () => ({ disabled: true })
    );

    test("should evaluate expression for attribute", async () => {
        const { root, mount } = await factory();
        mount(document.body);

        const btn = root.querySelector("button")!;
        expect(btn.disabled).toBe(true);
    });

    test("state change should update attribute", async () => {
        const { root, mount, state } = await factory();
        mount(document.body);

        const btn = root.querySelector("button")!;
        expect(btn.disabled).toBe(true);

        state.disabled = false;
        expect(btn.disabled).toBe(false);

    });
});

describe("subcomponent array propagation", () => {
  test("should pass array to subcomponent", async () => {
    // Child component that displays items
    const childFactory = component(
      "item-list",
      `<ul><li for="item in items">{item}</li></ul>`,
      (input?: { items: string[] }) => ({ items: input?.items ?? [] })
    );

    // Parent component that passes array
    const parentFactory = component(
      "parent-list",
      `<item-list items={myItems}></item-list>`,
      () => ({ myItems: ["A", "B", "C"] })
    );

    const { mount } = await parentFactory();
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

    const { mount, state } = await parentFactory();
    mount(document.body);

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe("X");
    expect(lis[1].textContent).toBe("Y");

    // Add item to parent array
    state.data.push("Z");

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

    const { mount, state } = await parentFactory();
    mount(document.body);

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(3);

    // Remove item from parent array
    state.data.pop();

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

    const { mount, state } = await parentFactory();
    mount(document.body);

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(3);
    expect(lis[0].textContent).toBe("First");

    // Remove first item
    state.data.shift();

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

    const { mount, state } = await parentFactory();
    mount(document.body);

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe("Old1");

    // Replace entire array
    state.data = ["New1", "New2", "New3"];

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

    const { mount, state } = await parentFactory();
    mount(document.body);

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe("Alice - 30");
    expect(lis[1].textContent).toBe("Bob - 25");

    // Add new user
    state.people.push({ name: "Charlie", age: 35 });

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
      `
        <div>
          <simple-list items={fruits}></simple-list>
          <simple-list items={vegetables}></simple-list>
        </div>
      `,
      () => ({ 
        fruits: ["Apple", "Banana"],
        vegetables: ["Carrot", "Broccoli"]
      })
    );

    const { mount, state } = await parentFactory();
    mount(document.body);

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(4);
    expect(lis[0].textContent).toBe("Apple");
    expect(lis[1].textContent).toBe("Banana");
    expect(lis[2].textContent).toBe("Carrot");
    expect(lis[3].textContent).toBe("Broccoli");

    // Update first array
    state.fruits.push("Orange");

    lis = document.querySelectorAll("li");
    expect(lis.length).toBe(5);
    expect(lis[2].textContent).toBe("Orange");

    // Update second array
    state.vegetables.shift();

    lis = document.querySelectorAll("li");
    expect(lis.length).toBe(4);
  });

  test("should work with nested subcomponents and arrays", async () => {
    // Inner list component
    const innerListFactory = component(
      "inner-list-comp",
      `<ul><li for="item in items">{item}</li></ul>`,
      (input?: { items: string[] }) => ({ items: input?.items ?? [] })
    );

    // Middle component that wraps the inner list
    const middleFactory = component(
      "middle-wrapper-comp",
      `<div><inner-list-comp items={data}></inner-list-comp></div>`,
      (input?: { data: string[] }) => ({ data: input?.data ?? [] })
    );

    // Outer parent component
    const parentFactory = component(
      "nested-parent-comp",
      `<middle-wrapper-comp data={myItems}></middle-wrapper-comp>`,
      () => ({ myItems: ["One", "Two"] })
    );

    const { mount, state } = await parentFactory();
    mount(document.body);

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe("One");
    expect(lis[1].textContent).toBe("Two");

    // Add item to outermost parent
    state.myItems.push("Three");

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

    const { mount, state } = await parentFactory();
    mount(document.body);

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(0);

    // Add items to empty array
    state.data.push("First");
    state.data.push("Second");

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

    const { mount, state } = await parentFactory();
    mount(document.body);

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(4);

    // Remove middle items using splice
    state.data.splice(1, 2);

    lis = document.querySelectorAll("li");
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe("A");
    expect(lis[1].textContent).toBe("D");
  });

  test("should handle subcomponent with non-array props alongside arrays", async () => {
    const childFactory = component(
      "mixed-props",
      `
        <div>
          <h3>{title}</h3>
          <ul><li for="item in items">{item}</li></ul>
        </div>
      `,
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

    const { mount, state } = await parentFactory();
    mount(document.body);

    const h3 = document.querySelector("h3");
    expect(h3?.textContent).toBe("My List");

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(2);

    // Update both props
    state.heading = "Updated List";
    state.list.push("Item3");

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

    const { mount, state } = await parentFactory({ items: ["A", "B"] });
    mount(document.body);

    let lis = document.querySelectorAll("li");
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe("A");

    // Simulate async update (like fetching from API)
    state.items = ["X", "Y", "Z"];

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

    const { root, mount, state } = await factory();
    mount(document.body);

    const div = root.querySelector("div")!;
    expect(div.textContent).toBe("10");

    state.count = 10;
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

    const { root, mount, state } = await factory();
    mount(document.body);

    let lis = root.querySelectorAll("li");
    expect(lis.length).toBe(3);

    state.query = "a";
    lis = root.querySelectorAll("li");
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe("Apple");
    expect(lis[1].textContent).toBe("Banana");

    state.query = "";
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

    const { root, mount, state } = await factory();
    mount(document.body);

    const div = root.querySelector("div")!;
    expect(div.textContent).toBe("3");

    state.items.push(4);
    expect(div.textContent).toBe("4");

    state.items = [1, 2];
    expect(div.textContent).toBe("2");
  });
});

describe('attribute bindings with loopContext', () => {
  test('updates class attribute based on loop variable', async () => {
    const factory = component(
      'loop-test',
      `<div for="item in items" class="id === item.id ? 'selected' : ''">Item</div>`,
      () => ({ items: [{ id: 0 }, { id: 1 }], id: 0 })
    );

    const { root, mount, state } = await factory();
    mount(document.body);

    const divs = root.querySelectorAll('div');
    expect(divs[0].className).toBe('selected');
    expect(divs[1].className).toBe('');

    state.id = 1;
    expect(divs[0].className).toBe('');
    expect(divs[1].className).toBe('selected');
  });

  test('tracks state variables outside loops correctly', async () => {
    const factory = component(
      'state-test',
      `<div class="active ? 'on' : 'off'">Status</div>`,
      () => ({ active: false })
    );

    const { root, mount, state } = await factory();
    mount(document.body);

    const div = root.querySelector('div')!;
    expect(div.className).toBe('off');

    state.active = true;
    expect(div.className).toBe('on');

    state.active = false;
    expect(div.className).toBe('off');
  });
});
