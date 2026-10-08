(() => {
  const key = "fon-raspored:offline:v1";
  const days = ["Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak"];
  const node = (id) => {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing offline element: ${id}`);
    return element;
  };
  try {
    const theme = localStorage.getItem("theme");
    document.documentElement.classList.toggle(
      "light",
      theme === "light" ||
        ((theme === "system" || !theme) &&
          !matchMedia("(prefers-color-scheme: dark)").matches),
    );
    const snapshot = JSON.parse(localStorage.getItem(key) || "null");
    if (
      !snapshot ||
      snapshot.version !== 1 ||
      typeof snapshot.title !== "string" ||
      !snapshot.schedule ||
      !Number.isFinite(Date.parse(snapshot.savedAt))
    )
      return;
    node("schedule-title").textContent = snapshot.title;
    node("saved-at").textContent =
      `Sačuvano: ${new Date(snapshot.savedAt).toLocaleString("sr-Latn", { timeZone: "Europe/Belgrade" })}`;
    const weekday = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: "Europe/Belgrade",
    }).format(new Date());
    let selected =
      { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4 }[
        weekday
      ] ?? 0;
    function render() {
      node("days").replaceChildren();
      days.forEach((day, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = day;
        button.setAttribute("aria-pressed", String(index === selected));
        button.onclick = () => {
          selected = index;
          render();
        };
        node("days").append(button);
      });
      node("events").replaceChildren();
      const events = snapshot.schedule[days[selected] ?? "Ponedeljak"];
      if (!Array.isArray(events) || !events.length) {
        const empty = document.createElement("p");
        empty.textContent = "Nema sačuvanih termina za ovaj dan.";
        node("events").append(empty);
        return;
      }
      for (const event of events) {
        if (
          !event ||
          typeof event.predmet !== "string" ||
          !Array.isArray(event.grupe)
        )
          continue;
        const card = document.createElement("article");
        const title = document.createElement("h3");
        title.textContent = event.predmet;
        const detail = document.createElement("p");
        detail.textContent = `${event.od}–${event.do} · ${event.tip === "P" ? "Predavanje" : "Vežbe"} · ${event.sala}`;
        const groups = document.createElement("p");
        groups.textContent = `Grupe: ${event.grupe.join(", ")}`;
        card.append(title, detail, groups);
        node("events").append(card);
      }
    }
    node("clear").hidden = false;
    node("clear").onclick = () => {
      localStorage.removeItem(key);
      location.reload();
    };
    render();
  } catch {
    /* A missing/unavailable snapshot leaves the empty offline screen. */
  }
})();
