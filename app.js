// Lovci pokladu staré Prahy
// app.js – verze s vlastním tmavým modal oknem

const DATA_URL = "gameData.json?v=" + Date.now();

const TRANSPORT_STYLE = {
  walk:  { color: "#32a852", weight: 6, opacity: 0.9 },
  tram:  { color: "#e85d0c", weight: 6, opacity: 0.9 },
  metro: { color: "#e3c21b", weight: 6, opacity: 0.9 },
  boat:  { color: "#66b7ff", weight: 6, opacity: 0.9 },
  bolt:  { color: "#111111", weight: 6, opacity: 0.9, dashArray: "12 10" }
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
  discoveredNodeIds: [],
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
  modalOverlay: null,
  modalTitle: null,
  modalText: null,
  modalInputWrap: null,
  modalInput: null,
  modalCancel: null,
  modalOk: null
};

function loadState() {
  try {
    const raw = localStorage.getItem("praha_game_state");
    if (!raw) return;
    const saved = JSON.parse(raw);
    Object.assign(state, {
      currentDay: saved.currentDay ?? state.currentDay,
      mode: saved.mode ?? state.mode,
      showAllDays: saved.showAllDays ?? state.showAllDays,
      discoveredNodeIds: Array.isArray(saved.discoveredNodeIds) ? saved.discoveredNodeIds : [],
      solvedStationIds: Array.isArray(saved.solvedStationIds) ? saved.solvedStationIds : [],
      clues: Array.isArray(saved.clues) ? saved.clues : [],
      currentNodeId: saved.currentNodeId ?? null
    });
  } catch (e) {
    console.warn("Nepodařilo se načíst uložený stav", e);
  }
}

function saveState() {
  const saved = {
    currentDay: state.currentDay,
    mode: state.mode,
    showAllDays: state.showAllDays,
    discoveredNodeIds: state.discoveredNodeIds,
    solvedStationIds: state.solvedStationIds,
    clues: state.clues,
    currentNodeId: state.currentNodeId
  };
  localStorage.setItem("praha_game_state", JSON.stringify(saved));
}

function qs(...ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

function bindDom() {
  dom.title = qs("gameTitle", "title");
  dom.day = qs("dayBadge", "dayLabel", "day");
  dom.progress = qs("progressBadge", "progressLabel", "progress");
  dom.clues = qs("cluesBadge", "cluesLabel", "clues");
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

  createModal();
}

function createModal() {
  const style = document.createElement("style");
  style.textContent = `
    .game-modal-overlay{
      position:fixed;
      inset:0;
      background:rgba(0,0,0,.72);
      display:none;
      align-items:center;
      justify-content:center;
      z-index:99999;
      padding:18px;
    }
    .game-modal-overlay.show{
      display:flex;
    }
    .game-modal{
      width:min(92vw,520px);
      background:linear-gradient(180deg,#1a1610 0%, #231c13 100%);
      color:#f4ead7;
      border:1px solid rgba(255,255,255,.12);
      border-radius:22px;
      box-shadow:0 25px 60px rgba(0,0,0,.45);
      padding:22px 18px 18px;
    }
    .game-modal-title{
      font-size:28px;
      font-weight:700;
      margin-bottom:14px;
      line-height:1.1;
      color:#f1d28b;
    }
    .game-modal-text{
      font-size:20px;
      line-height:1.45;
      white-space:pre-line;
      margin-bottom:16px;
    }
    .game-modal-input-wrap{
      margin-bottom:16px;
      display:none;
    }
    .game-modal-input{
      width:100%;
      box-sizing:border-box;
      border:none;
      outline:none;
      border-radius:16px;
      padding:14px 16px;
      background:#2f271b;
      color:#fff3dd;
      font-size:20px;
      border:1px solid rgba(255,255,255,.12);
    }
    .game-modal-actions{
      display:flex;
      gap:12px;
      justify-content:flex-end;
      margin-top:8px;
    }
    .game-modal-btn{
      border:none;
      border-radius:16px;
      padding:13px 20px;
      font-size:20px;
      font-weight:700;
      cursor:pointer;
    }
    .game-modal-btn-cancel{
      background:#3a3125;
      color:#f4ead7;
    }
    .game-modal-btn-ok{
      background:#d7b56a;
      color:#17120d;
    }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement("div");
  overlay.className = "game-modal-overlay";
  overlay.innerHTML = `
    <div class="game-modal">
      <div class="game-modal-title"></div>
      <div class="game-modal-text"></div>
      <div class="game-modal-input-wrap">
        <input class="game-modal-input" type="text" autocomplete="off" />
      </div>
      <div class="game-modal-actions">
        <button class="game-modal-btn game-modal-btn-cancel">Zrušit</button>
        <button class="game-modal-btn game-modal-btn-ok">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  dom.modalOverlay = overlay;
  dom.modalTitle = overlay.querySelector(".game-modal-title");
  dom.modalText = overlay.querySelector(".game-modal-text");
  dom.modalInputWrap = overlay.querySelector(".game-modal-input-wrap");
  dom.modalInput = overlay.querySelector(".game-modal-input");
  dom.modalCancel = overlay.querySelector(".game-modal-btn-cancel");
  dom.modalOk = overlay.querySelector(".game-modal-btn-ok");

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal(null);
  });

  document.addEventListener("keydown", (e) => {
    if (!dom.modalOverlay.classList.contains("show")) return;
    if (e.key === "Escape") closeModal(null);
    if (e.key === "Enter") {
      if (dom.modalInputWrap.style.display === "none") {
        closeModal(true);
      } else {
        closeModal(dom.modalInput.value);
      }
    }
  });
}

let modalResolver = null;

function openModal({ title = "", text = "", input = false, okText = "OK", cancelText = "Zrušit", defaultValue = "" }) {
  return new Promise((resolve) => {
    modalResolver = resolve;

    dom.modalTitle.textContent = title;
    dom.modalText.textContent = text;
    dom.modalOk.textContent = okText;
    dom.modalCancel.textContent = cancelText;

    if (input) {
      dom.modalInputWrap.style.display = "block";
      dom.modalInput.value = defaultValue;
      setTimeout(() => dom.modalInput.focus(), 30);
    } else {
      dom.modalInputWrap.style.display = "none";
      dom.modalInput.value = "";
    }

    dom.modalCancel.style.display = cancelText ? "inline-block" : "none";

    dom.modalCancel.onclick = () => closeModal(null);
    dom.modalOk.onclick = () => {
      if (input) {
        closeModal(dom.modalInput.value);
      } else {
        closeModal(true);
      }
    };

    dom.modalOverlay.classList.add("show");
  });
}

function closeModal(value) {
  dom.modalOverlay.classList.remove("show");
  if (modalResolver) {
    const resolve = modalResolver;
    modalResolver = null;
    resolve(value);
  }
}

async function setMode(mode) {
  if (mode === "leader") {
    const pass = await openModal({
      title: "Režim vedoucího",
      text: "Zadej heslo pro režim vedoucího:",
      input: true,
      okText: "Vstoupit",
      cancelText: "Zrušit"
    });

    if (pass === null) return;
    if (pass !== "7421") {
      showToast("Špatné heslo.");
      return;
    }
  }

  state.mode = mode;
  if (mode === "player") state.showAllDays = false;
  saveState();
  renderAll();
}

async function toggleAllDays() {
  if (state.mode !== "leader") {
    showToast("Všechny dny jsou jen pro vedoucího.");
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

async function showClues() {
  const text = state.clues.length
    ? "Získané indicie:\n\n• " + state.clues.join("\n• ")
    : "Zatím nemáte žádné indicie.";
  await openModal({
    title: "Indicie",
    text,
    input: false,
    okText: "Zavřít",
    cancelText: ""
  });
}

async function showFinale() {
  const hint = state.data?.finalTreasure?.hint || "Finále zatím není připravené.";
  const answer = await openModal({
    title: "Finále",
    text: `${hint}\n\nNapiš název místa:`,
    input: true,
    okText: "Potvrdit",
    cancelText: "Zrušit"
  });

  if (answer === null || !String(answer).trim()) return;

  const normalized = normalize(answer);
  const accepted = (state.data?.finalTreasure?.acceptedAnswers || []).map(normalize);

  if (accepted.includes(normalized)) {
    await openModal({
      title: "Správně",
      text: state.data.finalTreasure.finalMessage || "Správně!",
      input: false,
      okText: "Super",
      cancelText: ""
    });
  } else {
    await openModal({
      title: "Špatná odpověď",
      text: "To není správné finální místo.",
      input: false,
      okText: "Zkusit znovu",
      cancelText: ""
    });
  }
}

function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getNodeById(id) {
  return state.data.nodes.find(n => n.id === id) || null;
}

function getVisibleNodes() {
  if (state.mode === "leader" && state.showAllDays) return state.data.nodes;
  return state.data.nodes.filter(n => {
    if (n.kind === "final") return state.mode === "leader";
    if (n.day == null) return true;
    return n.day <= state.currentDay;
  });
}

function getVisibleRoutes(visibleNodeIds) {
  return state.data.routes.filter(r => visibleNodeIds.has(r.from) && visibleNodeIds.has(r.to));
}

function renderHud() {
  if (dom.title) dom.title.textContent = state.data.config.gameTitle || "Lovci pokladu staré Prahy";
  if (dom.day) dom.day.textContent = "Den " + state.currentDay;

  const todaysStations = state.data.nodes.filter(n => n.kind === "station" && n.day === state.currentDay);
  const solvedToday = todaysStations.filter(n => state.solvedStationIds.includes(n.id)).length;

  if (dom.progress) dom.progress.textContent = `Splněno ${solvedToday} / ${todaysStations.length}`;
  if (dom.clues) dom.clues.textContent = `Indicie ${state.clues.length}`;

  dom.btnPlayer?.classList.toggle("active", state.mode === "player");
  dom.btnLeader?.classList.toggle("active", state.mode === "leader");
  dom.btnAllDays?.classList.toggle("active", !!state.showAllDays);
}

function createMap() {
  if (state.map) return;

  state.map = L.map(dom.map, { zoomControl: true }).setView([50.083, 14.42], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(state.map);

  state.routeLayer = L.layerGroup().addTo(state.map);
  state.nodeLayer = L.layerGroup().addTo(state.map);
}

function routeStyle(transport) {
  return TRANSPORT_STYLE[transport] || { color: "#888", weight: 5, opacity: 0.8 };
}

function renderRoutes(visibleNodes) {
  state.routeLayer.clearLayers();
  const visibleIds = new Set(visibleNodes.map(n => n.id));
  const routes = getVisibleRoutes(visibleIds);

  for (const route of routes) {
    const from = getNodeById(route.from);
    const to = getNodeById(route.to);
    if (!from || !to) continue;

    const points = Array.isArray(route.path) && route.path.length >= 2
      ? route.path
      : [
          [from.lat, from.lng],
          [to.lat, to.lng]
        ];

    const line = L.polyline(points, routeStyle(route.transport));
    line.bindPopup(`${from.name} → ${to.name}<br>${labelTransport(route.transport)}`);
    line.addTo(state.routeLayer);
  }
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

function markerStyle(node) {
  if (node.kind === "station") return { radius: 12, color: "#ffffff", weight: 4, fillColor: "#d4b05f", fillOpacity: 1 };
  if (node.kind === "fake") return { radius: 11, color: "#ffffff", weight: 4, fillColor: "#b6b6b6", fillOpacity: 1 };
  if (node.kind === "final") return { radius: 12, color: "#ffffff", weight: 4, fillColor: "#cc2e2e", fillOpacity: 1 };
  return { radius: 8, color: "#000000", weight: 2, fillColor: "#000000", fillOpacity: 1 };
}

function renderNodes(visibleNodes) {
  state.nodeLayer.clearLayers();

  for (const node of visibleNodes) {
    const marker = L.circleMarker([node.lat, node.lng], markerStyle(node));
    marker.on("click", () => onNodeClick(node));
    marker.bindTooltip(node.name, { direction: "top" });
    marker.addTo(state.nodeLayer);
  }

  if (state.currentPosition) {
    if (state.playerMarker) state.playerMarker.remove();
    state.playerMarker = L.circleMarker(
      [state.currentPosition.lat, state.currentPosition.lng],
      { radius: 10, color: "#fff", weight: 4, fillColor: "#e53935", fillOpacity: 1 }
    ).addTo(state.map);
  }
}

async function onNodeClick(node) {
  state.currentNodeId = node.id;
  saveState();

  if (node.kind === "station") {
    const answer = await openModal({
      title: node.name,
      text: `${node.question}\n\nNapiš odpověď:`,
      input: true,
      okText: "Potvrdit",
      cancelText: "Zrušit"
    });

    if (answer === null || !String(answer).trim()) return;

    const normalized = normalize(answer);
    const accepted = (node.acceptedAnswers || []).map(normalize);

    if (accepted.includes(normalized)) {
      if (!state.solvedStationIds.includes(node.id)) state.solvedStationIds.push(node.id);
      if (node.clueReward && !state.clues.includes(node.clueReward)) state.clues.push(node.clueReward);
      saveState();

      await openModal({
        title: "Správně",
        text: node.clueReward || "Získali jste indicii.",
        input: false,
        okText: "Pokračovat",
        cancelText: ""
      });

      renderAll();
    } else {
      await openModal({
        title: "Špatná odpověď",
        text: "To není správná odpověď.",
        input: false,
        okText: "Zkusit znovu",
        cancelText: ""
      });
    }
    return;
  }

  if (node.kind === "fake") {
    await openModal({
      title: node.name,
      text: node.fakeMessage || "Tady poklad není.",
      input: false,
      okText: "Rozumím",
      cancelText: ""
    });
    return;
  }

  if (node.kind === "final") {
    showFinale();
    return;
  }

  const connected = state.data.routes.filter(r => r.from === node.id || r.to === node.id);
  const lines = connected.map(r => {
    const other = getNodeById(r.from === node.id ? r.to : r.from);
    return `${other?.name || "?"} (${labelTransport(r.transport)})`;
  });

  const text = lines.length
    ? "Možné směry:\n\n• " + lines.join("\n• ")
    : "Z tohoto bodu teď není připravená žádná cesta.";

  await openModal({
    title: node.name,
    text,
    input: false,
    okText: "Zavřít",
    cancelText: ""
  });
}

function renderAll() {
  if (!state.data) return;
  renderHud();
  createMap();

  const visibleNodes = getVisibleNodes();
  renderRoutes(visibleNodes);
  renderNodes(visibleNodes);
}

async function showToast(msg) {
  await openModal({
    title: "Informace",
    text: msg,
    input: false,
    okText: "OK",
    cancelText: ""
  });
}

function startGPS() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => {
      state.currentPosition = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      renderAll();
    },
    () => {},
    { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
  );
}

async function init() {
  bindDom();
  loadState();

  const res = await fetch(DATA_URL);
  state.data = await res.json();

  if (!state.currentNodeId) state.currentNodeId = state.data.config.startNodeId;
  renderAll();
  startGPS();
}

document.addEventListener("DOMContentLoaded", init);