// Edit this list to update the page. The newest entry goes first.
const stations = [
  { place: "Berlin, Deutschland", since: "2026-11-01" },
  { place: "Lissabon, Portugal", since: "2026-09-15" },
  { place: "Hamburg, Deutschland", since: "2026-06-01" },
];

const fmt = (iso) =>
  new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });

// Current location
const [current] = stations;
document.getElementById("current-place").textContent = current.place;
document.getElementById("current-since").textContent = `seit ${fmt(current.since)}`;

// Timeline
const timeline = document.getElementById("timeline");
for (const s of stations) {
  const li = document.createElement("li");
  li.innerHTML = `<div class="place"></div><div class="date"></div>`;
  li.querySelector(".place").textContent = s.place;
  li.querySelector(".date").textContent = `ab ${fmt(s.since)}`;
  timeline.appendChild(li);
}

// Footer year
document.getElementById("year").textContent = new Date().getFullYear();

// Theme toggle (remembered per browser)
const root = document.documentElement;
try {
  const saved = localStorage.getItem("theme");
  if (saved) root.dataset.theme = saved;
} catch {}
document.getElementById("theme-toggle").addEventListener("click", () => {
  const isDark =
    root.dataset.theme === "dark" ||
    (!root.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = isDark ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch {}
});

// Fade sections in on scroll
const observer = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("visible")),
  { threshold: 0.15 }
);
document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
