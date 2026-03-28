// ===== APP.JS v6 (opravené dny + GPS + návrat zpět) =====

const APP_VERSION = "v6";
const STATE_KEY = "praha_game_state_" + APP_VERSION;
const DATA_URL = "gameData.json?v=" + Date.now();

const TRANSPORT_STYLE = {
  walk:  { color: "#32a852", weight: 5, opacity: 0.9 },
  tram:  { color: "#e85d0c", weight: 5, opacity: 0.9 },
  metro: { color: "#e3c21b", weight: 5, opacity: 0.9 },
  boat:  { color: "#66b7ff", weight: 5, opacity: 0.9 },
  bolt:  { color: "#111111", weight: 5, opacity: 0.9, dashArray: "12 10" }
};

const state = {
  data: null,
  map: null,
  routeLayer: null,
  nodeLayer: null,
  playerMarker: null,
  currentDay: 1,
  mode: "player",
  showAllDays: false,
  solvedStationIds: [],
  clues: [],
  currentPosition: null,
  currentNodeId: null
};

const dom = {
  title: null,
  day: null,
  progress: null,
  clues: null,
  map: null,
  btnPlayer: null,
  btnLeader: null,
  btnAllDays: null,
  btnNextDay: null,
  btnHints: null,
  btnFinale: null,
  modal: null,
  modalTitle: null,
  modalText: null,
  modalInputWrap: null,
  modalInput: null,
  modalCancel: null,
  modalOk: null
};

let modalResolve = null;
let modalMode = null;

function qs(...ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function getUnlockRadius() {
  return Number(state.data?.config?.unlockRadiusMeters ?? 45);
}

function isLeader() {
  return state.mode === "leader";
}

function isNearNode(node) {
  if (isLeader()) return true;
  if (!state.currentPosition || !node) return false;

  const d = haversineMeters(
    state.currentPosition.lat,
    state.currentPosition.lng,
    Number(node.lat),
    Number(node.lng)
  );

  return d <= getUnlockRadius();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return;

    const saved = JSON.parse(raw);
    state.currentDay = Number(saved.currentDay ?? 1) || 1;
    state.mode = saved.mode === "leader" ? "leader" : "player";
    state.showAllDays = !!saved.showAllDays;
    state.solvedStationIds = Array.isArray(saved.solvedStationIds) ? saved.solvedStationIds : [];
    state.clues = Array.isArray(saved.clues) ? saved.clues : [];
    state.currentNodeId = saved.currentNodeId ?? null;
  } catch (err) {
    console.warn("Nepodařilo se načíst stav:", err);
  }
}

function saveState() {
  localStorage.setItem(
    STATE_KEY,
    JSON.stringify({
      currentDay: state.currentDay,
      mode: state.mode,
      showAllDays: state.showAllDays,
      solvedStationIds: state.solvedStationIds,
      clues: state.clues,
      currentNodeId: state.currentNodeId
    })
  );
}

function bindDom() {
  dom.title = qs("gameTitle");
  dom.day = qs("dayBadge");
  dom.progress = qs("progressBadge");
  dom.clues = qs("cluesBadge");
  dom.map = qs("map");

  dom.btnPlayer = qs("btnPlayer");
  dom.btnLeader = qs("btnLeader");
  dom.btnAllDays = qs("btnAllDays");
  dom.btnNextDay = qs("btnNextDay");
  dom.btnHints = qs("btnHints", "btnIndicie");
  dom.btnFinale = qs("btnFinale");

  dom.btnPlayer?.addEventListener("click", () => setMode("player"));
  dom.btnLeader?.addEventListener("click", () => setMode("leader"));
  dom.btnAllDays?.addEventListener("click", toggleAllDays);
  dom.btnNextDay?.addEventListener("click", nextDay);
  dom.btnHints?.addEventListener("click", showClues);
  dom.btnFinale?.addEventListener("click", showFinale);

  dom.day?.addEventListener("click", () => {
    if (state.mode === "leader") {
      prevDay();
    }
  });

  ensureModal();
}

function ensureModal() {
  const existing = document.getElementById("gameModal");
  if (existing) {
    dom.modal = existing;
    dom.modalTitle = existing.querySelector("[data-role='title']");
    dom.modalText = existing.querySelector("[data-role='text']");
    dom.modalInputWrap = existing.querySelector("[data-role='input-wrap']");
    dom.modalInput = existing.querySelector("[data-role='input']");
    dom.modalCancel = existing.querySelector("[data-role='cancel']");
    dom.modalOk = existing.querySelector("[data-role='ok']");
    bindModalEvents();
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "gameModal";
  overlay.className = "game-modal-overlay";
  overlay.innerHTML = `
    <div class="game-modal-window">
      <div class="game-modal-title" data-role="title">Otázka</div>
      <div class="game-modal-text" data-role="text"></div>
      <div class="game-modal-input-wrap" data-role="input-wrap">
        <input class="game-modal-input" type="text" data-role="input" autocomplete="off" />
      </div>
      <div class="game-modal-actions">
        <button class="game-btn ghost" data-role="cancel">Zrušit</button>
        <button class="game-btn gold" data-role="ok">Potvrdit</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  dom.modal = overlay;
  dom.modalTitle = overlay.querySelector("[data-role='title']");
  dom.modalText = overlay.querySelector("[data-role='text']");
  dom.modalInputWrap = overlay.querySelector("[data-role='input-wrap']");
  dom.modalInput = overlay.querySelector("[data-role='input']");
  dom.modalCancel = overlay.querySelector("[data-role='cancel']");
  dom.modalOk = overlay.querySelector("[data-role='ok']");

  bindModalEvents();
}

function bindModalEvents() {
  dom.modalCancel?.addEventListener("click", () => closeModal(null));
  dom.modalOk?.addEventListener("click", () => {
    if (modalMode === "prompt") {
      closeModal(dom.modalInput.value);
    } else {
      closeModal(true);
    }
  });

  dom.modal?.addEventListener("click", (e) => {
    if (e.target === dom.modal) closeModal(null);
  });

  dom.modalInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      closeModal(dom.modalInput.value);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dom.modal?.classList.contains("show")) {
      closeModal(null);
    }
  });
}

function openAlert(title, text, okText = "OK") {
  return new Promise((resolve) => {
    modalResolve = resolve;
    modalMode = "alert";
    dom.modalTitle.textContent = title || "Informace";
    dom.modalText.textContent = text || "";
    dom.modalInputWrap.style.display = "none";
    dom.modalInput.value = "";
    dom.modalCancel.style.display = "none";
    dom.modalOk.textContent = okText;
    dom.modal.classList.add("show");
  });
}

function openPrompt(title, text, value = "", okText = "Potvrdit", cancelText = "Zrušit") {
  return new Promise((resolve) => {
    modalResolve = resolve;
    modalMode = "prompt";
    dom.modalTitle.textContent = title || "Odpověď";
    dom.modalText.textContent = text || "";
    dom.modalInputWrap.style.display = "block";
    dom.modalInput.value = value;
    dom.modalCancel.style.display = "inline-flex";
    dom.modalCancel.textContent = cancelText;
    dom.modalOk.textContent = okText;
    dom.modal.classList.add("show");
    setTimeout(() => dom.modalInput.focus(), 40);
  });
}

function closeModal(value) {
  if (!dom.modal?.classList.contains("show")) return;
  dom.modal.classList.remove("show");
  const resolver = modalResolve;
  modalResolve = null;
  modalMode = null;
  if (resolver) resolver(value);
}

async function showToast(message) {
  await openAlert("Informace", message);
}

async function setMode(mode) {
  if (mode === "leader") {
    const pass = await openPrompt("Režim vedoucího", "Zadej heslo pro režim vedoucího:");
    if (pass !== "7421") {
      await showToast("Špatné heslo.");
      return;
    }
  }

  state.mode = mode;
  if (mode === "player") {
    state.showAllDays = false;
  }

  saveState();
  renderAll();
}

async function toggleAllDays() {
  if (!isLeader()) {
    await showToast("Všechny dny jsou jen pro vedoucího.");
    return;
  }
  state.showAllDays = !state.showAllDays;
  saveState();
  renderAll();
}

function nextDay() {
  const maxDay = state.data?.config?.totalDays || 5;
  if (state.currentDay < maxDay) {
    state.currentDay += 1;
    saveState();
    renderAll();
  }
}

function prevDay() {
  if (state.currentDay > 1) {
    state.currentDay -= 1;
    saveState();
    renderAll();
  }
}

async function showClues() {
  const text = state.clues.length
    ? "• " + state.clues.join("\n• ")
    : "Zatím nemáte žádné indicie.";
  await openAlert("Indicie", text);
}

async function showFinale() {
  const hint = state.data?.finalTreasure?.hint || "Finále zatím není připravené.";
  const finalNode = state.data?.nodes?.find(n => n.kind === "final") || state.data?.finalTreasure;

  if (!isNearNode(finalNode)) {
    await openAlert(
      "Finále",
      `K finálnímu místu musíš nejdřív dojít.\n\nPřibliž se na cca ${getUnlockRadius()} metrů.`
    );
    return;
  }

  const answer = await openPrompt("Finále", `${hint}\n\nNapiš název místa:`);
  if (!answer) return;

  const normalized = normalize(answer);
  const accepted = (state.data?.finalTreasure?.acceptedAnswers || []).map(normalize);

  if (accepted.includes(normalized)) {
    await openAlert("Finále", state.data.finalTreasure.finalMessage || "Správně!");
  } else {
    await openAlert("Finále", "To není správné finální místo.");
  }
}

function getNodeById(id) {
  return state.data?.nodes?.find((n) => n.id === id) || null;
}

function isNodeVisibleForCurrentDay(node) {
  if (node.kind === "final") {
    return isLeader();
  }

  if (state.mode === "leader" && state.showAllDays) {
    return true;
  }

  if (node.day == null) {
    return true;
  }

  return Number(node.day) === Number(state.currentDay);
}

function getVisibleNodes() {
  if (!state.data?.nodes) return [];
  return state.data.nodes.filter(isNodeVisibleForCurrentDay);
}

function getVisibleRoutes(visibleNodeIds) {
  if (!state.data?.routes) return [];
  return state.data.routes.filter((r) => visibleNodeIds.has(r.from) && visibleNodeIds.has(r.to));
}

function labelTransport(tr) {
  const labels = {
    walk: "Pěšky",
    tram: "Tramvaj",
    metro: "Metro",
    boat: "Loď",
    bolt: "Bolt"
  };
  return labels[tr] || tr;
}

function routeStyle(transport) {
  return TRANSPORT_STYLE[transport] || { color: "#888", weight: 5, opacity: 0.8 };
}

function markerStyle(node) {
  if (node.kind === "station") {
    return { radius: 11, color: "#ffffff", weight: 4, fillColor: "#d4b05f", fillOpacity: 1 };
  }
  if (node.kind === "fake") {
    return { radius: 10, color: "#ffffff", weight: 4, fillColor: "#b6b6b6", fillOpacity: 1 };
  }
  if (node.kind === "final") {
    return { radius: 12, color: "#ffffff", weight: 4, fillColor: "#cc2e2e", fillOpacity: 1 };
  }
  return { radius: 7, color: "#000000", weight: 2, fillColor: "#000000", fillOpacity: 1 };
}

function renderHud() {
  if (!state.data) return;

  if (dom.title) {
    dom.title.textContent = state.data.config?.gameTitle || "Lovci pokladu staré Prahy";
  }

  if (dom.day) {
    if (isLeader()) {
      dom.day.textContent = "Den " + state.currentDay + " ⟲";
      dom.day.title = "Klikni pro krok zpět o den";
      dom.day.style.cursor = "pointer";
    } else {
      dom.day.textContent = "Den " + state.currentDay;
      dom.day.title = "";
      dom.day.style.cursor = "default";
    }
  }

  const todaysStations = state.data.nodes.filter((n) => n.kind === "station" && Number(n.day) === Number(state.currentDay));
  const solvedToday = todaysStations.filter((n) => state.solvedStationIds.includes(n.id)).length;

  if (dom.progress) {
    dom.progress.textContent = `Splněno ${solvedToday} / ${todaysStations.length}`;
  }

  if (dom.clues) {
    dom.clues.textContent = `Indicie ${state.clues.length}`;
  }

  dom.btnPlayer?.classList.toggle("active", state.mode === "player");
  dom.btnLeader?.classList.toggle("active", state.mode === "leader");
  dom.btnAllDays?.classList.toggle("active", !!state.showAllDays);

  if (dom.btnAllDays) {
    dom.btnAllDays.style.display = isLeader() ? "inline-flex" : "none";
  }

  if (dom.btnNextDay) {
    const maxDay = state.data?.config?.totalDays || 5;
    dom.btnNextDay.disabled = state.currentDay >= maxDay;
  }
}

function createMap() {
  if (state.map || !dom.map) return;

  state.map = L.map(dom.map, { zoomControl: true }).setView([50.083, 14.42], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(state.map);

  state.routeLayer = L.layerGroup().addTo(state.map);
  state.nodeLayer = L.layerGroup().addTo(state.map);
}

function renderRoutes(visibleNodes) {
  if (!state.routeLayer) return;
  state.routeLayer.clearLayers();

  const visibleIds = new Set(visibleNodes.map((n) => n.id));
  const routes = getVisibleRoutes(visibleIds);

  for (const route of routes) {
    const from = getNodeById(route.from);
    const to = getNodeById(route.to);
    if (!from || !to) continue;

    const points = Array.isArray(route.path) && route.path.length >= 2
      ? route.path
      : [[from.lat, from.lng], [to.lat, to.lng]];

    const line = L.polyline(points, routeStyle(route.transport));
    line.bindPopup(`${from.name} → ${to.name}<br>${labelTransport(route.transport)}`);
    line.addTo(state.routeLayer);
  }
}

function renderNodes(visibleNodes) {
  if (!state.nodeLayer) return;
  state.nodeLayer.clearLayers();

  for (const node of visibleNodes) {
    const marker = L.circleMarker([node.lat, node.lng], markerStyle(node));
    marker.on("click", () => onNodeClick(node));
    marker.bindTooltip(node.name, { direction: "top" });
    marker.addTo(state.nodeLayer);
  }

  if (state.currentPosition) {
    if (state.playerMarker) {
      state.playerMarker.remove();
    }

    state.playerMarker = L.circleMarker(
      [state.currentPosition.lat, state.currentPosition.lng],
      {
        radius: 10,
        color: "#ffffff",
        weight: 4,
        fillColor: "#e53935",
        fillOpacity: 1
      }
    ).addTo(state.map);
  }
}

async function ensureNearby(node) {
  if (isNearNode(node)) return true;

  if (!state.currentPosition) {
    await openAlert(node.name, "Nemám tvoji GPS polohu.\n\nPovol poloze přístup a zkus to znovu přímo na místě.");
    return false;
  }

  const d = Math.round(
    haversineMeters(
      state.currentPosition.lat,
      state.currentPosition.lng,
      Number(node.lat),
      Number(node.lng)
    )
  );

  await openAlert(
    node.name,
    `Jako hráč musíš dojít na místo.\n\nTeď jsi asi ${d} m daleko.\nOdemčení je do ${getUnlockRadius()} m.`
  );
  return false;
}

async function onNodeClick(node) {
  state.currentNodeId = node.id;
  saveState();

  if (node.kind === "station") {
    if (!(await ensureNearby(node))) return;

    const answer = await openPrompt(node.name, node.question || "Napiš odpověď:");
    if (!answer) return;

    const normalized = normalize(answer);
    const accepted = (node.acceptedAnswers || []).map(normalize);

    if (accepted.includes(normalized)) {
      if (!state.solvedStationIds.includes(node.id)) {
        state.solvedStationIds.push(node.id);
      }

      if (node.clueReward && !state.clues.includes(node.clueReward)) {
        state.clues.push(node.clueReward);
      }

      saveState();
      await openAlert("Správně", node.clueReward || "Získali jste indicii.");
      renderAll();
    } else {
      await openAlert("Špatná odpověď", "To není správná odpověď.");
    }
    return;
  }

  if (node.kind === "fake") {
    if (!(await ensureNearby(node))) return;
    await openAlert(node.name, node.fakeMessage || "Tady poklad není.");
    return;
  }

  if (node.kind === "final") {
    await showFinale();
    return;
  }

  const connected = state.data.routes.filter((r) => r.from === node.id || r.to === node.id);
  const visibleConnected = connected.filter((r) => {
    const otherId = r.from === node.id ? r.to : r.from;
    const other = getNodeById(otherId);
    return other && isNodeVisibleForCurrentDay(other);
  });

  if (!visibleConnected.length) {
    await openAlert(node.name, "Z tohoto bodu zatím není nadefinovaná žádná viditelná cesta.");
    return;
  }

  const lines = visibleConnected.map((r) => {
    const other = getNodeById(r.from === node.id ? r.to : r.from);
    return `${other?.name || "?"} (${labelTransport(r.transport)})`;
  });

  await openAlert(node.name, "Možné směry:\n• " + lines.join("\n• "));
}

function renderAll() {
  if (!state.data) return;

  renderHud();
  createMap();

  const visibleNodes = getVisibleNodes();
  renderRoutes(visibleNodes);
  renderNodes(visibleNodes);
}

function startGPS() {
  if (!navigator.geolocation) return;

  navigator.geolocation.watchPosition(
    (pos) => {
      state.currentPosition = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      renderAll();
    },
    () => {},
    {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 10000
    }
  );
}

async function init() {
  bindDom();
  loadState();

  const res = await fetch(DATA_URL);
  state.data = await res.json();

  const maxDay = state.data?.config?.totalDays || 5;
  if (!state.currentNodeId) {
    state.currentNodeId = state.data?.config?.startNodeId ?? null;
  }

  if (state.currentDay < 1) state.currentDay = 1;
  if (state.currentDay > maxDay) state.currentDay = maxDay;

  if (state.mode === "player") {
    state.showAllDays = false;
  }

  saveState();
  renderAll();
  startGPS();
}

document.addEventListener("DOMContentLoaded", init);
