import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  collection
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
const db = getFirestore(app);

/* ===========================
   Utils y estado global
=========================== */
const pad2 = n => String(n).padStart(2, "0");
const toISODate = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const hoyISO = () => toISODate(new Date());

let modoAdmin = false;
let CONFIG = {
  start: null,          // Date: config/general.fechaInicio (YYYY-MM-DD)
  days: 31,             // Número de días: config/general.diasCelebracion
  showSorpresa: false   // Boolean: config/general.mostrarBotonSorpresaPublico
};

/* Carga configuración desde Firestore */
async function loadConfig() {
  const snap = await getDoc(doc(db, "config", "general"));
  if (snap.exists()) {
    const c = snap.data();
    if (c.fechaInicio) CONFIG.start = new Date(c.fechaInicio);
    CONFIG.days = Number(c.diasCelebracion || 31);
    CONFIG.showSorpresa = !!c.mostrarBotonSorpresaPublico;
  }
  // Fallback si no tenemos fechaInicio
  if (!CONFIG.start || isNaN(CONFIG.start.getTime())) {
    const t = new Date();
    CONFIG.start = new Date(t.getFullYear(), 7, 10); // 10-ago
  }
}

/* Helpers dependientes de CONFIG */
const startDate = () => new Date(CONFIG.start); // primer día (cumple)
const endDate = () => {
  const e = new Date(CONFIG.start);
  e.setDate(e.getDate() + CONFIG.days - 1);
  return e;
};
const birthdayISO = () => toISODate(startDate());
const inRange = d => {
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return dd >= startDate() && dd <= endDate();
};

/* ===========================
   Control de botones
=========================== */
function yaAbrioHoy(tipo) { return localStorage.getItem("ultima" + tipo) === hoyISO(); }

function verificarBotones() {
  const bS = document.getElementById("boton-sorpresa");
  const bN = document.getElementById("boton-normal");

  bS.style.display = (CONFIG.showSorpresa && (!yaAbrioHoy("Sorpresa") || modoAdmin))
    ? "inline-block" : "none";
  bN.style.display = (!yaAbrioHoy("Normal") || modoAdmin)
    ? "inline-block" : "none";
}

window.activarModoAdmin = () => {
  modoAdmin = true;
  alert("🔓 Modo administrador activado");
  verificarBotones();
};

/* ===========================
   Modal emergente
=========================== */
function showModal(card) {
  const modal = document.getElementById("modal");
  modal.innerHTML = `
    <div class="modal-overlay active" onclick="closeModal(event)">
      <div class="modal-box" onclick="event.stopPropagation()">
        <button class="close-modal" onclick="closeModal()">✖</button>
        <h2>${card.titulo}</h2>
        <p>${card.descripcion}</p>
        ${card.imagen ? `<img class="card-image" src="${card.imagen}" alt="Imagen tarjeta">` : ''}
      </div>
    </div>`;
  modal.style.display = "block";

  // Sonido cuando se descubre la tarjeta
  const audio = new Audio('https://www.soundjay.com/button/beep-07.wav');
  audio.play();
}

window.closeModal = (ev) => {
  if (ev) ev.stopPropagation();
  document.getElementById("modal").style.display = "none";
  cargarTarjetas(); // refresca listas y calendario y stats
};

/* ===========================
   Descubrir tarjeta (normal/sorpresa)
=========================== */
async function mostrarTarjeta(tipo) {
  const snap = await getDocs(collection(db, "tarjetas"));
  const hoy = hoyISO();
  let card = null;

  snap.docs.some(d => {
    const x = d.data();
    if (!x.visible || x.usada || x.descubierta) return false;

    const esSorpresa = x.sorpresaPublica === true;
    if (tipo === "Sorpresa" && esSorpresa) {
      card = { id: d.id, ...x }; return true;
    }
    if (tipo === "Normal" && !esSorpresa && x.fechaDisponible && x.fechaDisponible <= hoy) {
      card = { id: d.id, ...x }; return true;
    }
    return false;
  });

  if (!card) {
    alert(tipo === "Sorpresa" ? "No hay tarjeta sorpresa disponible."
      : "No hay tarjeta nueva disponible.");
  } else {
    await updateDoc(doc(db, "tarjetas", card.id), {
      descubierta: true,
      fechaDescubierta: new Date()
    });
    localStorage.setItem("ultima" + tipo, hoy);
    showModal(card);
  }

  verificarBotones();
}
window.mostrarTarjeta = mostrarTarjeta;

/* ===========================
   Listado de tarjetas + Stats
=========================== */
function crearTarjetaHTML(t) {
  const el = document.createElement("details");
  el.open = false; // plegadas por defecto
  el.innerHTML = `
    <summary class="summary-clickable">${t.titulo}</summary>
    <div class="card-content">
      <div class="card-text">
        <p>${t.descripcion}</p>
        <p><strong>Estado:</strong> ${t.usada ? "✅ Usada" : "🕒 Pendiente"}
          ${!t.usada ? `<button onclick="marcarUsadaPorId('${t.id}')">Marcar como usada</button>` : ''}
        </p>
      </div>
      ${t.imagen ? `<img class="card-image" src="${t.imagen}" alt="Imagen tarjeta">` : ""}
    </div>`;
  return el;
}

function renderStats(counts) {
  const el = document.getElementById("stats-container");
  if (!el) return;

  const { usadas, recibidas } = counts;

  el.innerHTML = `
    <div class="stats-card">
      <div class="stats-title">📊 Estadísticas</div>
      <div class="stat-row"><span>Total recibidas</span><strong>${recibidas}</strong></div>
      <div class="stat-row"><span>Usadas</span><strong>${usadas}</strong></div>
    </div>
  `;
}

async function cargarTarjetas() {
  const snap = await getDocs(collection(db, "tarjetas"));
  const pend = document.getElementById("tarjetas-lista");
  const used = document.getElementById("tarjetas-usadas");
  pend.innerHTML = "";
  used.innerHTML = "";

  // Conjuntos para calendario y contadores para stats
  const releasedSet = new Set();  // fechas descubiertas dentro del rango
  const upcomingSet = new Set();  // futuras (normales) dentro del rango
  const counts = { recibidas: 0, usadas: 0 };

  snap.docs.forEach(d => {
    const x = d.data();
    if (x.visible) counts.recibidas++;

    // Listas de tarjetas descubiertas
    if (!x.descubierta || !x.visible) return;
    const card = crearTarjetaHTML({ id: d.id, ...x });
    if (x.usada) {
      counts.usadas++;
      used.appendChild(card);
    } else {
      pend.appendChild(card);
    }
  });

  renderStats(counts);
  renderCalendar(releasedSet, upcomingSet);
}

/* Marcar usada */
window.marcarUsadaPorId = async id => {
  await updateDoc(doc(db, "tarjetas", id), { usada: true });
  cargarTarjetas();
};

/* ===========================
   Calendario (sidebar derecha)
=========================== */
function monthNameES(date) {
  return date.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

function renderCalendar(releasedSet, upcomingSet) {
  const wrapper = document.getElementById("calendar-container");
  if (!wrapper) return;

  // Construye estructura si no existe
  if (!document.getElementById("calendar-title")) {
    wrapper.innerHTML = `
      <div class="calendar-card">
        <div id="calendar-title" class="calendar-title"></div>
        <div id="calendar-grid" class="calendar-grid"></div>
        <div class="calendar-legend">
          <span class="badge birthday">Cumple</span>
          <span class="badge released">Liberada</span>
          <span class="badge pendingPast">Pasado sin tarjeta</span>
          <span class="badge today">Hoy</span>
        </div>
      </div>`;
  }

  const titleEl = document.getElementById("calendar-title");
  const cal = document.getElementById("calendar-grid");
  titleEl.textContent = monthNameES(startDate());
  cal.innerHTML = "";

  // Cabeceras L-D
  ["L", "M", "X", "J", "V", "S", "D"].forEach(h => {
    const hd = document.createElement("div");
    hd.className = "cal-day cal-head";
    hd.textContent = h;
    cal.appendChild(hd);
  });

  const todayIso = hoyISO();
  const s = startDate();

  for (let i = 0; i < CONFIG.days; i++) {
    const d = new Date(s);
    d.setDate(d.getDate() + i);
    const iso = toISODate(d);

    const cell = document.createElement("div");
    cell.className = "cal-day";
    cell.textContent = d.getDate();

    if (iso === todayIso) cell.classList.add("today");
    if (iso === birthdayISO()) cell.classList.add("birthday"); // cumple = fechaInicio

    const past = new Date(iso) < new Date(todayIso);
    if (past) {
      if (releasedSet.has(iso)) cell.classList.add("released");
      else cell.classList.add("pendingPast");
    }

    cal.appendChild(cell);
  }

  updateStickyTop();
}

/* ===== Sticky: coloca sidebars justo bajo el header ===== */
function updateStickyTop() {
  const header = document.querySelector(".header");
  const top = (header?.offsetTop || 0) + (header?.offsetHeight || 0) + 12;
  document.documentElement.style.setProperty("--sticky-top", `${top}px`);
}
window.addEventListener("resize", updateStickyTop);
window.addEventListener("scroll", updateStickyTop);

/* ===========================
   Arranque
=========================== */
document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("boton-normal").onclick = () => mostrarTarjeta("Normal");
  document.getElementById("boton-sorpresa").onclick = () => mostrarTarjeta("Sorpresa");

  await loadConfig();      // lee fechaInicio, diasCelebracion, sorpresa
  cargarTarjetas();
  verificarBotones();
  updateStickyTop();
});
