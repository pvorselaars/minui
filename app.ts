import { component, router, go } from "./minui.js";

component(
  'fancy-button',
  '<button on:click={click}>{label}</button>',
  (input: { label: string} = {label: 'Click'}) => ({
      ...input,
      click() { this.label = this.label === input.label ? input.label+'!' : input.label }
  })
)


const counter = component(
  'counter',
  `
    <p>Count: {count}</p>
    <p>Step: {step}</p>
    <button on:click={increment}>Increment</button>
    <button on:click={decrement}>Decrement</button>
    <fancy-button />
  `,
  (input: {count: number, step: number} = {count: 10, step: 2}) => ({
    ...input,
    increment() { this.count += this.step; this.emit('increment', this.count) },
    decrement() { this.count -= this.step; this.emit('decrement', this.count) }
  }),
);

const counters = component(
  'counters',
  `<counter step=1></counter>
   <counter step=2></counter>
   <counter></counter>
   <counter step=4></counter>
   <counter step=5></counter>
   <button href="/" on:click="{go}">Home</button>`,
  () => ({
    go
  })
)

const app = component(
  'app',
  `
   <counter step=1 on:increment={onIncrement} on:decrement={onDecrement}></counter>
   <button href="/counters" on:click={go}>More counters</button>
   `,
  () => ({
    go,
    onIncrement(e: CustomEvent) { console.log("Incremented to", e.detail) },
    onDecrement(e: CustomEvent) { console.log("Decremented to", e.detail) }
  })
)

export const routes: Record<string, () => any> = {
  "/": app,
  "/counters": counters,
};

router(document.body, routes);
