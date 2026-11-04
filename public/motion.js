// The page's one motion switch (WCAG 2.2.2 asks that motion can be paused): off to begin with
// under reduced motion, flipped by the stage's button. What moves imports it and subscribes;
// CSS reads <html data-motion>.
const calm = matchMedia("(prefers-reduced-motion: reduce)");
const button = document.querySelector(".motion");
const listeners = new Set();

export const motion = {
  on: !calm.matches,
  subscribe(listener) {
    listeners.add(listener);
  },
};

function set(on) {
  motion.on = on;
  document.documentElement.dataset.motion = on ? "on" : "off";
  button?.setAttribute("aria-pressed", String(!on));
  for (const listener of listeners) listener(on);
}

button?.addEventListener("click", () => set(!motion.on));
calm.addEventListener("change", () => set(!calm.matches));
set(motion.on);
