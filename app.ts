import { component, router } from "./minui.js";

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
    
    <input type="text" placeholder="New todo..." id="todoInput" />
    <button on:click={addTodo}>Add Todo</button>
    
    <h3>Tasks ({todos.length}):</h3>
    <ul>
      <todo for="todo in todos" title={todo.title} status={todo.status} />
    </ul>
    
    <button on:click=addRandomTodo>Add Random Todo</button>
    <button on:click=clearCompleted>Clear All</button>
    
    <button href="/" on:click=go>Back to Home</button>
  `,
  () => ({
    todos: [
      { title: 'Learn MinUI', status: 'in progress' },
    ],
    addTodo() {
      const input = document.getElementById('todoInput') as HTMLInputElement;
      if (input && input.value.trim()) {
        this.todos = [...this.todos, { title: input.value, status: 'pending' }];
        input.value = '';
      }
    },
    addRandomTodo() {
      const tasks = ['Write tests', 'Fix bugs', 'Deploy', 'Review PR', 'Update docs'];
      const task = tasks[Math.floor(Math.random() * tasks.length)];
      this.todos = [...this.todos, { title: task, status: 'pending' }];
    },
    clearCompleted() {
      this.todos = [];
    }
  })
);


const app = component(
  'app',
  `
    <button href="/todo" on:click=go>Todo</button>
  `,
  () => ({})
);

const routes: Record<string, () => any> = {
  "/": app,
  "/todo": todos,
};

document.title = "MinUI";
router(document.body, routes);