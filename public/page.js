// The page's plain behaviour, apart from the room: the song line, the office video, the copy button.
import { motion } from "./motion.js";
import "./nowplaying.js";

// The office plays only while it's on screen and motion is on.
const video = document.querySelector(".window video");
let onScreen = false;
const sync = () => {
  if (onScreen && motion.on) video.play().catch(() => {});
  else video.pause();
};
new IntersectionObserver(([entry]) => {
  onScreen = entry.isIntersecting;
  sync();
}).observe(video);
motion.subscribe(sync);

for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = "Copied";
    } catch {
      getSelection().selectAllChildren(button.previousElementSibling);
      button.textContent = "Selected";
    }
    setTimeout(() => { button.textContent = "Copy"; }, 1600);
  });
}
