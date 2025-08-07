/* ===========================
   Firebase (ES Modules)
=========================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, getDocs,
  updateDoc, collection
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBGZnLfG1w-2gipGRAVNqF2S9Zk7xsAePM",
  authDomain: "diasdecelebracion-3783e.firebaseapp.com",
  projectId: "diasdecelebracion-3783e",
  storageBucket: "diasdecelebracion-3783e.appspot.com",
  messagingSenderId: "230965566412",
  appId: "1:230965566412:web:d6e1bb64654a9e60969b69"
};
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

/* ===========================
   Utils y estado global
=========================== */
const pad2 = n => String(n).padStart(2, "0");
const toISODate = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const hoyISO = () => toISODate(new Date());

let modoAdmin = false;
let CONFIG = {
  start: null,                // Date – se obtiene de Firestore (config/general.fechaInicio)
  days: 31,                   // Número de días – config/general.diasCelebracion (por defecto 31)
  showSorpresa: false         // Boolean – config/general.mostrarBotonSorpresaPublico
};

/* Carga la configuración desde Firestore */
async function loadConfig() {
  const snap = await getDoc(doc(db, "config", "general"));
  if (snap.exists()) {
    const c = snap.data();
    if (c.fechaInicio) {
      // fechaInicio como "YYYY-MM-DD"
      CONFIG.start = new Date(c.fechaInicio);
    }
    CONFIG.days        = Number(c.diasCelebracion || 31);
    CONFIG.showSorpresa = !!c.mostrarBotonSorpresaPublico;
  }

  // Fallback si no hay fechaInicio
  if (!CONFIG.start || isNaN(CONFIG.start.getTime())) {
    const t = new Date();
    CONFIG.start = new Date(t.getFullYear(), 7, 10); // 10-ago por defecto
  }
}

/* Helpers dependientes de CONFIG */
const startDate  = () => new Date(CONFIG.start);                              // primer día (cumple)
const endDate    = () => { const e=new Date(CONFIG.start); e.setDate(e.getDate()+CONFIG.days-1); return e; };
const birthdayISO = () => toISODate(startDate());
const inRange = d => {
  const dd=new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return dd >= startDate() && dd <= endDate();
};

/* ===========================
   Control de botones
=========================== */
function yaAbrioHoy(tipo){ return localStorage.getItem("ultima"+tipo) === hoyISO(); }

function verificarBotones(){
  const bS = document.getElementById("boton-sorpresa");
  const bN = document.getElementById("boton-normal");

  bS.style.display = (CONFIG.showSorpresa && (!yaAbrioHoy("Sorpresa") || modoAdmin))
    ? "inline-block" : "none";
  bN.style.display = (!yaAbrioHoy("Normal") || modoAdmin)
    ? "inline-block" : "none";
}

window.activarModoAdmin = ()=>{
  modoAdmin = true;
  alert("🔓 Modo administrador activado");
  verificarBotones();
};

/* ===========================
   Modal emergente
=========================== */
function showModal(card){
  const modal = document.getElementById("modal");
  modal.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal-box" onclick="event.stopPropagation()">
        <button class="close-modal" onclick="closeModal()">✖</button>
        <h2>${card.titulo}</h2>
        <p>${card.descripcion}</p>
        ${card.imagen ? `<img class="card-image" src="${card.imagen}" alt="Imagen tarjeta">` : ''}
      </div>
    </div>`;
  modal.style.display = "block";
}
window.closeModal = (ev)=>{
  if(ev) ev.stopPropagation();
  document.getElementById("modal").style.display = "none";
  cargarTarjetas(); // refresca listas y calendario
};

/* ===========================
   Descubrir tarjeta (normal/sorpresa)
=========================== */
async function mostrarTarjeta(tipo){
  const snap = await getDocs(collection(db,"tarjetas"));
  const hoy  = hoyISO();
  let card   = null;

  snap.docs.some(d=>{
    const x = d.data();
    if (!x.visible || x.usada || x.descubierta) return false;

    const esSorpresa = x.sorpresaPublica === true;
    if (tipo === "Sorpresa" && esSorpresa) {
      card = {id:d.id, ...x}; return true;
    }
    if (tipo === "Normal" && !esSorpresa && x.fechaDisponible && x.fechaDisponible <= hoy) {
      card = {id:d.id, ...x}; return true;
    }
    return false;
  });

  if(!card){
    alert(tipo==="Sorpresa" ? "No hay tarjeta sorpresa disponible."
                            : "No hay tarjeta nueva disponible.");
    return;
  }

  await updateDoc(doc(db,"tarjetas",card.id),{
    descubierta:true,
    fechaDescubierta:new Date()
  });
  localStorage.setItem("ultima"+tipo, hoy);

  showModal(card);
  verificarBotones();
}
window.mostrarTarjeta = mostrarTarjeta;

/* ===========================
   Listado de tarjetas
=========================== */
function crearTarjetaHTML(t){
  const el = document.createElement("details");
  el.open = false; // ← plegado por defecto
  el.innerHTML = `
    <summary class="summary-clickable">${t.titulo}</summary>
    <div class="card-content">
      <div class="card-text">
        <p>${t.descripcion}</p>
        <p><strong>Estado:</strong> ${t.usada?"✅ Usada":"🕒 Pendiente"}
          ${!t.usada?`<button onclick="marcarUsadaPorId('${t.id}')">Marcar como usada</button>`:''}
        </p>
      </div>
      ${t.imagen?`<img class="card-image" src="${t.imagen}" alt="Imagen tarjeta">`:""}
    </div>`;
  return el;
}

async function cargarTarjetas(){
  const snap = await getDocs(collection(db,"tarjetas"));
  const pend = document.getElementById("tarjetas-lista");
  const used = document.getElementById("tarjetas-usadas");
  pend.innerHTML = ""; used.innerHTML = "";

  const releasedSet = new Set();  // fechas descubiertas dentro del rango
  const upcomingSet = new Set();  // futuras programadas (normales) dentro del rango

  snap.docs.forEach(d=>{
    const x = d.data();

    if (x.descubierta) {
      let f = null;
      if (x.fechaDescubierta?.toDate) f = x.fechaDescubierta.toDate();
      else if (typeof x.fechaDescubierta === "string") f = new Date(x.fechaDescubierta);
      else if (x.fechaDisponible) f = new Date(x.fechaDisponible);

      if (f && inRange(f)) releasedSet.add(toISODate(f));
    } else {
      if (x.visible && !x.sorpresaPublica && x.fechaDisponible) {
        const f = new Date(x.fechaDisponible);
        if (inRange(f)) upcomingSet.add(toISODate(f));
      }
    }

    if(!x.descubierta || !x.visible) return;
    const card = crearTarjetaHTML({id:d.id, ...x});
    (x.usada ? used : pend).appendChild(card);
  });

  renderCalendar(releasedSet, upcomingSet);
}
window.marcarUsadaPorId = async id=>{
  await updateDoc(doc(db,"tarjetas",id),{usada:true});
  cargarTarjetas();
};

/* ===========================
   Calendario lateral
=========================== */
function monthNameES(date){
  return date.toLocaleDateString("es-ES",{month:"long", year:"numeric"});
}

function renderCalendar(releasedSet, upcomingSet){
  const wrapper = document.getElementById("calendar-container");
  if (!wrapper) return;

  // título
  const titleEl = document.getElementById("calendar-title");
  if (titleEl) titleEl.textContent = monthNameES(startDate());

  // grid
  const cal = document.getElementById("calendar-grid");
  if (!cal) return;
  cal.innerHTML = "";

  // cabeceras L-D
  const heads = ["L","M","X","J","V","S","D"];
  heads.forEach(h=>{
    const hd = document.createElement("div");
    hd.className = "cal-day cal-head";
    hd.textContent = h;
    cal.appendChild(hd);
  });

  const todayIso = hoyISO();
  const s = startDate();

  for(let i=0; i<CONFIG.days; i++){
    const d = new Date(s); d.setDate(d.getDate()+i);
    const iso = toISODate(d);

    const cell = document.createElement("div");
    cell.className = "cal-day";
    cell.textContent = d.getDate();

    if (iso === todayIso) cell.classList.add("today");
    if (iso === birthdayISO()) cell.classList.add("birthday"); // cumple = fechaInicio

    const past = new Date(iso) < new Date(todayIso);
    if (past){
      if (releasedSet.has(iso)) cell.classList.add("released");
      else cell.classList.add("pendingPast");
    } else {
      if (upcomingSet.has(iso)) cell.classList.add("upcoming");
    }

    cal.appendChild(cell);
  }
}

/* ===========================
   Arranque
=========================== */
document.addEventListener("DOMContentLoaded", async ()=>{
  // listeners
  document.getElementById("boton-normal"  ).onclick = ()=>mostrarTarjeta("Normal");
  document.getElementById("boton-sorpresa").onclick = ()=>mostrarTarjeta("Sorpresa");

  // espera config -> pinta UI
  await loadConfig();

  // crea estructura del calendario si no existe (título + grid)
  if (!document.getElementById("calendar-title")){
    const cont = document.getElementById("calendar-container");
    if (cont){
      cont.innerHTML = `
        <div class="calendar-card">
          <div id="calendar-title" class="calendar-title"></div>
          <div id="calendar-grid" class="calendar-grid"></div>
          <div class="calendar-legend">
            <span class="badge birthday">Cumple</span>
            <span class="badge released">Liberada</span>
            <span class="badge pendingPast">Pasado sin tarjeta</span>
            <span class="badge upcoming">Próxima</span>
            <span class="badge today">Hoy</span>
          </div>
        </div>`;
    }
  }

  cargarTarjetas();
  verificarBotones();
});
