let map = L.map('map').setView([50.087, 14.42], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);

let gameData = null;
let markers = [];
let lines = [];
let gpsMarker = null;
let currentGps = null;
let testMode = false;
let activeStation = null;

let state = JSON.parse(localStorage.getItem("prahaGameState") || "null") || {
  currentDay: 1,
  solvedIds: [],
  foundClues: [],
  unlockedFakeIds: []
};

const dayBadge = document.getElementById("dayBadge");
const progressBadge = document.getElementById("progressBadge");
const clueBadge = document.getElementById("clueBadge");
const nextDayBtn = document.getElementById("nextDayBtn");
const toast = document.getElementById("toast");
const cluePanel = document.getElementById("cluePanel");
const clueList = document.getElementById("clueList");
const taskBox = document.getElementById("taskBox");
const taskTitle = document.getElementById("taskTitle");
const taskQuestion = document.getElementById("taskQuestion");
const taskInput = document.getElementById("taskInput");

fetch("gamedata.json")
  .then(r => r.json())
  .then(data => {
    gameData = data;
    renderAll();
    startGPS();
  })
  .catch(err => {
    console.error("Chyba při načtení gamedata.json:", err);
    showToast("Nepodařilo se načíst herní data.", "bad");
  });

function saveState() {
  localStorage.setItem("prahaGameState", JSON.stringify(state));
}

function normalizeText(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findNodeById(id) {
  return gameData.nodes.find(n => n.id === id);
}

function isSolved(nodeId) {
  return state.solvedIds.includes(nodeId);
}

function isNodeVisible(node) {
  return node.day == null || node.day === state.currentDay;
}

function getTodayRealStations() {
  return gameData.nodes.filter(n => n.kind === "station" && n.day === state.currentDay);
}

function getTodaySolvedCount() {
  return getTodayRealStations().filter(n => isSolved(n.id)).length;
}

function canAdvanceDay() {
  const total = getTodayRealStations().length;
  const done = getTodaySolvedCount();
  return total > 0 && done >= total;
}

function transportColor(type) {
  if (type === "walk") return "#2f9e44";
  if (type === "tram") return "#d9480f";
  if (type === "metro") return "#f1c40f";
  if (type === "boat") return "#74c0fc";
  if (type === "bolt") return "#111111";
  return "#999999";
}

function transportLabel(type) {
  if (type === "walk") return "Pěšky";
  if (type === "tram") return "Tramvaj";
  if (type === "metro") return "Metro";
  if (type === "boat") return "Loď";
  if (type === "bolt") return "Bolt";
  return type;
}

function clearMapObjects() {
  markers.forEach(m => map.removeLayer(m));
  lines.forEach(l => map.removeLayer(l));
  markers = [];
  lines = [];
}

function renderAll() {
  if (!gameData) return;
  clearMapObjects();
  drawRoutes();
  drawNodes();
  updateHeader();
  updateNextDayButton();
  renderClues();
}

function drawRoutes() {
  gameData.routes.forEach(route => {
    const fromNode = findNodeById(route.from);
    const toNode = findNodeById(route.to);
    if (!fromNode || !toNode) return;

    const fromVisible = isNodeVisible(fromNode);
    const toVisible = isNodeVisible(toNode);

    if (!fromVisible && !toVisible) return;

    const poly = L.polyline(
      [
        [fromNode.lat, fromNode.lng],
        [toNode.lat, toNode.lng]
      ],
      {
        color: transportColor(route.transport),
        weight: route.transport === "metro" ? 7 : 6,
        opacity: 0.95,
        dashArray: route.transport === "bolt" ? "10,8" : null,
        lineCap: "round",
        lineJoin: "round"
      }
    ).addTo(map);

    poly.bindPopup(`${fromNode.name} → ${toNode.name}<br>${transportLabel(route.transport)}`);
    lines.push(poly);
  });
}

function drawNodes() {
  gameData.nodes.forEach(node => {
    if (!isNodeVisible(node)) return;

    let color = "#222";
    let fill = "#555";
    let radius = 8;

    if (node.kind === "transfer") {
      color = "#111";
      fill = "#111";
      radius = 7;
    }

    if (node.kind === "station") {
      color = "#ffffff";
      fill = isSolved(node.id) ? "#2f9e44" : "#d8b36a";
      radius = 11;
    }

    if (node.kind === "fake") {
      color = "#ffffff";
      fill = state.unlockedFakeIds.includes(node.id) ? "#c92a2a" : "#8c8c8c";
      radius = 10;
    }

    const marker = L.circleMarker([node.lat, node.lng], {
      radius: radius,
      color: color,
      weight: 3,
      fillColor: fill,
      fillOpacity: 1
    }).addTo(map);

    let popupText = `<strong>${node.name}</strong>`;
    if (node.kind === "transfer") popupText += `<br><small>Přestupní bod</small>`;
    if (node.kind === "station") popupText += `<br><small>Stanoviště</small>`;
    if (node.kind === "fake") popupText += `<br><small>Neznámá stopa</small>`;

    marker.bindPopup(popupText);
    marker.on("click", () => handleNodeClick(node));

    markers.push(marker);
  });

  updateGpsMarker();
}

function updateGpsMarker() {
  if (!currentGps) return;

  if (gpsMarker) {
    map.removeLayer(gpsMarker);
  }

  gpsMarker = L.circleMarker([currentGps.lat, currentGps.lng], {
    radius: 10,
    color: "#ffffff",
    weight: 3,
    fillColor: "#7048e8",
    fillOpacity: 1
  }).addTo(map);

  gpsMarker.bindPopup("Moje poloha");
}

function updateHeader() {
  const total = getTodayRealStations().length;
  const done = getTodaySolvedCount();

  dayBadge.innerText = `Den ${state.currentDay}`;
  progressBadge.innerText = `Splněno ${done} / ${total}`;
  clueBadge.innerText = `Indicie ${state.foundClues.length}`;
}

function updateNextDayButton() {
  if (canAdvanceDay() && state.currentDay < gameData.config.totalDays) {
    nextDayBtn.classList.remove("hidden");
  } else {
    nextDayBtn.classList.add("hidden");
  }
}

function renderClues() {
  clueList.innerHTML = "";

  if (!state.foundClues.length) {
    clueList.innerHTML = `<div class="clueItem">Zatím nemáte žádné indicie.</div>`;
    return;
  }

  state.foundClues.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "clueItem";
    div.innerHTML = `<strong>Indicie ${index + 1}</strong><br>${item.text}<br><small>${item.source}</small>`;
    clueList.appendChild(div);
  });
}

function startGPS() {
  if (!navigator.geolocation) {
    showToast("Tento telefon nepodporuje GPS.", "bad");
    return;
  }

  navigator.geolocation.watchPosition(
    pos => {
      currentGps = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      updateGpsMarker();
    },
    () => {
      showToast("Nepodařilo se načíst GPS polohu.", "bad");
    },
    {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 10000
    }
  );
}

function nearNode(node, meters = 45) {
  if (!currentGps) return false;
  const d = map.distance([currentGps.lat, currentGps.lng], [node.lat, node.lng]);
  return d <= meters;
}

function handleNodeClick(node) {
  if (!testMode && !nearNode(node, gameData.config.unlockRadiusMeters || 45)) {
    showToast("Nejdřív musíte být fyzicky na místě.", "bad");
    return;
  }

  if (node.kind === "transfer") {
    showToast("Tohle je jen přestupní bod.", "ok");
    return;
  }

  if (node.kind === "fake") {
    if (!state.unlockedFakeIds.includes(node.id)) {
      state.unlockedFakeIds.push(node.id);
      saveState();
    }
    showToast(node.fakeMessage || "Bohužel, falešná stopa.", "bad");
    return;
  }

  if (node.kind === "station") {
    openTask(node);
  }
}

function openTask(node) {
  if (isSolved(node.id)) {
    showToast("Toto stanoviště už máte splněné.", "ok");
    return;
  }

  activeStation = node;
  taskTitle.innerText = node.name;
  taskQuestion.innerText = node.question || "Zadejte odpověď.";
  taskInput.value = "";
  taskBox.classList.remove("hidden");
  taskInput.focus();
}

function closeTask() {
  activeStation = null;
  taskBox.classList.add("hidden");
}

function submitAnswer() {
  if (!activeStation) return;

  const typed = normalizeText(taskInput.value);
  const answers = (activeStation.acceptedAnswers || []).map(normalizeText);

  if (!typed) {
    showToast("Napiš odpověď do pole.", "bad");
    return;
  }

  if (answers.includes(typed)) {
    state.solvedIds.push(activeStation.id);
    state.solvedIds = [...new Set(state.solvedIds)];

    if (activeStation.clueReward) {
      const alreadyHas = state.foundClues.some(c => c.id === activeStation.id);
      if (!alreadyHas) {
        state.foundClues.push({
          id: activeStation.id,
          source: activeStation.name,
          text: activeStation.clueReward
        });
      }
    }

    saveState();
    closeTask();
    renderAll();
    showToast("Správně! Získali jste indicii.", "ok");
  } else {
    showToast("Tohle nesedí. Zkuste jinou odpověď.", "bad");
  }
}

function toggleTest() {
  testMode = !testMode;
  showToast(`TEST MODE: ${testMode ? "zapnut" : "vypnut"}`, "ok");
}

function nextDay() {
  if (!canAdvanceDay()) {
    showToast("Nejdřív musíte splnit všechna pravá stanoviště dne.", "bad");
    return;
  }

  state.currentDay++;
  if (state.currentDay > gameData.config.totalDays) {
    state.currentDay = gameData.config.totalDays;
  }

  saveState();
  renderAll();
  showToast(`Odemčen den ${state.currentDay}!`, "ok");
}

function toggleClues() {
  cluePanel.classList.toggle("hidden");
}

function showToast(text, type = "ok") {
  toast.innerText = text;
  toast.className = "";
  toast.classList.add(type === "ok" ? "toast-ok" : "toast-bad");
  toast.style.display = "block";

  setTimeout(() => {
    toast.style.display = "none";
  }, 2600);
}
