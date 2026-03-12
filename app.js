let map = L.map('map').setView([50.087, 14.42], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);

let stations = [];
let zones = [];
let markers = [];
let zoneLayers = [];
let currentDay = 1;
let testMode = false;
let openedStationName = null;
let solved = JSON.parse(localStorage.getItem("prahaSolved") || "[]");

const dayBadge = document.getElementById("dayBadge");
const progressBadge = document.getElementById("progressBadge");
const nextDayBtn = document.getElementById("nextDayBtn");
const toast = document.getElementById("toast");

Promise.all([
  fetch("stations.json").then(r => r.json()),
  fetch("zones.json").then(r => r.json())
]).then(([stationsData, zonesData]) => {
  stations = stationsData;
  zones = zonesData;
  renderAll();
  startGPS();
});

function renderAll() {
  clearMarkers();
  clearZones();
  drawZones();
  createMarkers();
  updateHeader();
  updateNextDayButton();
}

function clearMarkers() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];
}

function clearZones() {
  zoneLayers.forEach(z => map.removeLayer(z));
  zoneLayers = [];
}

function drawZones() {
  zones.forEach(z => {
    const unlocked = z.day <= currentDay;

    const layer = L.circle([z.lat, z.lng], {
      radius: z.radius,
      color: unlocked ? "#2f9e44" : "#7a7a7a",
      weight: unlocked ? 4 : 3,
      fillColor: unlocked ? "#2f9e44" : "#808080",
      fillOpacity: unlocked ? 0.08 : 0.22
    }).addTo(map);

    zoneLayers.push(layer);
  });
}

function createMarkers() {
  const todayStations = stations.filter(s => s.day === currentDay);

  todayStations.forEach((s, i) => {
    const isSolved = solved.includes(s.name);

    const marker = L.circleMarker([s.lat, s.lng], {
      radius: 11,
      color: isSolved ? "#2f9e44" : "#ffffff",
      weight: 3,
      fillColor: s.type === "fake" ? "#8f8f8f" : (isSolved ? "#2f9e44" : "#2b8aef"),
      fillOpacity: 1
    }).addTo(map);

    marker.bindPopup(
      `<div>${s.name}<br><small>${s.type === "fake" ? "Neznámá stopa" : "Možné stanoviště"}</small></div>`
    );

    marker.on("click", () => {
      if (testMode) {
        openStationByName(s.name);
      } else {
        showToast("Pro klikání zapni TEST, jinak se úkol otevře až na místě.", "bad");
      }
    });

    markers.push(marker);
  });
}

function toggleTest() {
  testMode = !testMode;
  showToast("TEST MODE: " + (testMode ? "zapnut" : "vypnut"), "ok");
}

function startGPS() {
  setInterval(checkGPS, 5000);
}

function checkGPS() {
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;

    const todayStations = stations.filter(s => s.day === currentDay);

    todayStations.forEach(s => {
      const d = map.distance([lat, lng], [s.lat, s.lng]);

      if (d < 40 && openedStationName !== s.name) {
        openStationByName(s.name);
      }
    });
  });
}

function openStationByName(name) {
  const s = stations.find(x => x.name === name && x.day === currentDay);
  if (!s) return;

  openedStationName = s.name;

  if (s.type === "fake") {
    showToast("Bohužel, falešná stopa. Tady indicie není. Hledejte jinde.", "bad");
    return;
  }

  if (solved.includes(s.name)) {
    showToast("Tento úkol už máte splněný.", "ok");
    return;
  }

  document.getElementById("taskTitle").innerText = s.name;
  document.getElementById("taskQuestion").innerText = s.question;

  const answersDiv = document.getElementById("answers");
  answersDiv.innerHTML = "";

  s.answers.forEach((a, index) => {
    const b = document.createElement("button");
    b.innerText = `${String.fromCharCode(65 + index)}) ${a}`;
    b.onclick = function() {
      answerStation(s, index);
    };
    answersDiv.appendChild(b);
  });

  document.getElementById("taskBox").classList.remove("hidden");
}

function answerStation(station, selectedIndex) {
  if (selectedIndex === station.correct) {
    solved.push(station.name);
    solved = [...new Set(solved)];
    localStorage.setItem("prahaSolved", JSON.stringify(solved));

    closeTask();
    showToast("Správně! Získali jste indicii.", "ok");
    renderAll();
  } else {
    showToast("Špatně. Zkuste to znovu.", "bad");
  }
}

function closeTask() {
  document.getElementById("taskBox").classList.add("hidden");
  openedStationName = null;
}

function getTodayRealStations() {
  return stations.filter(s => s.day === currentDay && s.type === "real");
}

function getTodaySolvedCount() {
  return getTodayRealStations().filter(s => solved.includes(s.name)).length;
}

function updateHeader() {
  const total = getTodayRealStations().length;
  const done = getTodaySolvedCount();

  dayBadge.innerText = `Den ${currentDay}`;
  progressBadge.innerText = `Splněno ${done} / ${total}`;
}

function updateNextDayButton() {
  const total = getTodayRealStations().length;
  const done = getTodaySolvedCount();

  if (done >= total && total > 0 && currentDay < 5) {
    nextDayBtn.classList.remove("hidden");
  } else {
    nextDayBtn.classList.add("hidden");
  }
}

function nextDay() {
  const total = getTodayRealStations().length;
  const done = getTodaySolvedCount();

  if (done < total) {
    showToast("Nejdřív musíte splnit všechny pravé úkoly dne.", "bad");
    return;
  }

  currentDay++;
  if (currentDay > 5) currentDay = 5;

  renderAll();
  showToast(`Odemčen den ${currentDay}!`, "ok");
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