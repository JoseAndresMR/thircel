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
   Utils y parámetros
=========================== */
const today = new Date();
const YEAR = today.getFullYear();

/** Periodo de celebración: del 10 de agosto (incl.) durante 31 días */
const CELEB_START = new Date(YEAR, 7, 10); // 7 = agosto (0-based)
const CELEB_DAYS  = 31;

/** Día de cumpleaños (cámbialo si hace falta) */
const BIRTHDAY_DAY = 18;
const BIRTHDAY     = new Date(YEAR, 7, BIRTHDAY_DAY);

/** Helpers de fecha */
const pad2 = n => String(n).padStart(2,'0');
const toISODate = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const hoyISO = () => toISODate(new Date());
const inRange = d => {
  const start = new Date(CELEB_START);
  const end   = new Date(CELEB_START); end.setDate(end.getDate() + (CELEB_DAYS - 1));
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return dd >= start && dd <= end;
};

let modoAdmin = false;

/* ===========================
   Control de botones
=========================== */
function yaAbrioHoy(tipo){ return localStorage.getItem("ultima"+tipo) === hoyISO(); }

async function verificarBotones(){
  const cfgSnap = await getDoc(doc(db,"config","general"));
  const cfg = cfgSnap.data() || {};
  const bS = document.getElementById("boton-sorpresa");
  const bN = document.getElementById("boton-normal");

  // Sorpresa: requiere config + no haber abierto hoy (salvo admin)
  bS.style.display = (cfg.mostrarBotonSorpresaPublico && (!yaAbrioHoy("Sorpresa") || modoAdmin))
    ? "inline-block" : "none";

  // Normal: no haber abierto hoy (salvo admin)
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

  // Busca la primera candidata del día
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

  // Marcar como descubierta y guardar la fecha de hoy
  await updateDoc(doc(db,"tarjetas",card.id),{
    descubierta:true,
    fechaDescubierta:new Date()
  });
  localStorage.setItem("ultima"+tipo,hoy);

  showModal(card);
  verificarBotones(); // puede ocultar botón si ya abrimos hoy
}
window.mostrarTarjeta = mostrarTarjeta;

/* ===========================
   Listado de tarjetas
=========================== */
function crearTarjetaHTML(t){
  const el = document.createElement("details");
  el.open = true;
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

  // Conjuntos para el calendario
  const releasedSet = new Set();  // días del periodo que ya tuvieron tarjeta
  const upcomingSet = new Set();  // días futuros del periodo con tarjeta programada

  snap.docs.forEach(d=>{
    const x = d.data();

    // Para el calendario: marcamos como "liberado" el día de fechaDescubierta
    if (x.descubierta) {
      let f = null;
      if (x.fechaDescubierta?.toDate) f = x.fechaDescubierta.toDate();
      else if (typeof x.fechaDescubierta === 'string') f = new Date(x.fechaDescubierta);
      else if (x.fechaDisponible) f = new Date(x.fechaDisponible);
      if (f && inRange(f)) releasedSet.add(toISODate(f));
    } else {
      // Futuro programado (solo tarjetas normales con fechaDisponible)
      if (x.visible && !x.sorpresaPublica && x.fechaDisponible) {
        const f = new Date(x.fechaDisponible);
        if (inRange(f)) upcomingSet.add(toISODate(f));
      }
    }

    // Listas de tarjetas descubiertas visibles
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
   Calendario lateral (31 días desde 10-ago)
=========================== */
function renderCalendar(releasedSet, upcomingSet){
  const cal = document.getElementById("calendar-container");
  if (!cal) return;
  cal.innerHTML = "";

  // Cabecera de días (L-D)
  const heads = ["L","M","X","J","V","S","D"];
  heads.forEach(h=>{
    const hd = document.createElement("div");
    hd.className = "cal-day cal-head";
    hd.textContent = h;
    cal.appendChild(hd);
  });

  const todayIso = hoyISO();
  const start = new Date(CELEB_START);

  for(let i=0; i<CELEB_DAYS; i++){
    const d = new Date(start); d.setDate(d.getDate()+i);
    const iso = toISODate(d);

    const cell = document.createElement("div");
    cell.className = "cal-day";
    cell.textContent = d.getDate();

    // marcas
    if (iso === todayIso) cell.classList.add("today");
    if (toISODate(d) === toISODate(BIRTHDAY)) cell.classList.add("birthday");

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
document.addEventListener("DOMContentLoaded",()=>{
  document.getElementById("boton-normal"  ).onclick = ()=>mostrarTarjeta("Normal");
  document.getElementById("boton-sorpresa").onclick = ()=>mostrarTarjeta("Sorpresa");
  cargarTarjetas();
  verificarBotones();
});
