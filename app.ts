import { component, router, go } from "./minui.js";

component(
  'fancy-button',
  '<button on:click={click}>{label}</button>',
  () => ({
      label: 'Click!',
      click() { this.label === 'Click!' ? this.label = 'Clicked!' : this.label = 'Click!'}
  })
)

component(
  'counter',
  `
    <div>
      <p>Count: {count}</p>
      <p>Step: {step}</p>
      <button on:click={increment}>Increment</button>
      <fancy-button />
    </div>
  `,
  () => ({
    count: 0,
    step: 1,
    increment() { this.count += this.step },
    decrement() { this.count -= this.step }
  })
);

const counters = component(
  'counters',
  `<div>
    <counter></counter>
    <counter></counter>
    <counter></counter>
    <counter></counter>
    <counter></counter>
    <button href="/" on:click="{go}">Home</button>
   <div>`,
  () => ({
    go
  })
)

const app = component(
  'app',
  `<div>
    <counter></counter>
    <button href="/counters" on:click="{go}">More counters</button>
   <div>`,
  () => ({
    go
  })
)

export const routes: Record<string, () => any> = {
  "/": app,
  "/counters": counters,
};

router(document.body, routes);
