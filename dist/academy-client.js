// Shared by the static Hero Academy games. Only game-scoped capabilities live here.
const API = "https://chorequest.heroacademy.app/api/academy";
const HOME = "https://heroacademy.app/play/";
const copy = (v) => JSON.parse(JSON.stringify(v));
const strip = (value) => {
  const p = copy(value);
  delete p.choreLinkId;
  delete p.academyLocalId;
  return p;
};
export async function bootAcademy(adapter, platform = globalThis) {
  const { game } = adapter,
    key = "hero-academy-central:" + game;
  let storage;
  try {
    storage = platform.localStorage;
  } catch {
    storage = {
      getItem: () => null,
      setItem: () => {
        throw Error("Storage unavailable");
      },
    };
  }
  let book;
  try {
    book = JSON.parse(storage.getItem(key) || '{"links":{}}');
    if (!book.links || typeof book.links !== "object") throw Error();
  } catch {
    book = { links: {} };
  }
  let running = false,
    paused = true,
    connected = false,
    stopped = false,
    nextTry = 0;
  const document = platform.document;
  let panel, info, controls, conflict;
  // Aggregate foreground use into short, retryable chunks. Never collect moves,
  // answers, browsing history or activity from an unconnected local player.
  let playIdentity = adapter.identity();
  let playId = platform.crypto?.randomUUID?.() || "";
  let lastTick = Date.now(), visible = document?.visibilityState !== "hidden";
  let engagedMs = 0, attempts = 0, lastCompleted = adapter.milestones().length;
  function queueUsage(force = false) {
    const now = Date.now();
    if (visible) engagedMs += Math.max(0, Math.min(60000, now - lastTick));
    lastTick = now;
    const samePlayer = adapter.identity() === playIdentity;
    const completedNow = samePlayer ? adapter.milestones().length : lastCompleted;
    const completed = Math.min(100, Math.max(0, completedNow - lastCompleted));
    const seconds = Math.floor(engagedMs / 1000);
    if ((force || engagedMs >= 60000) && (seconds || completed || attempts)) {
      const link = book.links[playIdentity];
      if (link && !paused && playId && platform.crypto?.randomUUID) {
        link.activityQueue ||= [];
        const attempted = Math.min(100, Math.max(attempts, completed));
        const entry = { event_id: platform.crypto.randomUUID(), play_id: playId,
          duration_seconds: Math.min(900, seconds), attempted_delta: attempted,
          completed_delta: completed };
        if (entry.duration_seconds || attempted) link.activityQueue.push(entry);
        persist();
      }
      engagedMs = 0;
      attempts = 0;
      lastCompleted = completedNow;
    }
    if (!samePlayer) {
      playIdentity = adapter.identity();
      playId = platform.crypto?.randomUUID?.() || "";
      lastCompleted = adapter.milestones().length;
      engagedMs = 0;
      attempts = 0;
    }
  }
  const element = (tag, text) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  function show(message) {
    if (info) info.textContent = message;
    adapter.status?.(message);
  }
  function persist() {
    try {
      storage.setItem(key, JSON.stringify(book));
      return true;
    } catch {
      paused = true;
      show("Game saved locally. Account sync needs browser storage.");
      return false;
    }
  }
  const active = () => book.links[adapter.identity()];
  async function api(path, link, body) {
    const r = await platform.fetch(API + path, {
      method: body ? "POST" : "GET",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: {
        "Content-Type": "application/json",
        ...(link ? { Authorization: "Bearer " + link.token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const d = await r.json();
    if (!r.ok) {
      const e = Error(d.error || "Sync is unavailable.");
      e.status = r.status;
      e.save = d.save;
      throw e;
    }
    return d;
  }
  function mount() {
    if (!document) return;
    panel = element("section");
    panel.className = "academy-account";
    panel.setAttribute("aria-label", "Hero Academy account");
    panel.append(element("strong", "Your Hero Academy account"));
    info = element("p");
    info.setAttribute("role", "status");
    controls = element("div");
    const home = element("a", "← Games & your hero");
    home.href = HOME;
    home.onclick = async (event) => {
      event.preventDefault();
      const link = active();
      if (link && running) {
        show("Saving your adventure. Tap Games again when sync finishes.");
        return;
      }
      nextTry = 0;
      queueUsage(true);
      await flush();
      if (
        link &&
        (paused || link.dirty || link.queue.length || link.activityQueue?.length) &&
        !platform.confirm(
          "Some progress is still only on this device. Return to Hero Academy with sync pending? Reopen this game to finish syncing.",
        )
      )
        return;
      platform.location.assign(HOME);
    };
    const sync = element("button", "Sync now");
    sync.type = "button";
    sync.onclick = () => {
      nextTry = 0;
      queueUsage(true);
      void flush();
    };
    const disconnect = element("button", "Disconnect this game");
    disconnect.type = "button";
    disconnect.onclick = () => void unlink();
    controls.append(home, sync, disconnect);
    panel.append(info, controls);
    document.body.append(panel);
  }
  async function choose(remote, link) {
    paused = true;
    show("Choose which adventure to continue. Neither save has been replaced.");
    if (!document) {
      adapter.conflict?.(remote);
      return false;
    }
    conflict?.close();
    conflict = element("dialog");
    conflict.className = "academy-conflict";
    conflict.setAttribute("aria-label", "Choose your saved adventure");
    conflict.append(
      element("h2", "Which adventure?"),
      element(
        "p",
        "A saved adventure is available in your family account. Choose before making more progress. Export a backup in Grown-ups if you want to keep a copy.",
      ),
    );
    const cloud = element("button", "Continue cloud save"),
      local = element("button", "Keep this device’s adventure"),
      later = element("button", "Play locally for now");
    return new Promise((resolve) => {
      const finish = () => {
        conflict.close();
        conflict.remove();
        conflict = null;
      };
      cloud.onclick = () => {
        try {
          adapter.restore(copy(remote.state));
          link.revision = remote.revision;
          link.last = remote.legacy
            ? ""
            : JSON.stringify(strip(adapter.snapshot()));
          link.dirty = !!remote.legacy;
          link.seen = [
            ...new Set([...link.seen, ...adapter.milestones().map(String)]),
          ];
          paused = false;
          persist();
          finish();
          resolve(true);
        } catch (e) {
          show("This save could not be opened: " + e.message);
        }
      };
      local.onclick = () => {
        link.revision = remote.revision;
        link.last = "";
        link.dirty = true;
        paused = false;
        persist();
        finish();
        resolve(true);
      };
      later.onclick = () => {
        show(
          "Playing locally. Reopen from Hero Academy to choose a saved adventure.",
        );
        finish();
        resolve(false);
      };
      conflict.addEventListener("cancel", (e) => {
        e.preventDefault();
        later.click();
      });
      conflict.append(cloud, local, later);
      document.body.append(conflict);
      conflict.showModal();
    });
  }
  async function unlink() {
    queueUsage(true);
    const link = active();
    if (!link) return;
    if (
      document &&
      !platform.confirm(
        "Disconnect this game? Local progress stays here. Any pending game XP will remain unsent.",
      )
    )
      return;
    try {
      await api("/disconnect", link, {});
    } catch (e) {
      if (e.status !== 401) {
        show(
          "Could not disconnect on the server. Try again, or ask a parent to disable the game in ChoreQuest.",
        );
        return;
      }
    }
    delete book.links[adapter.identity()];
    paused = true;
    connected = false;
    persist();
    show("Disconnected. Playing locally.");
  }
  async function flush() {
    queueUsage(false);
    if (running || paused || stopped || Date.now() < nextTry) return;
    const id = adapter.identity(),
      link = active();
    if (!link) {
      show(
        "Playing locally. Open this game from Hero Academy to connect your hero.",
      );
      return;
    }
    running = true;
    try {
      const snapshot = strip(adapter.snapshot()),
        serial = JSON.stringify(snapshot),
        milestones = adapter.milestones().map(String);
      for (const m of milestones)
        if (!link.seen.includes(m)) {
          if (!adapter.eventDriven && !link.queue.includes(m))
            link.queue.push(m);
          link.seen.push(m);
        }
      link.dirty = serial !== link.last;
      if (!persist()) return;
      if (link.dirty) {
        const r = await api("/save", link, {
          expectedRevision: link.revision,
          state: snapshot,
          summary: { completed: milestones.length },
        });
        link.revision = r.revision;
        link.last = serial;
        link.dirty = false;
        persist();
      }
      while (link.queue.length) {
        const event = link.queue[0],
          r = await api(
            "/events",
            link,
            typeof event === "string" ? { milestone: event } : event,
          );
        link.queue.shift();
        link.heroXP = r.hero.xp;
        link.gameXP = r.gameXP;
        persist();
      }
      while (link.activityQueue?.length) {
        const event = link.activityQueue[0];
        await api("/activity", link, event);
        link.activityQueue.shift();
        persist();
      }
      if (adapter.identity() === id)
        show(
          "Saved to Hero Academy · " +
            (link.gameXP || 0) +
            " game XP · " +
            (link.heroXP || 0) +
            " total Hero XP",
        );
    } catch (e) {
      if (adapter.identity() !== id) return;
      if (e.status === 409 && e.save) {
        await choose(e.save, link);
      } else if (e.status === 401 || e.status === 403) {
        paused = true;
        show(
          "Connection ended. Your local save is safe. Open this game from Hero Academy again.",
        );
      } else {
        nextTry = Date.now() + 60000;
        show(
          (e.status === 422
            ? "XP waiting for the daily allowance."
            : e.status === 413
              ? e.message
              : "Sync pending. Your local adventure is safe.") +
            " Changes retry when connected.",
        );
      }
    } finally {
      running = false;
    }
  }
  async function start() {
    mount();
    let launch;
    try {
      const u = new URL(platform.location.href);
      launch = new URLSearchParams(u.hash.slice(1)).get("academy_launch");
      if (launch) {
        u.hash = "";
        platform.history.replaceState(null, "", u.pathname + u.search);
      }
      if (launch) {
        const d = await api("/exchange", null, { code: launch });
        if (d.game_id !== game)
          throw Error("This launch belongs to another game.");
        let id = Object.keys(book.links).find(
          (k) => book.links[k].heroId === d.hero.id,
        );
        if (!id || !adapter.select(id)) {
          const current = active();
          if (
            !current &&
            platform.confirm?.(
              "Connect the currently selected adventure to " +
                d.hero.name +
                "? Choose Cancel to create a separate hero and keep this adventure unlinked.",
            )
          )
            id = adapter.identity();
          else id = adapter.create(d.hero);
        }
        const previous = book.links[id],
          link = {
            token: d.token,
            heroId: d.hero.id,
            revision: previous?.revision || 0,
            last: previous?.last || "",
            seen: previous?.seen || adapter.milestones().map(String),
            queue: previous?.queue || [],
            activityQueue: previous?.activityQueue || [],
            gameXP: d.gameXP,
            heroXP: d.hero.xp,
          };
        book.links[id] = link;
        if (!persist()) return;
        connected = true;
        adapter.connected?.();
        if (d.save) {
          if (
            !previous ||
            d.save.revision !== link.revision ||
            link.last !== JSON.stringify(strip(adapter.snapshot()))
          ) {
            if (!(await choose(d.save, link))) return;
          }
        } else link.revision = 0;
      } else {
        const link = active();
        if (!link) {
          show(
            "Saved on this device. Launch from Hero Academy to connect your hero.",
          );
          return;
        }
        const d = await api("/profile", link);
        if (d.game_id !== game) throw Error("Wrong game connection.");
        connected = true;
        adapter.connected?.();
        link.gameXP = d.gameXP;
        link.heroXP = d.hero.xp;
        if (d.save && d.save.revision !== link.revision) {
          if (!(await choose(d.save, link))) return;
        }
      }
      paused = false;
      playIdentity = adapter.identity();
      playId = platform.crypto?.randomUUID?.() || "";
      lastCompleted = adapter.milestones().length;
      engagedMs = 0;
      attempts = 0;
      lastTick = Date.now();
      await flush();
    } catch (e) {
      if (active() && (!e.status || e.status >= 500)) {
        paused = false;
        connected = true;
        nextTry = Date.now() + 60000;
      }
      show(e.message + " Your local progress has been kept.");
    }
  }
  await start();
  const timer = platform.setInterval?.(() => void flush(), 10000);
  timer?.unref?.();
  const online = () => {
    nextTry = 0;
    void flush();
  };
  platform.addEventListener?.("online", online);
  const visibility = () => {
    if (document?.visibilityState === "hidden") {
      queueUsage(true);
      visible = false;
    } else {
      visible = true;
      lastTick = Date.now();
    }
  };
  const pagehide = () => queueUsage(true);
  document?.addEventListener?.("visibilitychange", visibility);
  platform.addEventListener?.("pagehide", pagehide);
  return {
    flush,
    event(kind, level) {
      const link = active();
      if (!link) return;
      const event = { kind, level, id: platform.crypto.randomUUID() };
      if (kind === "challenge") event.milestone = String(level);
      else if (kind === "treasure") event.milestone = "treasure:" + level;
      else event.milestone = kind + ":" + event.id;
      if (!link.queue.some((e) => e?.milestone === event.milestone))
        link.queue.push(event);
      persist();
    },
    // Games can report attempted challenges without revealing answers or clicks.
    recordAttempt(count = 1) {
      if (!Number.isInteger(count) || count < 1 || count > 100) return;
      attempts = Math.min(100, attempts + count);
    },
    status: () => ({ connected, paused, pending: (active()?.queue.length || 0) + (active()?.activityQueue?.length || 0) }),
    stop() {
      queueUsage(true);
      stopped = true;
      platform.clearInterval?.(timer);
      platform.removeEventListener?.("online", online);
      platform.removeEventListener?.("pagehide", pagehide);
      document?.removeEventListener?.("visibilitychange", visibility);
    },
    isConnected: () => !!active(),
  };
}
