/* -------- Firebase ---------- */
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

/* -------- utilidades ---------- */
const hoyISO = () => new Date().toISOString().split("T")[0];
let modoAdmin = false;

/* -------- control de botones ---------- */
function yaAbrioHoy(tipo){ return localStorage.getItem("ultima"+tipo)===hoyISO(); }

async function verificarBotones(){
  const cfg = (await getDoc(doc(db,"config","general"))).data() || {};
  const bS = document.getElementById("boton-sorpresa");
  const bN = document.getElementById("boton-normal");

  // botón sorpresa
  bS.style.display = (cfg.mostrarBotonSorpresaPublico &&
                      (!yaAbrioHoy("Sorpresa")||modoAdmin))
                      ? "inline-block" : "none";

  // botón normal
  bN.style.display = (!yaAbrioHoy("Normal")||modoAdmin)
                      ? "inline-block" : "none";
}

window.activarModoAdmin = ()=>{
  modoAdmin = true;
  alert("🔓 Modo administrador activado");
  verificarBotones();
};

/* -------- modal emergente ---------- */
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
  cargarTarjetas();
};

/* -------- descubrir tarjeta ---------- */
async function mostrarTarjeta(tipo){
  const snap = await getDocs(collection(db,"tarjetas"));
  const hoy  = hoyISO();
  let card   = null;

  snap.docs.some(d=>{
    const x = d.data();
    if(!x.descubierta && !x.usada && x.visible &&
       (tipo==="Sorpresa"
         ? x.sorpresaPublica
         : (!x.sorpresaPublica && x.fechaDisponible<=hoy))){
          card = {id:d.id, ...x};
          return true;
       }
  });

  if(!card){
    alert(tipo==="Sorpresa" ? "No hay tarjeta sorpresa disponible"
                            : "No hay tarjeta nueva disponible");
    return;
  }

  await updateDoc(doc(db,"tarjetas",card.id),{
    descubierta:true,
    fechaDescubierta:new Date()
  });
  localStorage.setItem("ultima"+tipo,hoy);
  showModal(card);
  verificarBotones();
}
window.mostrarTarjeta = mostrarTarjeta;

/* -------- construir listado ---------- */
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

  snap.docs.forEach(d=>{
    const x=d.data(); if(!x.descubierta||!x.visible) return;
    (x.usada ? used : pend).appendChild(crearTarjetaHTML({id:d.id,...x}));
  });
}
window.marcarUsadaPorId = async id=>{
  await updateDoc(doc(db,"tarjetas",id),{usada:true});
  cargarTarjetas();
};

/* -------- arranque ---------- */
document.addEventListener("DOMContentLoaded",()=>{
  document.getElementById("boton-normal"  ).onclick = ()=>mostrarTarjeta("Normal");
  document.getElementById("boton-sorpresa").onclick = ()=>mostrarTarjeta("Sorpresa");
  cargarTarjetas();
  verificarBotones();
});
