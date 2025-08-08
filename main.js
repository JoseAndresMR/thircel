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
const pad2       = n => String(n).padStart(2, "0");
const toISODate  = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const hoyISO     = () => toISODate(new Date());

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
    CONFIG.days         = Number(c.diasCelebracion || 31);
    CONFIG.showSorpresa = !!c.mostrarBotonSorpresaPublico;
  }
  // Fallback si no tenemos fechaInicio
  if (!CONFIG.start || isNaN(CONFIG.start.getTime())) {
    const t = new Date();
    CONFIG.start = new Date(t.getFullYear(), 7, 10); // 10-ago
  }
}

/* ===========================
   Mostrar y controlar el modal de entrada
=========================== */
async function loadEntradaModal() {
  const snap = await getDoc(doc(db, "config", "entrada"));

  if (snap.exists()) {
    const data = snap.data();
    const mensaje = data.mensaje || '';
    const mostrar = data.mostrar || false;

    // Si hay un mensaje y está marcado como visible
    if (mostrar) {
      document.getElementById("entrada-mensaje").textContent = mensaje;
      document.getElementById("entrada-modal").style.display = "block";
    }
  }
}

function closeEntradaModal() {
  document.getElementById("entrada-modal").style.display = "none";
  // Guardamos que el usuario ha cerrado el mensaje
  localStorage.setItem("entradaVisto", hoyISO());
}

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
  }else{
    await updateDoc(doc(db,"tarjetas",card.id),{
      descubierta:true,
      fechaDescubierta:new Date()
    });
    localStorage.setItem("ultima"+tipo, hoy);
    showModal(card);
  }

  verificarBotones();
}
window.mostrarTarjeta = mostrarTarjeta;

document.addEventListener("DOMContentLoaded", async () => {
  // Cargar mensaje de entrada
  await loadEntradaModal();
  
  document.getElementById("boton-normal").onclick   = ()=>mostrarTarjeta("Normal");
  document.getElementById("boton-sorpresa").onclick = ()=>mostrarTarjeta("Sorpresa");

  await loadConfig();      // lee fechaInicio, diasCelebracion, sorpresa
  cargarTarjetas();
  verificarBotones();
});
