# MinUI

A minimal TypeScript UI framework with reactive state, component composition, and routing.

## Features

- **Reactive State**: Automatic DOM updates when state changes
- **Component Composition**: Build complex UIs from reusable components
- **Template Directives**: `if`, `for`, `bind`, and custom attributes
- **Event Handling**: Declarative event binding with access to state
- **DOM Refs**: Direct access to DOM elements via `ref` attribute
- **Lifecycle Methods**: `mounted` and `unmounted` hooks
- **Custom Events**: Emit events from components with `this.emit()`
- **Router**: Client-side routing with route parameters and query parameter support

## Installation

```bash
npm install @pvorselaars/minui
```

## Quick Start

```ts
import { component, router } from "@pvorselaars/minui";

// Define a component
const counter = component(
  'counter',
  `
    <div>
      <h1>Count: {count}</h1>
      <button on:click=increment()>+</button>
      <button on:click=decrement()>-</button>
    </div>
  `,
  () => ({
    count: 0,
    increment() {
      this.count++;
    },
    decrement() {
      this.count--;
    }
  })
);

// Another component with route parameters
const userProfile = component(
  'user-profile',
  `<h1>User Profile: {id}</h1>`,
  (params) => ({
    id: params.id
  })
);

// Set up routing
const routes = {
  "/": counter,
  "/user/:id": userProfile
};

router(document.body, routes);

// Navigate to different routes
go('/user/123'); // Route parameter: { id: "123" }
```

## Component API

```ts
component<T, S>(
  tag: string,
  template: string,
  stateFn: (input?: T) => S,
  style?: string
)
```

- `tag`: Custom element name
- `template`: HTML template string with reactive expressions
- `stateFn`: Function returning initial state and methods
- `style`: Optional CSS styles scoped to the component

Returns a factory function that creates component instances.

## State and Reactivity

State is reactive - changes automatically update the DOM. Use arrow functions or method definitions in your state object.

```ts
const state = () => ({
  message: 'Hello',
  items: [1, 2, 3],
  
  // Methods have access to `this`
  updateMessage() {
    this.message = 'Updated!';
  },
  
  // Computed properties work too
  get doubledItems() {
    return this.items.map(x => x * 2);
  }
});
```

## Templates

### Text Interpolation

Use `{expression}` for dynamic text:

```html
<p>Hello {name}!</p>
```

### Directives

#### `if`

Conditionally render elements:

```html
<div if="isVisible">This shows when isVisible is true</div>
```

#### `for`

Render lists:

```html
<ul>
  <li for="item in items">{item.name}</li>
</ul>
```

With index:

```html
<ul>
  <li for="item, index in items">{index + 1}. {item.name}</li>
</ul>
```

#### `bind`

Two-way data binding for form inputs:

```html
<!-- Individual binding -->
<input bind="message" />

<!-- Automatic form binding -->
<form bind="user">
  <input name="name" />
  <input name="email" />
  <input name="age" type="number" />
  <input name="newsletter" type="checkbox" />
</form>
```

When `bind` is used on a container element (like `form`, `div`, etc.), it automatically binds to all child inputs with `name` attributes. Each input's `name` becomes a property path on the bound object.

### Attributes

Dynamic attributes use `{expression}`:

```html
<div class="{isActive ? 'active' : ''}">Dynamic class</div>
<button disabled="{!canSubmit}">Submit</button>
```

### Events

Bind events with `on:eventName`:

```html
<button on:click=handleClick()>Click me</button>
<input on:input=updateValue(event.target.value) />
```

Event handlers receive the event object and have access to state via `this`.

## Events

### Custom Events

Emit events from components:

```ts
const state = () => ({
  notify() {
    this.emit('notification', { message: 'Hello!' });
  }
});
```

Listen to component events:

```html
<my-component on:notification=handleNotification(event.detail) />
```

## Lifecycle

### `mounted()`

Called after the component is added to the DOM:

```ts
const state = () => ({
  mounted() {
    // Component is now in the DOM
    console.log('Component mounted');
  }
});
```

### `unmounted()`

Called before the component is removed from the DOM:

```ts
const state = () => ({
  unmounted() {
    // Clean up resources
    console.log('Component unmounted');
  }
});
```

## Router

```ts
import { router, go } from "@pvorselaars/minui";

const routes = {
  "/": homeComponent,
  "/about": aboutComponent,
  "/user/:id": userComponent,
  "/user/:userId/post/:postId": postComponent
};

router(document.body, routes);

// Navigate programmatically
go('/about');
go('/user/123');
go('/user/alice/post/42?tab=comments');
```

Route parameters and query parameters are merged and passed to the component's state function. Route parameters take precedence over query parameters with the same name.

### Route Parameters

Define dynamic routes using `:` prefix for parameters:

```ts
const userProfile = component(
  'user-profile',
  `<h1>User: {id}</h1><p>Name: {name}</p>`,
  (params) => ({
    id: params.id,
    name: params.name || 'Anonymous'
  })
);

const routes = {
  "/user/:id": userProfile
};

// URL: /user/123 → params: { id: "123" }
// URL: /user/123?name=Alice → params: { id: "123", name: "Alice" }
```

Multiple parameters and nested routes are supported:

```ts
const postView = component(
  'post-view',
  `<h1>Post {postId} by User {userId}</h1>`,
  (params) => ({
    userId: params.userId,
    postId: params.postId
  })
);

const routes = {
  "/user/:userId/post/:postId": postView
};

// URL: /user/alice/post/42 → params: { userId: "alice", postId: "42" }
```

## Component Composition

Components can include other components:

```html
<parent-component>
  <child-component prop={value} />
</parent-component>
```

Pass data via attributes, which become props in the child component's state function.

## Styling

Add scoped styles as the fourth parameter:

```ts
component(
  'my-button',
  `<button>{text}</button>`,
  () => ({ text: 'Click me' }),
  `
    :host {
      display: inline-block;
    }
    button {
      background: blue;
      color: white;
    }
  `
);
```

Styles are automatically scoped to the component.