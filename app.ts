import { component } from "./minui.js";

const counter = component(
  `
    <p>Count: {count}</p>
    <p>Step: {step}</p>
    <button on:click={increment}>Increment</button>
    <button on:mouseenter={decrement}>Decrement</button>
  `,
  () => ({
    count: 0,
    step: 1,
    increment() { this.count += this.step },
    decrement() { this.count -= this.step }
  })
);

counter().mount(document.body);