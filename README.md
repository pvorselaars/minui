# MinUI

A minimal TypeScript UI framework.

## Installation

```bash
npm install @pvorselaars/minui
```

## Usage

```ts
import { component, router } from "@pvorselaars/minui";

component(
  'todo',
  `
    <li><strong>{title}</strong> - {status}</li>
  `,
  (input: { title: string, status: string} = {title: "Todo", status: "pending"}) => ({
    ...input
  })
)

const todos = component(
  'todos',
  `
    <h2>Todo List</h2>
    
    <input type="text" placeholder="New todo..." bind:value={newTodo}  />
    <button on:click=addTodo()>Add Todo</button>
    
    <h3>Tasks ({todos.length}):</h3>
    <ul>
      <todo for="todo in todos" title={todo.title} status={todo.status} />
    </ul>
    
    <button on:click=addRandomTodo()>Add Random Todo</button>
    <button on:click=clear()>Clear All</button>
    
    <button on:click=go('/')>Back to Home</button>
  `,
  () => ({
    newTodo: '',
    todos: [
      { title: 'Learn MinUI', status: 'in progress' },
    ],
    addTodo() {
      if (this.newTodo && this.newTodo.trim()) {
        this.todos = [...this.todos, { title: this.newTodo, status: 'pending' }];
        this.newTodo = '';
      }
    },
    addRandomTodo() {
      const tasks = ['Write tests', 'Fix bugs', 'Deploy', 'Review PR', 'Update docs'];
      const task = tasks[Math.floor(Math.random() * tasks.length)];
      this.todos = [...this.todos, { title: task, status: 'pending' }];
    },
    clear() {
      this.todos = [];
    }
  })
);


const app = component(
  'app',
  `
    <button on:click=go('/todo')>Todo</button>
  `,
  () => ({})
);

const routes: Record<string, () => any> = {
  "/": app,
  "/todo": todos,
};

document.title = "MinUI";
router(document.body, routes);
```