// app.js
// Cube Timer: plain HTML/CSS/JS, localStorage persistence, offline-friendly.
// Note: Browsers often block fetch() to local files (file://). We *try* to load cfop-data.json,
// and if that fails we fall back to embedded placeholder data (same shape), and offer a file picker.

(() => {
  "use strict";

  // ----------------------------
  // Constants / State
  // ----------------------------
  const LS_SOLVES_KEY = "cubeTimer_solves";
  const LS_SETTINGS_KEY = "cubeTimer_settings"; // optional future use
const LS_PREVIEW_HIDDEN_KEY = "cubeTimer_previewHidden"; 

  const SCRAMBLE_LEN = 20;
  const FACES = ["R", "L", "U", "D", "F", "B"];
  const MODS = ["", "'", "2"];

  const AXIS = {
    R: "x", L: "x",
    U: "y", D: "y",
    F: "z", B: "z"
  };

  let solves = [];
  let scramble = "";
  let timerRunning = false;
  let startTime = 0;
  let rafId = 0;


let mobileReadyToStart = false;
let ignoreNextPointerUp = false;


  // CFOP data (loaded from JSON ideally)
  let cfopData = null;

  // ----------------------------
  // Element refs
  // ----------------------------
  const elScrambleText = document.getElementById("scrambleText");
  const elNewScrambleBtn = document.getElementById("newScrambleBtn");
  const elCopyScrambleBtn = document.getElementById("copyScrambleBtn");

  const elTimerDisplay = document.getElementById("timerDisplay");
  const elTimerStateHint = document.getElementById("timerStateHint");
const elTimerWrap = document.querySelector(".timer-wrap");

const elInspectionDisplay = document.getElementById("inspectionDisplay");

  const elSolveList = document.getElementById("solveList");
  const elClearSolvesBtn = document.getElementById("clearSolvesBtn");

  const elStatBest = document.getElementById("statBest");
  const elStatAo5 = document.getElementById("statAo5");
  const elStatAo12 = document.getElementById("statAo12");
  const elStatAo100 = document.getElementById("statAo100");
  const elStatA = document.getElementById("statA");
const elSolveCount = document.getElementById("solveCount");

  const elCfopCollapseBtn = document.getElementById("cfopCollapseBtn");
  const elCfopBody = document.getElementById("cfopBody");
  const elCfopContent = document.getElementById("cfopContent");
  const elCfopFileInput = document.getElementById("cfopFileInput");
  const elCfopLoadNote = document.getElementById("cfopLoadNote");

  const elTabs = Array.from(document.querySelectorAll(".tab"));

  const elOverlay = document.getElementById("cfopOverlay");
  const elOverlayTitle = document.getElementById("overlayTitle");
  const elOverlayContent = document.getElementById("overlayContent");
  const elOverlayCloseBtn = document.getElementById("overlayCloseBtn");

const elSessionSelect = document.getElementById("sessionSelect");
const elFireworksCanvas = document.getElementById("fireworksCanvas");

const elCubeNet = document.getElementById("cubeNet");

const elScramblePreview = document.getElementById("scramblePreview");
const elTogglePreviewBtn = document.getElementById("togglePreviewBtn");

const elAddManualBtn = document.getElementById("addManualBtn");

// Manual modal refs
const elManualModal = document.getElementById("manualModal");
const elManualModalClose = document.getElementById("manualModalClose");
const elManualTimeInput = document.getElementById("manualTimeInput");
const elManualScrambleInput = document.getElementById("manualScrambleInput");
const elManualPenaltyOK = document.getElementById("manualPenaltyOK");
const elManualPenaltyP2 = document.getElementById("manualPenaltyP2");
const elManualPenaltyDNF = document.getElementById("manualPenaltyDNF");
const elManualSaveBtn = document.getElementById("manualSaveBtn");
const elManualCancelBtn = document.getElementById("manualCancelBtn");
const elManualError = document.getElementById("manualError");




// ---------- Solve modal refs ----------
const elSolveModal = document.getElementById("solveModal");
const elSolveModalClose = document.getElementById("solveModalClose");
const elModalRawTime = document.getElementById("modalRawTime");
const elModalAdjustedTime = document.getElementById("modalAdjustedTime");
const elModalPenalty = document.getElementById("modalPenalty");
const elPenaltyOK = document.getElementById("penaltyOK");
const elPenaltyP2 = document.getElementById("penaltyP2");
const elPenaltyDNF = document.getElementById("penaltyDNF");
const elModalDeleteSolve = document.getElementById("modalDeleteSolve");
const elModalQuickNote = document.getElementById("modalQuickNote");
const elModalSaveNoteBtn = document.getElementById("modalSaveNoteBtn");

// Ao5 details modal refs
const elAoModal = document.getElementById("aoModal");
const elAoModalClose = document.getElementById("aoModalClose");
const elAoList = document.getElementById("aoList");

// We'll attach click to the Ao5 tile (not just the number)
const elAo5Tile = document.getElementById("statAo5")?.closest(".stat");

const LS_CURRENT_SESSION_KEY = "cubeTimer_currentSession";

function solvesKeyForSession(sessionNum){
  return `cubeTimer_solves_p${sessionNum}`;
}


  // ----------------------------
  // Utilities
  // ----------------------------
  const pad2 = (n) => String(n).padStart(2, "0");

  function formatTime(ms) {
    const sec = ms / 1000;
    return sec.toFixed(2);
  }

  function formatTimestamp(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }

  function uid() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied!");
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast("Copied!");
    }
  }

// Inspection state
const INSPECTION_SECONDS = 15;
let inspecting = false;
let inspectionStart = 0;
let inspectionInterval = 0;
let pendingPenaltyMs = 0; // use 2000 for +2 if you want WCA rules
let currentSession = 1;
let activeSolveId = null;

  // Tiny toast (non-blocking)
  let toastTimer = 0;
  function toast(msg) {
    clearTimeout(toastTimer);
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.style.position = "fixed";
      el.style.left = "50%";
      el.style.bottom = "18px";
      el.style.transform = "translateX(-50%)";
      el.style.padding = "10px 14px";
      el.style.borderRadius = "14px";
      el.style.border = "1px solid rgba(255,255,255,0.12)";
      el.style.background = "rgba(0,0,0,0.55)";
      el.style.backdropFilter = "blur(10px)";
      el.style.color = "white";
      el.style.fontWeight = "700";
      el.style.fontSize = "13px";
      el.style.zIndex = "1000";
      el.style.opacity = "0";
      el.style.transition = "opacity 120ms ease";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    requestAnimationFrame(() => (el.style.opacity = "1"));
    toastTimer = setTimeout(() => (el.style.opacity = "0"), 900);
  }

  // ----------------------------
  // Scramble Generator
  // Rules:
  //  - No same-face consecutive moves
  //  - Preferably avoid same-axis consecutive moves
  // ----------------------------
  function generateScramble(len = SCRAMBLE_LEN) {
    const moves = [];
    let lastFace = "";
    let lastAxis = "";

    for (let i = 0; i < len; i++) {
      // Build candidate pool of faces with constraints
      let candidates = FACES.filter(f => f !== lastFace);

      // Optional improvement: avoid same axis consecutively when possible
      const axisFiltered = candidates.filter(f => AXIS[f] !== lastAxis);
      if (axisFiltered.length > 0) candidates = axisFiltered;

      const face = candidates[Math.floor(Math.random() * candidates.length)];
      const mod = MODS[Math.floor(Math.random() * MODS.length)];

      moves.push(face + mod);
      lastFace = face;
      lastAxis = AXIS[face];
    }

    return moves.join(" ");
  }

  
function newScramble() {
  scramble = generateScramble(SCRAMBLE_LEN);
  renderScramble();
  renderScramblePreview(scramble);
}





  function renderScramble() {
    elScrambleText.textContent = scramble;
  }


// ----------------------------
// Scramble Preview (2D cube)
// ----------------------------

// Standard colour scheme
const COLORS = {
  U: "#ffffff", // White
  D: "#ffd500", // Yellow
  F: "#00b050", // Green
  B: "#0047ff", // Blue
  R: "#ff0000", // Red
  L: "#ff8c00"  // Orange
};

// Create a solved cube
function createSolvedCube() {
  return {
    U: Array(9).fill("U"),
    D: Array(9).fill("D"),
    F: Array(9).fill("F"),
    B: Array(9).fill("B"),
    R: Array(9).fill("R"),
    L: Array(9).fill("L")
  };
}

// Rotate a face clockwise
function rotateFaceCW(f) {
  return [
    f[6], f[3], f[0],
    f[7], f[4], f[1],
    f[8], f[5], f[2]
  ];
}

// Helper row/col functions
const row = (f, r) => f.slice(r*3, r*3+3);
const setRow = (f, r, v) => v.forEach((x,i)=>f[r*3+i]=x);
const col = (f, c) => [f[c], f[c+3], f[c+6]];
const setCol = (f, c, v) => { f[c]=v[0]; f[c+3]=v[1]; f[c+6]=v[2]; };

// Apply one clockwise move
function applyMove(cube, m) {
  cube[m.face] = rotateFaceCW(cube[m.face]);

  let t;
  switch (m.face) {
    case "U":
      t = row(cube.F,0);
      setRow(cube.F,0,row(cube.R,0));
      setRow(cube.R,0,row(cube.B,0));
      setRow(cube.B,0,row(cube.L,0));
      setRow(cube.L,0,t);
      break;
    case "D":
      t = row(cube.F,2);
      setRow(cube.F,2,row(cube.L,2));
      setRow(cube.L,2,row(cube.B,2));
      setRow(cube.B,2,row(cube.R,2));
      setRow(cube.R,2,t);
      break;
    case "F":
      t = row(cube.U,2);
      setRow(cube.U,2,col(cube.L,2).reverse());
      setCol(cube.L,2,row(cube.D,0));
      setRow(cube.D,0,col(cube.R,0).reverse());
      setCol(cube.R,0,t);
      break;
    case "B":
      t = row(cube.U,0);
      setRow(cube.U,0,col(cube.R,2));
      setCol(cube.R,2,row(cube.D,2).reverse());
      setRow(cube.D,2,col(cube.L,0));
      setCol(cube.L,0,t.reverse());
      break;
    case "R":
      t = col(cube.U,2);
      setCol(cube.U,2,col(cube.F,2));
      setCol(cube.F,2,col(cube.D,2));
      setCol(cube.D,2,col(cube.B,0).reverse());
      setCol(cube.B,0,t.reverse());
      break;
    case "L":
      t = col(cube.U,0);
      setCol(cube.U,0,col(cube.B,2).reverse());
      setCol(cube.B,2,col(cube.D,0).reverse());
      setCol(cube.D,0,col(cube.F,0));
      setCol(cube.F,0,t);
      break;
  }
}

// Apply full scramble string
function applyScramble(scr) {
  const cube = createSolvedCube();
  const moves = scr.split(" ");

  for (const m of moves) {
    const face = m[0];
    const mod = m.slice(1);

    if (!cube[face]) continue;

    if (mod === "2") {
      applyMove(cube,{face});
      applyMove(cube,{face});
    } else if (mod === "'") {
      applyMove(cube,{face});
      applyMove(cube,{face});
      applyMove(cube,{face});
    } else {
      applyMove(cube,{face});
    }
  }
  return cube;
}

// Build cube net DOM

function buildCubeNet() {
  if (!elCubeNet) return;          // ✅ prevent crash
  elCubeNet.innerHTML = "";
  ["U","L","F","R","B","D"].forEach(f => {
    const face = document.createElement("div");
    face.className = `face ${f}`;
    for (let i = 0; i < 9; i++) {
      const s = document.createElement("div");
      s.className = "sticker";
      face.appendChild(s);
    }
    elCubeNet.appendChild(face);
  });
}

// Update preview
function renderScramblePreview(scr) {
  if (!elCubeNet) return;
  const cube = applyScramble(scr);
  ["U","L","F","R","B","D"].forEach(f=>{
    const stickers = elCubeNet.querySelectorAll(`.face.${f} .sticker`);
    stickers.forEach((el,i)=>{
      el.style.background = COLORS[cube[f][i]];
    });
  });
}

  // ----------------------------
  // Timer (Spacebar-controlled)
  // ----------------------------
  function startTimer() {
    if (timerRunning) return;
    timerRunning = true;
    startTime = performance.now();
    elTimerStateHint.textContent = "Timing…";
    tick();
  }

function openSolveModal(id){
  activeSolveId = id;
  const s = solves.find(x => x.id === id);
  if (!s) return;

  const penalty = normalizePenalty(s.penalty);
  const base = Number(s.timeMs);
  const adj = getAdjustedTimeMs(s);

  elModalRawTime.textContent = Number.isFinite(base) ? formatTime(base) : "—";
  elModalAdjustedTime.textContent = (penalty === "DNF") ? "DNF" : (adj != null ? formatTime(adj) : "—");
  elModalPenalty.textContent = penalty;

if (elModalQuickNote) {
  elModalQuickNote.value = s.note ? String(s.note) : "";
}

  // Button active states
  elPenaltyOK.classList.toggle("active", penalty === "OK");
  elPenaltyP2.classList.toggle("active", penalty === "+2");
  elPenaltyDNF.classList.toggle("active", penalty === "DNF");

  elSolveModal.classList.add("show");
  elSolveModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeSolveModal(){
 
if (activeSolveId && elModalQuickNote) {
 setSolveNote(activeSolveId, elModalQuickNote.value);
}

 activeSolveId = null;
  elSolveModal.classList.remove("show");
  elSolveModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function setSolvePenalty(id, penalty){
  const s = solves.find(x => x.id === id);
  if (!s) return;
  s.penalty = normalizePenalty(penalty);
  saveSolves();
  renderSolves();
  renderStats();
  // keep modal UI in sync
  if (activeSolveId === id) openSolveModal(id);
}

function setSolveNote(id, noteText){
  const s = solves.find(x => x.id === id);
  if (!s) return;

  s.note = String(noteText ?? "").trim();

  saveSolves();
  renderSolves();
  renderStats();

  toast("Note saved");
}

  function tick() {
    if (!timerRunning) return;
    const now = performance.now();
    const elapsed = now - startTime;
    elTimerDisplay.textContent = formatTime(elapsed);
    rafId = requestAnimationFrame(tick);
  }

  function stopTimer() {
    if (!timerRunning) return;

    timerRunning = false;
    cancelAnimationFrame(rafId);

    const elapsed = performance.now() - startTime;
const timeMs = Math.max(0, Math.round(elapsed));

// Best before adding this solve
const prevBest = computeBest(); // uses current solves array (before we add)

// Save solve
addSolve({
  id: uid(),
  timeMs,
penalty: "OK",
  scramble,
  timestampISO: new Date().toISOString()
});

// New PB check (only if there WAS a previous best)


const adjusted = getAdjustedTimeMs({ timeMs, penalty: "OK" });
if (prevBest !== null && adjusted !== null && adjusted < prevBest) {
  showFireworks(5000);
  toast("🎉 New PB!");
}




// If this is the first ever solve (no previous best), you can choose if you want fireworks too:
if (prevBest === null) {
  // Uncomment if you want fireworks on first solve:
  // showFireworks(5000);
  // toast("🎉 First solve!");
}

newScramble();
  }

  function toggleTimer() {
  // If solving, stop + save solve
  if (timerRunning) {
    stopTimer();
    return;
  }

  // If inspecting, start the solve timer
  if (inspecting) {
    stopInspection();
    startTimer();
    return;
  }

  // If idle, begin inspection
  startInspection();
}

  function resetTimerDisplay() {
    elTimerDisplay.textContent = "0.00";
    elTimerStateHint.textContent = "";
  }

function startInspection() {
  if (timerRunning || inspecting) return;

  inspecting = true;
  pendingPenaltyMs = 0;
  inspectionStart = performance.now();

  elTimerStateHint.textContent = "Inspection… tap and hold to start";
  updateInspectionUI();

  clearInterval(inspectionInterval);
  inspectionInterval = setInterval(updateInspectionUI, 100);
}

function stopInspection() {
  if (!inspecting) return;
  inspecting = false;
  clearInterval(inspectionInterval);
  inspectionInterval = 0;

setMobileReadyState(false);

  // Clear inspection label when solve begins
  elInspectionDisplay.textContent = "";
  elInspectionDisplay.classList.remove("warn", "danger");
}


function setMobileReadyState(isReady){
  mobileReadyToStart = isReady;

  if (elTimerWrap) {
    elTimerWrap.classList.toggle("ready", isReady);
  }

  if (isReady) {
    elTimerStateHint.textContent = "Release to start";
  } else if (inspecting) {
    elTimerStateHint.textContent = "Inspection… tap and hold to start";
  }
}

function isTouchLikePointer(e){
  return true;
}

function onTimerPointerDown(e){
  if (!isTouchLikePointer(e)) return;

  // Don't let touch interaction work if any modal/overlay is open
  if (
    elSolveModal?.classList.contains("show") ||
    elManualModal?.classList.contains("show") ||
    elAoModal?.classList.contains("show") ||
    elOverlay?.classList.contains("show")
  ) {
    return;
  }

  e.preventDefault();

  // If timer is running, touching stops it immediately
  if (timerRunning) {
    setMobileReadyState(false);
    stopTimer();
    ignoreNextPointerUp = true;
    return;
  }

  // If not inspecting yet, first tap starts inspection
  if (!inspecting) {
    startInspection();
    elTimerStateHint.textContent = "Inspection… tap and hold to start";
    ignoreNextPointerUp = true; // prevents the same tap release from starting the timer
    return;
  }

  // If inspecting, touch-and-hold enters ready state
  setMobileReadyState(true);
}

function onTimerPointerUp(e){
  if (!isTouchLikePointer(e)) return;
  e.preventDefault();

  if (ignoreNextPointerUp) {
    ignoreNextPointerUp = false;
    return;
  }

  // If user was holding during inspection, releasing starts the timer
  if (inspecting && mobileReadyToStart) {
    setMobileReadyState(false);
    stopInspection();
    startTimer();
  }
}

function onTimerPointerCancel(){
  setMobileReadyState(false);
  ignoreNextPointerUp = false;
}


function updateInspectionUI() {
  if (!inspecting) return;

  const elapsed = (performance.now() - inspectionStart) / 1000;
  const remaining = INSPECTION_SECONDS - elapsed;
  const display = remaining > 0 ? Math.ceil(remaining) : 0;

  elInspectionDisplay.textContent = `Inspection: ${display}s`;

  // Optional color warnings
  elInspectionDisplay.classList.toggle("warn", display <= 8 && display > 3);
  elInspectionDisplay.classList.toggle("danger", display <= 3);

  // Optional: auto-start solve when inspection hits 0
  if (remaining <= 0) {
    stopInspection();
    startTimer();
  }
}


let manualPenalty = "OK";

function openManualModal(){
  if (!elManualModal) return;

  manualPenalty = "OK";
  updateManualPenaltyButtons();

  if (elManualError) elManualError.textContent = "";

  // default scramble to current scramble
  if (elManualScrambleInput) elManualScrambleInput.value = scramble || "";

  // clear + focus time input
  if (elManualTimeInput) {
    elManualTimeInput.value = "";
    setTimeout(() => elManualTimeInput.focus(), 0);
  }

  elManualModal.classList.add("show");
  elManualModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeManualModal(){
  if (!elManualModal) return;
  elManualModal.classList.remove("show");
  elManualModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function updateManualPenaltyButtons(){
  if (!elManualPenaltyOK) return;
  elManualPenaltyOK.classList.toggle("active", manualPenalty === "OK");
  elManualPenaltyP2.classList.toggle("active", manualPenalty === "+2");
  elManualPenaltyDNF.classList.toggle("active", manualPenalty === "DNF");
}


function parseManualTimeToMs(input){
  const s = String(input || "").trim();
  if (!s) return null;

  // Allow "DNF" typed in time box as a convenience
  if (s.toLowerCase() === "dnf") return { ms: 0, asDNF: true };

  // mm:ss.xx format
  if (s.includes(":")) {
    const parts = s.split(":");
    if (parts.length !== 2) return null;

    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);

    if (!Number.isFinite(minutes) || minutes < 0) return null;
    if (!Number.isFinite(seconds) || seconds < 0 || seconds >= 60) return null;

    const totalSeconds = minutes * 60 + seconds;
    return { ms: Math.round(totalSeconds * 1000), asDNF: false };
  }

  // plain seconds (e.g., 12.34)
  const sec = Number(s);
  if (!Number.isFinite(sec) || sec < 0) return null;
  return { ms: Math.round(sec * 1000), asDNF: false };
}


function saveManualSolve(){
  if (!elManualTimeInput) return;

  const parsed = parseManualTimeToMs(elManualTimeInput.value);
  if (!parsed) {
    if (elManualError) elManualError.textContent = "Please enter a valid time (e.g. 12.34 or 1:23.45).";
    return;
  }

  // If they typed DNF or chose DNF penalty
  const penaltyToUse = manualPenalty === "DNF" || parsed.asDNF ? "DNF" : manualPenalty;

  const solve = {
    id: uid(),
    timeMs: parsed.ms, // raw time
    penalty: penaltyToUse,
    scramble: (elManualScrambleInput?.value || "").trim(),
    timestampISO: new Date().toISOString(),
    source: "manual"
  };

  addSolve(solve);
  closeManualModal();
  toast("Manual solve saved");

  // Optional: generate a new scramble after adding manual solve?
  // If you want this, uncomment:
  // newScramble();
}

// ---------- Penalties / adjusted time ----------
const PENALTIES = ["OK", "+2", "DNF"];

function normalizePenalty(p){
  return PENALTIES.includes(p) ? p : "OK";
}

function getAdjustedTimeMs(s){
  // DNF => null
  const penalty = normalizePenalty(s?.penalty);
  const base = Number(s?.timeMs);
  if (!Number.isFinite(base)) return null;
  if (penalty === "DNF") return null;
  if (penalty === "+2") return base + 2000;
  return base;
}

function formatSolveDisplay(s){
  const penalty = normalizePenalty(s.penalty);
  const base = Number(s.timeMs);
  const adj = getAdjustedTimeMs(s);
  if (penalty === "DNF") return { main: "DNF", sub: Number.isFinite(base) ? formatTime(base) : "", badge: "DNF" };
  if (penalty === "+2") return { main: formatTime(adj), sub: formatTime(base), badge: "+2" };
  return { main: formatTime(adj), sub: "", badge: "" };
}

// ----------------------------
// Fireworks (PB celebration)
// ----------------------------
let fwCtx = null;
let fwParticles = [];
let fwAnimId = 0;
let fwTimeoutId = 0;
let fwRunning = false;

function resizeFireworksCanvas() {
  if (!elFireworksCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  elFireworksCanvas.width = Math.floor(window.innerWidth * dpr);
  elFireworksCanvas.height = Math.floor(window.innerHeight * dpr);
  elFireworksCanvas.style.width = "100%";
  elFireworksCanvas.style.height = "100%";
  fwCtx = elFireworksCanvas.getContext("2d");
  fwCtx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function spawnBurst(x, y) {
  const colors = ["#ff4d4d", "#ffd24a", "#2ecc71", "#4ea1ff", "#ff9f43", "#ffffff"];
  const count = 80; // burst size
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(1.5, 6.5);
    fwParticles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(40, 80),
      color: colors[Math.floor(Math.random() * colors.length)],
      size: rand(1.5, 3.2),
      gravity: 0.08,
      drag: 0.985
    });
  }
}

function fireworksFrame() {
  if (!fwRunning || !fwCtx) return;

  // fade previous frame (nice trailing effect)
  fwCtx.fillStyle = "rgba(0,0,0,0.18)";
  fwCtx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  // update particles
  fwParticles = fwParticles.filter(p => p.life > 0);
  for (const p of fwParticles) {
    p.life -= 1;
    p.vx *= p.drag;
    p.vy *= p.drag;
    p.vy += p.gravity;

    p.x += p.vx;
    p.y += p.vy;

    fwCtx.beginPath();
    fwCtx.fillStyle = p.color;
    fwCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    fwCtx.fill();
  }

  fwAnimId = requestAnimationFrame(fireworksFrame);
}

function showFireworks(durationMs = 5000) {
  if (!elFireworksCanvas) return;

  // Reset
  clearTimeout(fwTimeoutId);
  cancelAnimationFrame(fwAnimId);
  fwParticles = [];
  fwRunning = true;

  elFireworksCanvas.classList.add("show");
  resizeFireworksCanvas();

  // Spawn a few bursts over the first second
  const bursts = 7;
  for (let i = 0; i < bursts; i++) {
    setTimeout(() => {
      const x = rand(window.innerWidth * 0.15, window.innerWidth * 0.85);
      const y = rand(window.innerHeight * 0.10, window.innerHeight * 0.45);
      spawnBurst(x, y);
    }, i * 140);
  }

  // Start animation
  fwCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  fireworksFrame();

  // Stop after duration
  fwTimeoutId = setTimeout(() => {
    fwRunning = false;
    cancelAnimationFrame(fwAnimId);
    elFireworksCanvas.classList.remove("show");
    fwParticles = [];
  }, durationMs);
}

  // ----------------------------
  // Persistence (localStorage)
  // ----------------------------
  
function loadSolves() {
  try {
    const key = solvesKeyForSession(currentSession);
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) { solves = []; return; }

    solves = parsed.map(s => {
      // Back-compat: older versions may have dnf boolean or penaltyMs
      let penalty = s.penalty;
      if (!penalty && s.dnf === true) penalty = "DNF";
      if (!penalty && s.penaltyMs === 2000) penalty = "+2";

      return {
        id: String(s.id ?? uid()),
        timeMs: Number(s.timeMs ?? s.baseTimeMs ?? 0),
        scramble: String(s.scramble ?? ""),
        timestampISO: String(s.timestampISO ?? s.timestamp ?? new Date().toISOString()),
        penalty: normalizePenalty(penalty ?? "OK"),
	 note: String(s.note ?? "")
      };
    });

  } catch {
    solves = [];
  }
}
  
function saveSolves() {
  const key = solvesKeyForSession(currentSession);
  localStorage.setItem(key, JSON.stringify(solves));
}


  function addSolve(solve) {
    // Newest first:
    solves.unshift(solve);
    saveSolves();
    renderSolves();
    renderStats();
  }

  function deleteSolve(id) {
    solves = solves.filter(s => s.id !== id);
    saveSolves();
    renderSolves();
    renderStats();
  }

  function clearSolves() {
const ok = confirm(`Clear solves for Person ${currentSession}? This cannot be undone.`);   
 
    if (!ok) return;
    solves = [];
    saveSolves();
    renderSolves();
    renderStats();
    resetTimerDisplay();
  }

  // ----------------------------
  // Stats
  // Best single ever, Ao5, Ao12, Ao100 (simple mean, no trimming)
  // ----------------------------
  
function computeBest() {
  let best = Infinity;
  for (const s of solves) {
    const adj = getAdjustedTimeMs(s);
    if (adj == null) continue;
    best = Math.min(best, adj);
  }
  return Number.isFinite(best) ? best : null;
}


function setPreviewHidden(hidden){
  if (!elScramblePreview || !elTogglePreviewBtn) return;

  elScramblePreview.classList.toggle("hidden", hidden);
  elTogglePreviewBtn.textContent = hidden ? "Show Preview" : "Hide";

  localStorage.setItem(LS_PREVIEW_HIDDEN_KEY, hidden ? "1" : "0");
}

function loadPreviewHiddenSetting(){
  const v = localStorage.getItem(LS_PREVIEW_HIDDEN_KEY);
  return v === "1";
}

function computeOverallAverage() {
  const vals = solves.map(getAdjustedTimeMs).filter(v => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
  

function renderStats() {
  const best = computeBest();
  elStatBest.textContent = best == null ? "—" : formatTime(best);

  // Overall/session average A
  if (elStatA) {
    const a = computeOverallAverage(); // correct function name
    elStatA.textContent = a == null ? "—" : formatTime(a);
  }

  const ao5 = computeWcaAverage(5);
  const ao12 = computeWcaAverage(12);
  const ao100 = computeWcaAverage(100);

  elStatAo5.textContent = ao5 == null ? "—" : (ao5 === "DNF" ? "DNF" : formatTime(ao5));
  elStatAo12.textContent = ao12 == null ? "—" : (ao12 === "DNF" ? "DNF" : formatTime(ao12));
  elStatAo100.textContent = ao100 == null ? "—" : (ao100 === "DNF" ? "DNF" : formatTime(ao100));
}

  // ----------------------------
  // Solve list rendering
  // ----------------------------
function renderSolves() {
  elSolveList.innerHTML = "";

  // If you added a solve count:
  if (typeof elSolveCount !== "undefined" && elSolveCount) {
    elSolveCount.textContent = `(${solves.length})`;
  }

  if (!solves.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No solves yet. Press Space to start.";
    elSolveList.appendChild(empty);
    return;
  }

  for (const s of solves) {
    const item = document.createElement("div");
    item.className = "solve-item";
    item.tabIndex = 0; // helps accessibility + keyboard focus

    // --- TOP ROW (time + badge + delete)
    const top = document.createElement("div");
    top.className = "solve-top";

    const timeEl = document.createElement("div");
    timeEl.className = "solve-time";

    // Use the helper that formats OK/+2/DNF correctly
    const d = formatSolveDisplay(s);

    timeEl.textContent = d.main;
    timeEl.classList.toggle("dnf", d.badge === "DNF");

    // Badge (+2 or DNF)
    


const badgeWrap = document.createElement("div");

// Penalty badge (+2 or DNF)
if (d.badge) {
  const badge = document.createElement("span");
  badge.className = `badge ${d.badge === "DNF" ? "dnf" : "plus2"}`;
  badge.textContent = d.badge;
  badgeWrap.appendChild(badge);
}

// Manual badge
if (s.source === "manual") {
  const m = document.createElement("span");
  m.className = "badge manual";
  m.textContent = "MANUAL";
  badgeWrap.appendChild(m);
}

if (s.note && String(s.note).trim().length > 0) {
  const n = document.createElement("span");
  n.className = "badge note";
  n.textContent = "Quick Note Added";
  n.title = s.note; // hover shows note text
  badgeWrap.appendChild(n);
}

    // Delete button
    const del = document.createElement("button");
    del.className = "solve-del";
    del.type = "button";
    del.title = "Delete solve";
    del.setAttribute("aria-label", "Delete solve");
    del.textContent = "🗑";

    // IMPORTANT: stop click from opening modal when deleting
    del.addEventListener("click", (ev) => {
      ev.stopPropagation();
      deleteSolve(s.id);
    });

    top.appendChild(timeEl);
    top.appendChild(badgeWrap);
    top.appendChild(del);

    // --- META (scramble + timestamp + optional raw time for +2/DNF)
    const meta = document.createElement("div");
    meta.className = "solve-meta";

    const scr = document.createElement("div");
    scr.className = "solve-scramble";
    scr.textContent = s.scramble || "(no scramble)";

    const ts = document.createElement("div");
    ts.className = "solve-ts";
    ts.textContent = formatTimestamp(s.timestampISO || "");

    meta.appendChild(scr);
    meta.appendChild(ts);

    // Optional: show raw time faintly when +2 or DNF
    if (d.sub) {
      const raw = document.createElement("div");
      raw.className = "solve-ts";
      raw.textContent = `Raw: ${d.sub}`;
      meta.appendChild(raw);
    }

    item.appendChild(top);
    item.appendChild(meta);

    // IMPORTANT: clicking the row opens the modal editor
    item.addEventListener("click", () => openSolveModal(s.id));

    elSolveList.appendChild(item);
  }
}

function renderAoDetails(n) {
  if (!elAoList) return;

  const recent = solves.slice(0, n);

  if (recent.length < n) {
    elAoList.innerHTML = `<div class="muted">Need ${n} solves to show Ao${n} details.</div>`;
    return;
  }

  // Compute adjusted time per solve. DNF => Infinity so it can be "worst"
  const rows = recent.map((s, idx) => {
    const adj = getAdjustedTimeMs(s);
    return {
      solve: s,
      idx,
      adjustedMs: adj == null ? Infinity : adj
    };
  });

  // Best = smallest adjusted time (ignores DNF because that's Infinity)
  const best = rows.reduce((min, r) => (r.adjustedMs < min.adjustedMs ? r : min), rows[0]);

  // Worst = largest adjusted time (DNF becomes Infinity and will win)
  const worst = rows.reduce((max, r) => (r.adjustedMs > max.adjustedMs ? r : max), rows[0]);

  // Render list
  elAoList.innerHTML = "";
  rows.forEach(r => {
    const s = r.solve;

    // Display time text with penalties respected
    let timeText = "";
    if (normalizePenalty(s.penalty) === "DNF" || r.adjustedMs === Infinity) {
      timeText = "DNF";
    } else {
      timeText = formatTime(r.adjustedMs);
    }

    // Optional: show penalty badge text
    const p = normalizePenalty(s.penalty);
    const penaltyText = (p === "OK") ? "" : p;

    const div = document.createElement("div");
    div.className = "ao-row";
    if (r.solve.id === best.solve.id) div.classList.add("best");
    if (r.solve.id === worst.solve.id) div.classList.add("worst");

    div.innerHTML = `
      <div class="ao-left">
        <div class="ao-time">${timeText} ${penaltyText ? `<span class="badge ${p === "DNF" ? "dnf" : "plus2"}">${penaltyText}</span>` : ""}</div>
        <div class="ao-meta">${escapeHtml(s.scramble || "")}</div>
        <div class="ao-meta">${escapeHtml(formatTimestamp(s.timestampISO || ""))}</div>
      </div>
      <div class="muted">#${r.idx + 1}</div>
    `;

    elAoList.appendChild(div);
  });
}
    
function openAoModal() {
  if (!elAoModal) return;
  renderAoDetails(5);
  elAoModal.classList.add("show");
  elAoModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeAoModal() {
  if (!elAoModal) return;
  elAoModal.classList.remove("show");
  elAoModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

  // ----------------------------
  // CFOP Manual (Overview + Full OLL/PLL)
  // ----------------------------

  // Embedded fallback placeholder data (matches cfop-data.json shape)
  const EMBEDDED_CFOP_FALLBACK = {
    oll: [
      { "id": "OLL-01", "name": "Sune", "alg": "R U R' U R U2 R'" },
    { "id": "OLL-02", "name": "Anti Sune", "alg": "R U2 R' U' R U' R'" },
    { "id": "OLL-03", "name": "Cross Solved", "alg": "R U R' U R U' R' U R U2 R'" },
    { "id": "OLL-04", "name": "Cross Solved", "alg": "R U2 R2' U' R2 U' R2 U2 R" },
    { "id": "OLL-05", "name": "Cross Solved", "alg": "R2 D' R U' R' D R U R" },
    { "id": "OLL-06", "name": "Cross Solved", "alg": "R U R D R' U' R D' R2" },
    { "id": "OLL-07", "name": "Cross Solved", "alg": "R2 D R' U2 R D' R' U2 R'" },
    { "id": "OLL-08", "name": "T Shape", "alg": "R U R' U' R' F R F'" },
    { "id": "OLL-09", "name": "T Shape", "alg": "F R U R' U' F'" },
    { "id": "OLL-10", "name": "Block Shape", "alg": "r U2 R' U' R U' r'" },
    { "id": "OLL-11", "name": "Block Shape", "alg": "r' U2' R U R' U r" },
    { "id": "OLL-12", "name": "Edges Only", "alg": "r U R' U' M U R U' R'" },
    { "id": "OLL-13", "name": "Edges Only", "alg": "R U R' U' M' U R U' r'" },
    { "id": "OLL-14", "name": "Lightning Shape", "alg": "r U R' U R U2 r'" },
    { "id": "OLL-15", "name": "Lightning Shape", "alg": "R' F' r U' r' F2 R" },
    { "id": "OLL-16", "name": "Lightning Shape", "alg": "r' R2 U R' U R U2 R' U M'" },
    { "id": "OLL-17", "name": "Lightning Shape", "alg": "r R2' U' R U' R' U2 R U' M" },
    { "id": "OLL-18", "name": "Line Shape", "alg": "f R' F' R U R U R U' R S'" },
    { "id": "OLL-19", "name": "Line Shape", "alg": "f' r U r' U' r' F r S" },
    { "id": "OLL-20", "name": "P Shape", "alg": "f R U R' U' f'" },
    { "id": "OLL-21", "name": "P Shape", "alg": "R' U' F' U F R" },
    { "id": "OLL-22", "name": "P Shape", "alg": "S R U R' U' R' F R F'" },
    { "id": "OLL-23", "name": "P Shape", "alg": "R' U' F U R U' R' F' R" },
    { "id": "OLL-24", "name": "C Shape", "alg": "R' U' R' F R F' U R" },
    { "id": "OLL-25", "name": "C Shape", "alg": "f R f' U' r' U' R U M'" },
    { "id": "OLL-26", "name": "Fish Shape", "alg": "F R U' R' U' R U R' F'" },
    { "id": "OLL-27", "name": "Fish Shape", "alg": "R U2 R2 F R F' R U2 R'" },
    { "id": "OLL-28", "name": "Hook Shape", "alg": "R U R' U' R' F R2 U R' U' F'" },
    { "id": "OLL-29", "name": "Hook Shape", "alg": "R U R' U R' F R F' R U2 R'" },
    { "id": "OLL-30", "name": "W Shape", "alg": "R U R' U R U' R' U' R' F R F'" },
    { "id": "OLL-31", "name": "W Shape", "alg": "L' U' L U' L' U L U r U' r' F" },
    { "id": "OLL-32", "name": "Hook Shape", "alg": "F R U R' U' R U R' U' F'" },
    { "id": "OLL-33", "name": "Hook Shape", "alg": "F R' F' R U2 R U' R' U R U2 R'" },
    { "id": "OLL-34", "name": "Hook Shape", "alg": "r U R' U R U' R' U R U2 r'" },
    { "id": "OLL-35", "name": "Hook Shape", "alg": "r' U' R U' R' U R U' R' U2 r" },
    { "id": "OLL-36", "name": "Hook Shape", "alg": "r U' r2' U r2 U r2' U' r" },
    { "id": "OLL-37", "name": "Hook Shape", "alg": "r' U r2 U' r2 U' r2 U r'" },
    { "id": "OLL-38", "name": "Line Shape", "alg": "f R U R' U' R U R' U' f" },
    { "id": "OLL-39", "name": "Line Shape", "alg": "R' F' U' F U' R U R' U R" },
    { "id": "OLL-40", "name": "Line Shape", "alg": "r U r' U R U' R'U R U' R' r U' r'" },
    { "id": "OLL-41", "name": "Line Shape", "alg": "R' F R U R U' R2 F' R2 U' R' U R U R'" },
    { "id": "OLL-42", "name": "L Shape", "alg": "r U r' R U R' U' r U' r'" },
    { "id": "OLL-43", "name": "L Shape", "alg": "R' F' R L' U' L U R' F R" },
    { "id": "OLL-44", "name": "L Shape", "alg": "F U R U' R2 F' R U R U' R'" },
    { "id": "OLL-45", "name": "L Shape", "alg": "R' F R U R' F' R F U' F'" },
    { "id": "OLL-46", "name": "Awkward Shape", "alg": "r2 D' r U r' D r2 U' r U' r" },
    { "id": "OLL-47", "name": "Awkward Shape", "alg": "F U R U2 R' U' R U2 R' U' F'" },
    { "id": "OLL-48", "name": "Awkward Shape", "alg": "R U R' U R U2 R' F R U R' U' F'" },
    { "id": "OLL-49", "name": "Awkward Shape", "alg": "R' U' F2 u' R U R' D R2 B" },
    { "id": "OLL-50", "name": "Dot Shape", "alg": "R U2 R2 F R F' U2 R' F R F'" },
    { "id": "OLL-51", "name": "Dot Shape", "alg": "f U R U' R' S' U R U' R' F'" },
    { "id": "OLL-52", "name": "Dot Shape", "alg": "F R' F' R U S' R U' R' S" },
    { "id": "OLL-53", "name": "Dot Shape", "alg": "S' R U R' S U' R' F R F'" },
    { "id": "OLL-54", "name": "Dot Shape", "alg": "S' R U R' S U' R' F R F'" },
    { "id": "OLL-55", "name": "Dot Shape", "alg": "r U R' U R U2 r2 U' R U' R U' R' U2 r" },
    { "id": "OLL-56", "name": "Dot Shape", "alg": "R' F2 R2 U2 R' F' R U2 R2 F2 R" },
    { "id": "OLL-57", "name": "Dot Shape", "alg": "R' F2 R2 U2 R' F R U2 R2 F2 R" }

    ],
    pll: [
       { "id": "PLL-Aa", "name": "Aa Perm", "alg": "x R' U R' D2 R U' R' D2 R2 x'" },
    { "id": "PLL-Ab", "name": "Ab Perm", "alg": "R2' D2 R U R' D2 R U' R" },
    { "id": "PLL-E", "name": "E Perm", "alg": "x' R U' R' D R U R' D' R U R' D R U' R' D' x" },
    { "id": "PLL-F", "name": "F Perm", "alg": "R' U' F' R U R' U' R' F R2 U' R' U' R U R'U R" },
    { "id": "PLL-Ga", "name": "Ga Perm", "alg": "R2 U R' U R' U' R U' R2 D U' R' U R D'" },
    { "id": "PLL-Gb", "name": "Gb Perm", "alg": "D R' U' R D' U R2 U R' U R U' R U' R2" },
    { "id": "PLL-Gc", "name": "Gc Perm", "alg": "R2 U' R U' R U R' U R2 D' U R U' R' D" },
    { "id": "PLL-Gd", "name": "Gd Perm", "alg": "R U R' U' D R2 U' R U' R' U R' U R2 D'" },
    { "id": "PLL-H", "name": "H Perm", "alg": "M2 U' M2 U2 M2 U' M2" },
    { "id": "PLL-Ja", "name": "Ja Perm", "alg": "x R2 F R F' R U2 r' U r U2 x'" },
    { "id": "PLL-Jb", "name": "Jb Perm", "alg": "R U R' F' R U R' U' R' F R2 U' R'" },
    { "id": "PLL-Na", "name": "Na Perm", "alg": "R U R' U R U R' F'R U R' U' R' F R2 U' R' U2 R U' R'" },
    { "id": "PLL-Nb", "name": "Nb Perm", "alg": "R' U R U' R' F' U' F R U R' U' R U' f R f'" },
    { "id": "PLL-Ra", "name": "Ra Perm", "alg": "R U' R' U' R U R D R' U' R D' R' U2 R'" },
    { "id": "PLL-Rb", "name": "Rb Perm", "alg": "R' U2 R U2 R' F R U R' U' R' F' R2" },
    { "id": "PLL-T", "name": "T Perm", "alg": "R U R' U' R' F R2 U' R' U'R U R' F'" },
    { "id": "PLL-Ua", "name": "Ua Perm", "alg": "R U R' U R' U'R2 U' R' U R' U R" },
    { "id": "PLL-Ub", "name": "Ub Perm", "alg": "R'U R' U' R' U' R' U R U R2" },
    { "id": "PLL-V", "name": "V Perm", "alg": "R' U R' U' R D' R' D R' D' U R2 U' R2 D R2" },
    { "id": "PLL-Y", "name": "Y Perm", "alg": "F R U' R' U' R U R' F' R U R' U' R' F R F'" },
    { "id": "PLL-Z", "name": "Z Perm", "alg": "M' U' M2 U' M2 U' M' U2 M2" }
    ]
  };

  function setActiveTab(view) {
    elTabs.forEach(t => {
      const isActive = t.dataset.view === view;
      t.classList.toggle("active", isActive);
      t.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  function renderCfopOverview() {
    setActiveTab("overview");
    elCfopContent.innerHTML = `
      <h3>What is CFOP?</h3>
      <p>
        CFOP is a common 3×3 solving method: <strong>Cross</strong> → <strong>F2L</strong> → <strong>OLL</strong> → <strong>PLL</strong>.
        Use this panel as a reference. 
      </p>

      <h3>Stages</h3>
      <ul>
        <li><strong>Cross</strong>: Build a cross on the first layer.</li>
        <li><strong>F2L</strong>: Insert corner/edge pairs to complete the first two layers.</li>
        <li><strong>OLL</strong>: Orient the last layer (make the top all one color).</li>
        <li><strong>PLL</strong>: Permute the last layer (solve the final pieces).</li>
      </ul>

      <div class="cfop-actions">
        <button id="openOllRefBtn" class="btn" type="button">Open full OLL reference</button>
        <button id="openPllRefBtn" class="btn" type="button">Open full PLL reference</button>
      </div>
    `;

    const openOll = document.getElementById("openOllRefBtn");
    const openPll = document.getElementById("openPllRefBtn");
    if (openOll) openOll.addEventListener("click", () => openReference("oll"));
    if (openPll) openPll.addEventListener("click", () => openReference("pll"));
  }


function computeWcaAverage(n){
  if (solves.length < n) return null;

  const recent = solves.slice(0, n);

  // Build list where DNF => Infinity so it sorts as worst
  const values = recent.map(s => {
    const adj = getAdjustedTimeMs(s);
    return adj == null ? Infinity : adj;
  });

  // WCA trimming rules:
  // Ao5/Ao12 => trim 1 best & 1 worst
  // Ao100 => trim 5 best & 5 worst
  const trim = (n === 100) ? 5 : 1;

  // Sort ascending (best first, worst last)
  values.sort((a,b) => a - b);

  // Trim requires enough solves
  if (n < (trim*2 + 1)) return null;

  const trimmed = values.slice(trim, values.length - trim);

  // If any Infinity remains after trimming => DNF
  if (trimmed.some(v => !Number.isFinite(v))) return "DNF";

  const sum = trimmed.reduce((acc, v) => acc + v, 0);
  return sum / trimmed.length;
}

  function renderCfopQuick(view) {
    // Quick view inside side panel (shows a small list + button to open full reference)
    setActiveTab(view);

    const list = (cfopData && Array.isArray(cfopData[view])) ? cfopData[view] : [];
    const title = view.toUpperCase();
    const preview = list.slice(0, 5);

    const rows = preview.map(entry => `
      <li>
        <strong>${escapeHtml(entry.id)}</strong> — ${escapeHtml(entry.name)}
      </li>
    `).join("");

    elCfopContent.innerHTML = `
      <h3>${title} (preview)</h3>
      <p>
        Showing a small preview. Click below for the full ${title} reference.
      </p>
      <ul>${rows || "<li class='muted'>No entries loaded.</li>"}</ul>

      <div class="cfop-actions">
        <button id="openFullRefBtn" class="btn" type="button">Open full ${title} reference</button>
      </div>
    `;

    const btn = document.getElementById("openFullRefBtn");
    if (btn) btn.addEventListener("click", () => openReference(view));
  }

  function openReference(view) {
    const list = (cfopData && Array.isArray(cfopData[view])) ? cfopData[view] : [];
    const title = view === "oll" ? "OLL Reference" : "PLL Reference";

    elOverlayTitle.textContent = title;
    elOverlayContent.innerHTML = `
      <div class="muted" style="margin-bottom:10px;">
        Placeholder algorithms are shown. Edit <code>cfop-data.json</code> to replace them with your own.
      </div>
      <div class="ref-grid">
        ${list.map(renderRefCard).join("")}
      </div>
    `;

    // Attach copy handlers
    elOverlayContent.querySelectorAll("[data-copy-alg]").forEach(btn => {
      btn.addEventListener("click", () => {
        const alg = btn.getAttribute("data-copy-alg") || "";
        copyToClipboard(alg);
      });
    });

    showOverlay(true);
  }

  function showOverlay(show) {
    if (show) {
      elOverlay.classList.add("show");
      elOverlay.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden"; // prevent background scroll
    } else {
      elOverlay.classList.remove("show");
      elOverlay.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }
  }

  function renderRefCard(entry) {
    const id = escapeHtml(entry.id || "");
    const name = escapeHtml(entry.name || "");
    const alg = escapeHtml(entry.alg || "");
    // Store raw (unescaped) alg in data attribute for copying
    const rawAlg = (entry.alg || "").replace(/"/g, "&quot;");
    return `
      <div class="ref-item">
        <div class="ref-head">
          <div>
            <div class="ref-id">${id}</div>
            <div class="ref-name">${name}</div>
          </div>
          <button class="copy-mini" type="button" data-copy-alg="${rawAlg}">Copy</button>
        </div>
        <div class="ref-alg">${alg}</div>
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function loadCfopData() {
    // Try to fetch local file first
    try {
      const res = await fetch("./cfop-data.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      validateCfopData(data);
      cfopData = data;
      elCfopLoadNote.textContent = "Loaded cfop-data.json automatically.";
      return;
    } catch (err) {
      // Fallback to embedded data
      cfopData = EMBEDDED_CFOP_FALLBACK;
     // elCfopLoadNote.textContent =
        "Auto-load may be blocked when opened as a local file. Using built-in placeholders. " +
        "You can still load cfop-data.json using the button above.";
    }
  }

  function validateCfopData(data) {
    // Minimal validation to keep UI stable
    if (!data || typeof data !== "object") throw new Error("Invalid JSON");
    if (!Array.isArray(data.oll) || !Array.isArray(data.pll)) throw new Error("Expected {oll:[], pll:[]}");
  }

  function handleCfopFileInput(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || ""));
        validateCfopData(data);
        cfopData = data;
        toast("CFOP JSON loaded");
        elCfopLoadNote.textContent = "Loaded CFOP data from selected file.";
        // Re-render current view
        const active = document.querySelector(".tab.active")?.dataset.view || "overview";
        if (active === "overview") renderCfopOverview();
        else renderCfopQuick(active);
      } catch (e) {
        alert("Could not load JSON. Make sure it matches the required format (oll/pll arrays).");
      }
    };
    reader.readAsText(file);
  }

  // ----------------------------
  // Event wiring
  // ----------------------------
  function onKeyDown(e) {
    // Spacebar toggles timer
    // - prevent page scrolling
    // - ignore repeats
    // - ignore if focused in a form control
    if (e.code !== "Space") return;

    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
    const isTyping = tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable;
    if (isTyping) return;

    if (e.repeat) return;
    e.preventDefault();
    toggleTimer();
  }

  function wireEvents() {
    document.addEventListener("keydown", onKeyDown, { passive: false });


if (elTimerWrap) {
  elTimerWrap.addEventListener("pointerdown", onTimerPointerDown, { passive: false });
  elTimerWrap.addEventListener("pointerup", onTimerPointerUp, { passive: false });
  elTimerWrap.addEventListener("pointercancel", onTimerPointerCancel);
  elTimerWrap.addEventListener("pointerleave", onTimerPointerCancel);
}

    elNewScrambleBtn.addEventListener("click", () => newScramble());
    elCopyScrambleBtn.addEventListener("click", () => copyToClipboard(scramble));

    elClearSolvesBtn.addEventListener("click", clearSolves);

window.addEventListener("resize", resizeFireworksCanvas);

// Ao5 click -> open details modal
if (elAo5Tile) {
  elAo5Tile.addEventListener("click", openAoModal);
} else if (elStatAo5) {
  // fallback if tile not found
  elStatAo5.addEventListener("click", openAoModal);
}

// Ao modal close
if (elAoModalClose) elAoModalClose.addEventListener("click", closeAoModal);
if (elAoModal) {
  elAoModal.addEventListener("click", (e) => {
    if (e.target?.dataset?.close === "true") closeAoModal();
  });
}

// Esc closes Ao modal
document.addEventListener("keydown", (e) => {
  if (elAoModal?.classList.contains("show") && e.key === "Escape") {
    e.preventDefault();
    closeAoModal();
  }
});

// Modal close buttons/backdrop
if (elSolveModalClose) elSolveModalClose.addEventListener("click", closeSolveModal);
if (elSolveModal) {
  elSolveModal.addEventListener("click", (e) => {
    if (e.target?.dataset?.close === "true") closeSolveModal();
  });
}

if (elModalSaveNoteBtn) {
  elModalSaveNoteBtn.addEventListener("click", () => {
    if (!activeSolveId) return;
    setSolveNote(activeSolveId, elModalQuickNote ? elModalQuickNote.value : "");
  });
}

if (elTogglePreviewBtn) {
  elTogglePreviewBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = elScramblePreview?.classList.contains("hidden");
    setPreviewHidden(!isHidden);
  });
}

if (elPenaltyOK) elPenaltyOK.addEventListener("click", () => activeSolveId && setSolvePenalty(activeSolveId, "OK"));
if (elPenaltyP2) elPenaltyP2.addEventListener("click", () => activeSolveId && setSolvePenalty(activeSolveId, "+2"));
if (elPenaltyDNF) elPenaltyDNF.addEventListener("click", () => activeSolveId && setSolvePenalty(activeSolveId, "DNF"));

// Manual time modal open
if (elAddManualBtn) {
  elAddManualBtn.addEventListener("click", openManualModal);
}

// Manual modal close/backdrop
if (elManualModalClose) elManualModalClose.addEventListener("click", closeManualModal);
if (elManualCancelBtn) elManualCancelBtn.addEventListener("click", closeManualModal);

if (elManualModal) {
  elManualModal.addEventListener("click", (e) => {
    if (e.target?.dataset?.close === "true") closeManualModal();
  });
}

// Manual penalty buttons
if (elManualPenaltyOK) elManualPenaltyOK.addEventListener("click", () => { manualPenalty = "OK"; updateManualPenaltyButtons(); });
if (elManualPenaltyP2) elManualPenaltyP2.addEventListener("click", () => { manualPenalty = "+2"; updateManualPenaltyButtons(); });
if (elManualPenaltyDNF) elManualPenaltyDNF.addEventListener("click", () => { manualPenalty = "DNF"; updateManualPenaltyButtons(); });

// Save manual solve
if (elManualSaveBtn) elManualSaveBtn.addEventListener("click", saveManualSolve);

// Enter key to save while focused in time input (nice UX)
if (elManualTimeInput) {
  elManualTimeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveManualSolve();
    }
  });
}

// IMPORTANT: While manual modal is open, prevent Spacebar from starting timer
document.addEventListener("keydown", (e) => {
  if (elManualModal?.classList.contains("show")) {
    if (e.code === "Space") e.preventDefault();
    if (e.key === "Escape") closeManualModal();
  }
});

if (elModalDeleteSolve) {
  elModalDeleteSolve.addEventListener("click", () => {
    if (!activeSolveId) return;
    deleteSolve(activeSolveId);
    closeSolveModal();
  });


}

// Keyboard shortcuts ONLY while modal is open
document.addEventListener("keydown", (e) => {
  if (!elSolveModal?.classList.contains("show")) return;

  // ✅ IMPORTANT: If user is typing in an input/textarea, ignore shortcuts
  const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
  const isTyping = tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable;
  if (isTyping) return;

  // Don't steal Space from timer (and don't scroll)
  if (e.code === "Space") return;

  const k = e.key.toLowerCase();

  if (k === "escape") {
    e.preventDefault();
    closeSolveModal();
    return;
  }

  if (!activeSolveId) return;

  if (k === "2") {
    e.preventDefault();
    setSolvePenalty(activeSolveId, "+2");
  } else if (k === "d") {
    e.preventDefault();
    setSolvePenalty(activeSolveId, "DNF");
  } else if (k === "o" || k === "0") {
    e.preventDefault();
    setSolvePenalty(activeSolveId, "OK");
  }
});
if (elSessionSelect) {
  elSessionSelect.addEventListener("change", (e) => {
    const to = Number(e.target.value);
    if (to >= 1 && to <= 5) switchSession(to);
  });
}


    // CFOP tabs
    elTabs.forEach(tab => {
      tab.addEventListener("click", () => {
        const view = tab.dataset.view;
        if (view === "overview") renderCfopOverview();
        else renderCfopQuick(view);
      });
    });

    // Overlay
    elOverlayCloseBtn.addEventListener("click", () => showOverlay(false));
    elOverlay.addEventListener("click", (e) => {
      // Close if clicking backdrop
      if (e.target === elOverlay) showOverlay(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && elOverlay.classList.contains("show")) showOverlay(false);
    });

    // Mobile collapse toggle
    elCfopCollapseBtn.addEventListener("click", () => {
      const isHidden = elCfopBody.style.display === "none";
      elCfopBody.style.display = isHidden ? "" : "none";
      elCfopCollapseBtn.textContent = isHidden ? "Collapse" : "Expand";
      elCfopCollapseBtn.setAttribute("aria-expanded", isHidden ? "true" : "false");
    });

    // File picker for CFOP JSON
    elCfopFileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      handleCfopFileInput(file);
      // allow re-selecting same file
      e.target.value = "";
    });
  }

  // ----------------------------
  // Init
  // ----------------------------
  async function init() {
   

loadCurrentSession();
if (elSessionSelect) elSessionSelect.value = String(currentSession);


 loadSolves();
    renderSolves();
    renderStats();

    newScramble();
    resetTimerDisplay();

buildCubeNet();
renderScramblePreview(scramble);
setPreviewHidden(loadPreviewHiddenSetting());


    await loadCfopData();
    renderCfopOverview();

    wireEvents();
  }

function loadCurrentSession() {
  const raw = localStorage.getItem(LS_CURRENT_SESSION_KEY);
  const n = Number(raw);
  currentSession = Number.isFinite(n) && n >= 1 && n <= 5 ? n : 1;
}

function saveCurrentSession() {
  localStorage.setItem(LS_CURRENT_SESSION_KEY, String(currentSession));
}

function switchSession(toSession) {
  // Don’t allow switching while timer/inspection is running
  if (typeof timerRunning !== "undefined" && timerRunning) {
    alert("Stop the timer before switching person/session.");
    return;
  }
  if (typeof inspecting !== "undefined" && inspecting) {
    alert("Finish inspection before switching person/session.");
    return;
  }

  currentSession = toSession;
  saveCurrentSession();

  loadSolves();
  renderSolves();
  renderStats();
  if (typeof resetTimerDisplay === "function") resetTimerDisplay();
}

  init();
})();