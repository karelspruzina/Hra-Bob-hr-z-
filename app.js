let map = L.map('map').setView([50.087,14.42],13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
maxZoom:19
}).addTo(map);

let stations=[];
let zones=[];
let currentDay=1;
let testMode=false;

fetch("stations.json")
.then(r=>r.json())
.then(data=>{
stations=data;
createMarkers();
});

fetch("zones.json")
.then(r=>r.json())
.then(data=>{
zones=data;
drawZones();
});

function createMarkers(){

stations.forEach((s,i)=>{

let marker=L.marker([s.lat,s.lng]).addTo(map);

marker.on("click",()=>{
if(testMode) openStation(i);
});

});
}

function drawZones(){

zones.forEach(z=>{

let color = z.day<=currentDay ? "green":"gray";

L.circle([z.lat,z.lng],{
radius:z.radius,
color:color,
fillOpacity:0.1
}).addTo(map);

});

}

function toggleTest(){

testMode=!testMode;

alert("TEST MODE: "+testMode);

}

function nextDay(){

currentDay++;

alert("Den "+currentDay);

}

function checkGPS(){

navigator.geolocation.getCurrentPosition(pos=>{

let lat=pos.coords.latitude;
let lng=pos.coords.longitude;

stations.forEach((s,i)=>{

let d = map.distance([lat,lng],[s.lat,s.lng]);

if(d<40){
openStation(i);
}

});

});

}

setInterval(checkGPS,5000);

function openStation(i){

let s=stations[i];

if(s.type==="fake"){

alert("Falešná stopa! Zkuste jiné místo.");

return;

}

document.getElementById("taskTitle").innerText=s.name;
document.getElementById("taskQuestion").innerText=s.question;

let answersDiv=document.getElementById("answers");

answersDiv.innerHTML="";

s.answers.forEach((a,index)=>{

let b=document.createElement("button");

b.innerText=a;

b.onclick=function(){

if(index===s.correct){

alert("Správně! Získali jste indicii.");

}else{

alert("Špatně.");

}

closeTask();

}

answersDiv.appendChild(b);

});

document.getElementById("taskBox").classList.remove("hidden");

}

function closeTask(){

document.getElementById("taskBox").classList.add("hidden");

}