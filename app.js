// Football Stats App con AWS Rekognition + Tesseract.js fallback
const API_BASE = '/api';
const $ = (sel) => document.querySelector(sel);

const screens = { camera: null, search: null, stats: null, match: null, ocr: null };
let currentScreen = 'camera';
let searchTimeout = null;
let ocrWorker = null;
let cameraReady = false;

// --- Navigation ---
function showScreen(name) {
  Object.values(screens).forEach(s => s && s.classList.remove('active'));
  screens[name].classList.add('active');
  currentScreen = name;
}

function showLoading(show, msg) {
  const el = $('#loading');
  el.classList.toggle('hidden', !show);
  if (msg) el.querySelector('p').textContent = msg;
}

// --- Team aliases para matching (con IDs de football-data.org) ---
const TEAM_DB = {
  'real madrid': { name: 'Real Madrid', id: 86 },
  'r madrid': { name: 'Real Madrid', id: 86 },
  'rma': { name: 'Real Madrid', id: 86 },
  'barcelona': { name: 'Barcelona', id: 81 },
  'barca': { name: 'Barcelona', id: 81 },
  'fcb': { name: 'Barcelona', id: 81 },
  'bar': { name: 'Barcelona', id: 81 },
  'atletico': { name: 'Atlético Madrid', id: 5529 },
  'atl madrid': { name: 'Atlético Madrid', id: 5529 },
  'atm': { name: 'Atlético Madrid', id: 5529 },
  'manchester city': { name: 'Manchester City', id: 65 },
  'man city': { name: 'Manchester City', id: 65 },
  'mci': { name: 'Manchester City', id: 65 },
  'manchester united': { name: 'Manchester United', id: 66 },
  'man united': { name: 'Manchester United', id: 66 },
  'man utd': { name: 'Manchester United', id: 66 },
  'mun': { name: 'Manchester United', id: 66 },
  'liverpool': { name: 'Liverpool', id: 64 },
  'liv': { name: 'Liverpool', id: 64 },
  'lfc': { name: 'Liverpool', id: 64 },
  'arsenal': { name: 'Arsenal', id: 57 },
  'ars': { name: 'Arsenal', id: 57 },
  'chelsea': { name: 'Chelsea', id: 61 },
  'che': { name: 'Chelsea', id: 61 },
  'bayern': { name: 'Bayern Munich', id: 5 },
  'bayern munich': { name: 'Bayern Munich', id: 5 },
  'dortmund': { name: 'Borussia Dortmund', id: 4 },
  'borussia': { name: 'Borussia Dortmund', id: 4 },
  'bvb': { name: 'Borussia Dortmund', id: 4 },
  'psg': { name: 'PSG', id: 524 },
  'paris': { name: 'PSG', id: 524 },
  'paris saint': { name: 'PSG', id: 524 },
  'inter': { name: 'Inter Milan', id: 108 },
  'inter milan': { name: 'Inter Milan', id: 108 },
  'internazionale': { name: 'Inter Milan', id: 108 },
  'ac milan': { name: 'AC Milan', id: 98 },
  'milan': { name: 'AC Milan', id: 98 },
  'juventus': { name: 'Juventus', id: 109 },
  'juve': { name: 'Juventus', id: 109 },
  'napoli': { name: 'Napoli', id: 113 },
  'tottenham': { name: 'Tottenham', id: 73 },
  'spurs': { name: 'Tottenham', id: 73 },
  'real sociedad': { name: 'Real Sociedad', id: 92 },
  'villarreal': { name: 'Villarreal', id: 94 },
  'sevilla': { name: 'Sevilla', id: 559 },
  'betis': { name: 'Real Betis', id: 90 },
  'real betis': { name: 'Real Betis', id: 90 },
  'valencia': { name: 'Valencia', id: 95 },
  // --- Liga MX (usan TheSportsDB, prefijo 'tsdb:') ---
  'america': { name: 'América', id: 'tsdb:134193' },
  'américa': { name: 'América', id: 'tsdb:134193' },
  'ame': { name: 'América', id: 'tsdb:134193' },
  'aguilas': { name: 'América', id: 'tsdb:134193' },
  'águilas': { name: 'América', id: 'tsdb:134193' },
  'chivas': { name: 'Guadalajara', id: 'tsdb:134206' },
  'guadalajara': { name: 'Guadalajara', id: 'tsdb:134206' },
  'gdl': { name: 'Guadalajara', id: 'tsdb:134206' },
  'cruz azul': { name: 'Cruz Azul', id: 'tsdb:134196' },
  'caz': { name: 'Cruz Azul', id: 'tsdb:134196' },
  'monterrey': { name: 'Monterrey', id: 'tsdb:134198' },
  'rayados': { name: 'Monterrey', id: 'tsdb:134198' },
  'mty': { name: 'Monterrey', id: 'tsdb:134198' },
  'tigres': { name: 'Tigres UANL', id: 'tsdb:134197' },
  'uanl': { name: 'Tigres UANL', id: 'tsdb:134197' },
  'pumas': { name: 'Pumas UNAM', id: 'tsdb:134201' },
  'unam': { name: 'Pumas UNAM', id: 'tsdb:134201' },
  'toluca': { name: 'Toluca', id: 'tsdb:134204' },
  'tol': { name: 'Toluca', id: 'tsdb:134204' },
  'santos': { name: 'Santos Laguna', id: 'tsdb:134192' },
  'santos laguna': { name: 'Santos Laguna', id: 'tsdb:134192' },
  'leon': { name: 'León', id: 'tsdb:134207' },
  'león': { name: 'León', id: 'tsdb:134207' },
  'pachuca': { name: 'Pachuca', id: 'tsdb:134191' },
  'tuzos': { name: 'Pachuca', id: 'tsdb:134191' },
  'atlas': { name: 'Atlas', id: 'tsdb:134195' },
  'necaxa': { name: 'Necaxa', id: 'tsdb:135662' },
  'puebla': { name: 'Puebla', id: 'tsdb:134199' },
  'queretaro': { name: 'Querétaro', id: 'tsdb:134194' },
  'querétaro': { name: 'Querétaro', id: 'tsdb:134194' },
  'tijuana': { name: 'Tijuana', id: 'tsdb:134202' },
  'xolos': { name: 'Tijuana', id: 'tsdb:134202' },
  'juarez': { name: 'Juárez', id: 'tsdb:136855' },
  'juárez': { name: 'Juárez', id: 'tsdb:136855' },
};

function findTeamInText(text) {
  const lower = text.toLowerCase().replace(/[^a-záéíóúñü0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const found = [];
  const sorted = Object.keys(TEAM_DB).sort((a, b) => b.length - a.length);
  for (const alias of sorted) {
    if (lower.includes(alias)) {
      const entry = TEAM_DB[alias];
      if (!found.find(f => f.name === entry.name)) found.push(entry);
    }
  }
  return found;
}

// --- AWS Rekognition ---
async function analyzeWithRekognition(canvas) {
  showLoading(true, '🔍 Analizando con AWS Rekognition...');
  try {
    // Convertir canvas a base64 raw (sin el prefijo data:image)
    const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

    const res = await fetch('/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64 }),
    });
    const data = await res.json();

    if (data.error === 'no_key') return null; // Fallback a Tesseract
    if (data.error) { console.error('Rekognition:', data.error); return null; }

    const teams = [];

    // 1. Texto detectado por Rekognition (muy preciso)
    if (data.textDetections) {
      const lines = data.textDetections
        .filter(t => t.Type === 'LINE')
        .map(t => t.DetectedText);
      const allText = lines.join(' ');
      findTeamInText(allText).forEach(t => { if (!teams.find(x => x.name === t.name)) teams.push(t); });
    }

    // 2. Labels (ej: "Soccer", "Football", "Sports Jersey")
    const labelNames = (data.labels || []).map(l => l.Name);

    return {
      teams,
      textLines: (data.textDetections || []).filter(t => t.Type === 'LINE').map(t => t.DetectedText),
      labels: labelNames,
      method: 'rekognition',
    };
  } catch (err) {
    console.error('Rekognition error:', err);
    return null;
  }
}

// --- Tesseract OCR (fallback) ---
async function initOCR() {
  try {
    ocrWorker = await Tesseract.createWorker('eng+spa', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          showLoading(true, `OCR local: ${Math.round(m.progress * 100)}%`);
        }
      }
    });
  } catch (err) { console.error('OCR init error:', err); }
}

async function analyzeWithTesseract(canvas) {
  showLoading(true, 'Analizando con OCR local...');
  if (!ocrWorker) {
    showLoading(true, 'Iniciando motor OCR...');
    await initOCR();
  }

  const teams = [];
  let allText = '';

  // Analizar regiones donde suele estar el marcador
  const regions = [
    { name: 'top', y: 0, h: Math.floor(canvas.height * 0.2) },
    { name: 'bottom', y: Math.floor(canvas.height * 0.8), h: Math.floor(canvas.height * 0.2) },
    { name: 'full', y: 0, h: canvas.height },
  ];

  for (const region of regions) {
    const rc = document.createElement('canvas');
    rc.width = canvas.width;
    rc.height = region.h;
    const ctx = rc.getContext('2d');
    ctx.filter = 'contrast(1.5) brightness(1.1)';
    ctx.drawImage(canvas, 0, region.y, canvas.width, region.h, 0, 0, canvas.width, region.h);

    try {
      const result = await ocrWorker.recognize(rc);
      allText += result.data.text + ' ';
      findTeamInText(result.data.text).forEach(t => { if (!teams.find(x => x.name === t.name)) teams.push(t); });
      if (teams.length >= 2) break;
    } catch (err) { console.error(`OCR [${region.name}]:`, err); }
  }

  return { teams, textLines: [allText.trim()], labels: [], method: 'tesseract' };
}

// --- Capture & Process ---
async function processCapture() {
  if (!cameraReady) { $('#file-input').click(); return; }
  const video = $('#camera');
  const canvas = $('#capture-canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  await processImage(canvas);
}

function processImageFromFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = async () => {
      const canvas = $('#capture-canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      await processImage(canvas);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function processImage(canvas) {
  // Intentar Rekognition primero, luego Tesseract como fallback
  let result = await analyzeWithRekognition(canvas);
  if (!result) {
    result = await analyzeWithTesseract(canvas);
  }

  showLoading(false);
  showOCRResults(result, canvas.toDataURL('image/jpeg', 0.7));
}

function showOCRResults(result, imageData) {
  showScreen('ocr');
  const { teams, textLines, labels, method } = result;
  const methodLabel = method === 'rekognition' ? '🟢 AWS Rekognition' : '🟡 OCR Local';

  let html = `<div style="padding:12px">`;

  // 1. Resultado del reconocimiento PRIMERO (visible sin scroll)
  if (teams.length >= 2) {
    html += `
      <div style="background:#0a2a1a;border:1px solid #00ff88;border-radius:10px;padding:14px;margin-bottom:10px;text-align:center">
        <p style="font-size:12px;color:#00ff88;margin-bottom:6px">🏟️ Partido detectado</p>
        <p style="font-size:20px;font-weight:700;margin-bottom:10px">${teams[0].name} vs ${teams[1].name}</p>
        <button onclick="loadTeamStats('${teams[0].id}')" class="btn-action" style="margin:3px;font-size:13px">📊 ${teams[0].name}</button>
        <button onclick="loadTeamStats('${teams[1].id}')" class="btn-action" style="margin:3px;font-size:13px">📊 ${teams[1].name}</button>
      </div>`;
  } else if (teams.length === 1) {
    html += `
      <div style="background:#0a2a1a;border:1px solid #00ff88;border-radius:10px;padding:14px;margin-bottom:10px;text-align:center">
        <p style="color:#00ff88;font-size:13px;margin-bottom:6px">⚽ Equipo detectado</p>
        <p style="font-size:20px;font-weight:700;margin-bottom:10px">${teams[0].name}</p>
        <button onclick="loadTeamStats('${teams[0].id}')" class="btn-action" style="font-size:13px">📊 Ver estadísticas</button>
      </div>`;
  } else {
    html += `
      <div style="background:#2a1a0a;border:1px solid #ff8800;border-radius:10px;padding:14px;margin-bottom:10px">
        <p style="color:#ff8800;font-size:13px">🔍 No se detectaron equipos</p>
        <p style="color:#888;font-size:12px;margin-top:6px">Intenta enfocar el marcador de la transmisión o acercar más la cámara al texto.</p>
        <button onclick="showScreen('camera')" class="btn-action" style="margin-top:10px;width:100%">📸 Volver a intentar</button>
      </div>`;
  }

  // 2. Imagen capturada pequeña
  html += `<img src="${imageData}" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px;margin-bottom:6px" alt="Captura">
    <p style="font-size:10px;color:#555;text-align:center;margin-bottom:8px">Analizado con: ${methodLabel}</p>`;

  // 3. Detalles colapsados al final
  if (labels.length > 0) {
    html += `<details style="margin-top:4px"><summary style="color:#555;font-size:11px;cursor:pointer">Labels detectados</summary>
      <p style="color:#666;font-size:11px;margin-top:4px;background:#111;padding:8px;border-radius:6px">${labels.join(', ')}</p></details>`;
  }
  if (textLines.length > 0 && textLines[0]) {
    html += `<details style="margin-top:4px"><summary style="color:#555;font-size:11px;cursor:pointer">Texto detectado</summary>
      <pre style="color:#666;font-size:11px;white-space:pre-wrap;margin-top:4px;background:#111;padding:8px;border-radius:6px">${textLines.join('\n')}</pre></details>`;
  }

  html += '</div>';
  $('#ocr-content').innerHTML = html;
}

async function searchAndShowTeam(teamName) {
  showLoading(true, 'Buscando estadísticas...');
  try {
    const data = await apiFetch(`/teams?name=${encodeURIComponent(teamName)}`);
    const teams = data.teams || [];
    if (teams.length > 0) {
      // Buscar el mejor match: priorizar nombre exacto o más corto (más específico)
      const best = teams.find(t =>
        t.name.toLowerCase().includes(teamName.toLowerCase()) ||
        t.shortName?.toLowerCase() === teamName.toLowerCase()
      ) || teams.sort((a, b) => {
        // Priorizar por similitud del nombre
        const aDist = Math.abs(a.name.length - teamName.length);
        const bDist = Math.abs(b.name.length - teamName.length);
        return aDist - bDist;
      })[0];

      showLoading(false);
      await loadTeamStats(best.id);
    } else {
      showLoading(false);
      showScreen('search');
      $('#search-input').value = teamName;
      searchTeams(teamName);
    }
  } catch (err) {
    console.error(err);
    showLoading(false);
    showScreen('search');
    $('#search-input').value = teamName;
  }
}

// --- Camera ---
async function initCamera() {
  const scanText = $('.scan-text');
  scanText.textContent = 'Iniciando cámara...';

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    scanText.textContent = '⚠️ Tu navegador no soporta cámara. Usa 📷 para subir foto.';
    showGalleryFallback();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    const video = $('#camera');
    video.srcObject = stream;
    await video.play();
    cameraReady = true;
    scanText.textContent = '📸 Enfoca el marcador del partido y captura';
  } catch (err) {
    console.error('Camera error:', err);
    scanText.textContent = err.name === 'NotAllowedError'
      ? '⚠️ Permiso denegado. Actívalo en ajustes o sube una foto.'
      : '⚠️ No se pudo acceder a la cámara. Usa 📷 para subir foto.';
    showGalleryFallback();
  }
}

function showGalleryFallback() {
  const controls = $('.camera-controls');
  if (!$('#btn-gallery')) {
    const btn = document.createElement('button');
    btn.id = 'btn-gallery';
    btn.className = 'btn-action';
    btn.textContent = '📷 Subir Foto';
    btn.addEventListener('click', () => $('#file-input').click());
    controls.insertBefore(btn, controls.firstChild);
  }
}

// --- API ---
async function apiFetch(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

const POPULAR_TEAMS = [
  { id: 86, name: 'Real Madrid', crest: '⚪' },
  { id: 81, name: 'Barcelona', crest: '🔵🔴' },
  { id: 65, name: 'Manchester City', crest: '🔵' },
  { id: 64, name: 'Liverpool', crest: '🔴' },
  { id: 5, name: 'Bayern Munich', crest: '🔴' },
  { id: 57, name: 'Arsenal', crest: '🔴' },
  // Liga MX
  { id: 'tsdb:134193', name: 'América', crest: '🦅' },
  { id: 'tsdb:134206', name: 'Chivas', crest: '🐐' },
  { id: 'tsdb:134196', name: 'Cruz Azul', crest: '🔵' },
  { id: 'tsdb:134198', name: 'Monterrey', crest: '⚪🔵' },
  { id: 'tsdb:134197', name: 'Tigres', crest: '🐯' },
  { id: 'tsdb:134201', name: 'Pumas', crest: '🐾' },
];

function showPopularTeams() {
  $('#search-results').innerHTML = `
    <div class="popular-teams"><h3>🇲🇽 Liga MX</h3><div class="popular-grid">
      ${POPULAR_TEAMS.filter(t => String(t.id).startsWith('espn:')).map(t => `<div class="popular-item" onclick="loadTeamStats('${t.id}')">
        <span style="font-size:24px">${t.crest}</span><span>${t.name}</span></div>`).join('')}
    </div></div>
    <div class="popular-teams" style="margin-top:8px"><h3>⚽ Europa</h3><div class="popular-grid">
      ${POPULAR_TEAMS.filter(t => !String(t.id).startsWith('espn:')).map(t => `<div class="popular-item" onclick="loadTeamStats(${t.id})">
        <span style="font-size:24px">${t.crest}</span><span>${t.name}</span></div>`).join('')}
    </div></div>`;
}

async function searchTeams(query) {
  try {
    showLoading(true, 'Buscando equipos...');
    const data = await apiFetch(`/teams?name=${encodeURIComponent(query)}`);
    renderSearchResults(data.teams || []);
  } catch (err) {
    console.error(err);
    $('#search-results').innerHTML = '<div class="no-results">Error al buscar.</div>';
  } finally { showLoading(false); }
}

function renderSearchResults(teams) {
  if (!teams.length) { $('#search-results').innerHTML = '<div class="no-results">No se encontraron equipos</div>'; return; }
  $('#search-results').innerHTML = teams.map(t => `
    <div class="result-item" onclick="loadTeamStats(${t.id})">
      ${t.crest ? `<img src="${t.crest}" alt="${t.name}">` : `<span style="font-size:28px">${t._emoji || '⚽'}</span>`}
      <div><div class="team-name">${t.name}</div><div class="team-league">${t.area?.name || ''}</div></div>
    </div>`).join('');
}

// --- Team Stats ---
async function loadTeamStats(teamId) {
  showLoading(true, 'Cargando estadísticas...');
  showScreen('stats');

  // Si el ID empieza con 'tsdb:', usar TheSportsDB (Liga MX)
  if (String(teamId).startsWith('tsdb:')) {
    const tsdbId = teamId.replace('tsdb:', '');
    try {
      await renderLigaMXStats(tsdbId);
    } catch (err) {
      console.error(err);
      $('#stats-content').innerHTML = '<div class="no-results">Error al cargar estadísticas</div>';
    } finally { showLoading(false); }
    return;
  }

  // Football-data API (europeos)
  try {
    const [teamData, matchesData] = await Promise.all([
      apiFetch(`/teams/${teamId}`),
      apiFetch(`/teams/${teamId}/matches?status=FINISHED&limit=10`)
    ]);
    renderTeamStats(teamData, matchesData.matches || []);
  } catch (err) {
    console.error(err);
    $('#stats-content').innerHTML = '<div class="no-results">Error al cargar estadísticas</div>';
  } finally { showLoading(false); }
}

// Usa el proxy local /tsdb/ (con caché) en vez de llamar directo a TheSportsDB.
// Así 500 usuarios comparten la misma respuesta cacheada.
const TSDB_BASE = '/tsdb';
const LIGAMX_LEAGUE_ID = '4350';

async function renderLigaMXStats(tsdbId) {
  // 1. Datos del equipo
  const teamData = await fetch(`${TSDB_BASE}/lookupteam.php?id=${tsdbId}`).then(r => r.json());
  const team = teamData.teams?.[0];
  if (!team) { $('#stats-content').innerHTML = '<div class="no-results">Equipo no encontrado</div>'; return; }

  // 2. Tabla de posiciones (estadísticas W/D/L/goles)
  let stats = null;
  try {
    const table = await fetch(`${TSDB_BASE}/lookuptable.php?l=${LIGAMX_LEAGUE_ID}&s=2025-2026`).then(r => r.json());
    stats = (table.table || []).find(row => row.idTeam === tsdbId);
  } catch (e) { console.warn('No standings', e); }

  // 3. Últimos partidos
  let matchCards = '';
  try {
    const last = await fetch(`${TSDB_BASE}/eventslast.php?id=${tsdbId}`).then(r => r.json());
    matchCards = (last.results || []).map(m => {
      const hs = m.intHomeScore, as = m.intAwayScore;
      const isHome = m.idHomeTeam === tsdbId;
      const myGoals = parseInt(isHome ? hs : as);
      const theirGoals = parseInt(isHome ? as : hs);
      const r = myGoals > theirGoals ? '🟢' : myGoals === theirGoals ? '🟡' : '🔴';
      return `<div class="match-card">
        <div class="match-teams"><div>${r} ${m.strEvent}</div>
        <div class="match-date">${m.dateEvent || ''}</div></div>
        <div class="match-score">${hs} - ${as}</div></div>`;
    }).join('');
  } catch (e) { console.warn('No matches', e); }

  const wins = stats ? parseInt(stats.intWin) : 0;
  const draws = stats ? parseInt(stats.intDraw) : 0;
  const losses = stats ? parseInt(stats.intLoss) : 0;
  const gf = stats ? parseInt(stats.intGoalsFor) : 0;
  const ga = stats ? parseInt(stats.intGoalsAgainst) : 0;
  const total = wins + draws + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  $('#stats-content').innerHTML = `
    <div class="team-header">
      <img src="${team.strBadge}" alt="${team.strTeam}">
      <h1>${team.strTeam}</h1>
      <p>Liga MX · Fundado: ${team.intFormedYear || 'N/A'}</p>
      <p style="font-size:12px;color:#666;margin-top:4px">🏟️ ${team.strStadium || ''}</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${wins}</div><div class="stat-label">Ganados</div></div>
      <div class="stat-card"><div class="stat-value">${draws}</div><div class="stat-label">Empates</div></div>
      <div class="stat-card"><div class="stat-value">${losses}</div><div class="stat-label">Perdidos</div></div>
      <div class="stat-card"><div class="stat-value">${gf}</div><div class="stat-label">Goles a Favor</div></div>
      <div class="stat-card"><div class="stat-value">${ga}</div><div class="stat-label">Goles en Contra</div></div>
      <div class="stat-card"><div class="stat-value">${winRate}%</div><div class="stat-label">% Victoria</div></div>
    </div>
    <div class="section-title">Últimos Partidos</div>
    ${matchCards || '<div class="no-results">Sin partidos recientes disponibles</div>'}`;

  // Cargar momios
  loadOddsForTeam(team.strTeam, 'soccer_mexico_ligamx');
}

// --- Momios / Odds ---
// Mapeo de nombres ESPN → nombres en The Odds API
const ODDS_NAME_MAP = {
  'américa': 'América', 'america': 'América',
  'guadalajara': 'Guadalajara', 'chivas': 'Guadalajara',
  'cruz azul': 'Cruz Azul',
  'monterrey': 'Monterrey', 'rayados': 'Monterrey',
  'tigres uanl': 'Tigres', 'tigres': 'Tigres',
  'pumas unam': 'Pumas', 'pumas': 'Pumas',
  'toluca': 'Toluca',
  'santos laguna': 'Santos Laguna', 'santos': 'Santos Laguna',
  'león': 'León', 'leon': 'León',
  'pachuca': 'Pachuca',
  'atlas': 'Atlas',
  'necaxa': 'Necaxa',
  'puebla': 'Puebla',
  'querétaro': 'Querétaro', 'queretaro': 'Querétaro',
  'tijuana': 'Tijuana',
  'mazatlán fc': 'Mazatlán FC', 'mazatlan': 'Mazatlán FC',
  'fc juárez': 'FC Juárez', 'fc juarez': 'FC Juárez', 'juárez': 'FC Juárez',
  'atlético de san luis': 'Atlético San Luis', 'san luis': 'Atlético San Luis',
  // Europeos
  'real madrid cf': 'Real Madrid', 'real madrid': 'Real Madrid',
  'fc barcelona': 'Barcelona', 'barcelona': 'Barcelona',
  'manchester city fc': 'Manchester City', 'manchester city': 'Manchester City',
  'liverpool fc': 'Liverpool', 'liverpool': 'Liverpool',
  'arsenal fc': 'Arsenal', 'arsenal': 'Arsenal',
  'fc bayern münchen': 'Bayern Munich', 'bayern munich': 'Bayern Munich',
};

function normalizeTeamName(name) {
  const lower = name.toLowerCase().trim();
  return ODDS_NAME_MAP[lower] || name;
}

async function loadOddsForTeam(teamName, sport) {
  try {
    const res = await fetch(`/odds/${sport}`);
    const games = await res.json();
    if (!Array.isArray(games) || games.length === 0) return;

    const normalized = normalizeTeamName(teamName);
    const teamGames = games.filter(g => {
      const home = g.home_team.toLowerCase();
      const away = g.away_team.toLowerCase();
      const search = normalized.toLowerCase();
      return home.includes(search) || away.includes(search) ||
             search.includes(home) || search.includes(away);
    });

    if (teamGames.length === 0) return;
    renderOdds(teamGames);
  } catch (err) {
    console.error('Odds error:', err);
  }
}

function renderOdds(games) {
  let html = '<div class="section-title">🎰 Momios - Próximos Partidos</div>';

  games.forEach(game => {
    const date = new Date(game.commence_time).toLocaleDateString('es', {
      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    // Tomar el mejor momio de cada resultado entre todas las casas
    let bestHome = { price: 0, book: '' };
    let bestDraw = { price: 0, book: '' };
    let bestAway = { price: 0, book: '' };

    (game.bookmakers || []).forEach(bk => {
      const market = bk.markets?.find(m => m.key === 'h2h');
      if (!market) return;
      market.outcomes.forEach(o => {
        if (o.name === game.home_team && o.price > bestHome.price) {
          bestHome = { price: o.price, book: bk.title };
        } else if (o.name === game.away_team && o.price > bestAway.price) {
          bestAway = { price: o.price, book: bk.title };
        } else if (o.name === 'Draw' && o.price > bestDraw.price) {
          bestDraw = { price: o.price, book: bk.title };
        }
      });
    });

    html += `
      <div style="margin:4px 16px;background:#16213e;border-radius:10px;padding:14px">
        <div style="text-align:center;margin-bottom:8px">
          <div style="font-size:15px;font-weight:600">${game.home_team} vs ${game.away_team}</div>
          <div style="font-size:11px;color:#888">${date}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;text-align:center">
          <div style="background:#0a2a1a;border-radius:8px;padding:10px">
            <div style="font-size:11px;color:#888">Local</div>
            <div style="font-size:22px;font-weight:700;color:#00ff88">${bestHome.price.toFixed(2)}</div>
            <div style="font-size:9px;color:#555">${bestHome.book}</div>
          </div>
          <div style="background:#1a1a0a;border-radius:8px;padding:10px">
            <div style="font-size:11px;color:#888">Empate</div>
            <div style="font-size:22px;font-weight:700;color:#ffcc00">${bestDraw.price.toFixed(2)}</div>
            <div style="font-size:9px;color:#555">${bestDraw.book}</div>
          </div>
          <div style="background:#2a0a0a;border-radius:8px;padding:10px">
            <div style="font-size:11px;color:#888">Visitante</div>
            <div style="font-size:22px;font-weight:700;color:#ff6666">${bestAway.price.toFixed(2)}</div>
            <div style="font-size:9px;color:#555">${bestAway.book}</div>
          </div>
        </div>
        <div style="text-align:center;margin-top:6px;font-size:10px;color:#444">${game.bookmakers?.length || 0} casas de apuestas comparadas</div>
      </div>`;
  });

  // Append al stats-content existente
  const container = $('#stats-content');
  if (container) container.innerHTML += html;
}

function renderTeamStats(team, matches) {
  let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
  matches.forEach(m => {
    const isHome = m.homeTeam.id === team.id;
    const hs = m.score.fullTime.home, as = m.score.fullTime.away;
    goalsFor += isHome ? hs : as;
    goalsAgainst += isHome ? as : hs;
    if (hs === as) draws++;
    else if ((isHome && hs > as) || (!isHome && as > hs)) wins++;
    else losses++;
  });
  const winRate = matches.length > 0 ? Math.round((wins / matches.length) * 100) : 0;

  $('#stats-content').innerHTML = `
    <div class="team-header">
      <img src="${team.crest}" alt="${team.name}">
      <h1>${team.name}</h1>
      <p>${team.area?.name || ''} · Fundado: ${team.founded || 'N/A'}</p>
      <p style="font-size:12px;color:#666;margin-top:4px">🏟️ ${team.venue || ''}</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${wins}</div><div class="stat-label">Ganados</div></div>
      <div class="stat-card"><div class="stat-value">${draws}</div><div class="stat-label">Empates</div></div>
      <div class="stat-card"><div class="stat-value">${losses}</div><div class="stat-label">Perdidos</div></div>
      <div class="stat-card"><div class="stat-value">${goalsFor}</div><div class="stat-label">Goles a Favor</div></div>
      <div class="stat-card"><div class="stat-value">${goalsAgainst}</div><div class="stat-label">Goles en Contra</div></div>
      <div class="stat-card"><div class="stat-value">${winRate}%</div><div class="stat-label">% Victoria</div></div>
    </div>
    <div class="section-title">Últimos ${matches.length} Partidos</div>
    ${matches.map(m => {
      const isHome = m.homeTeam.id === team.id;
      const hs = m.score.fullTime.home, as = m.score.fullTime.away;
      const r = hs === as ? '🟡' : ((isHome && hs > as) || (!isHome && as > hs)) ? '🟢' : '🔴';
      return `<div class="match-card" onclick='showMatchDetail(${JSON.stringify(m).replace(/'/g, "\\'")})'>
        <div class="match-teams"><div>${r} ${m.homeTeam.shortName || m.homeTeam.name} vs ${m.awayTeam.shortName || m.awayTeam.name}</div>
        <div class="match-date">${new Date(m.utcDate).toLocaleDateString('es')}</div></div>
        <div class="match-score">${hs} - ${as}</div></div>`;
    }).join('')}`;

  // Detectar liga para cargar momios
  const area = (team.area?.name || '').toLowerCase();
  let sport = '';
  if (area.includes('spain')) sport = 'soccer_spain_la_liga';
  else if (area.includes('england')) sport = 'soccer_epl';
  else if (area.includes('germany')) sport = 'soccer_germany_bundesliga';
  else if (area.includes('italy')) sport = 'soccer_italy_serie_a';
  else if (area.includes('france')) sport = 'soccer_france_ligue_one';
  if (sport) loadOddsForTeam(team.shortName || team.name, sport);
}

function showMatchDetail(match) {
  showScreen('match');
  $('#match-content').innerHTML = `
    <div class="match-detail-header">
      <div class="match-vs">
        <div class="team-col">
          ${match.homeTeam.crest ? `<img src="${match.homeTeam.crest}" alt="">` : '<span style="font-size:40px">⚽</span>'}
          <p>${match.homeTeam.shortName || match.homeTeam.name}</p>
        </div>
        <div class="score-big">${match.score.fullTime.home} - ${match.score.fullTime.away}</div>
        <div class="team-col">
          ${match.awayTeam.crest ? `<img src="${match.awayTeam.crest}" alt="">` : '<span style="font-size:40px">⚽</span>'}
          <p>${match.awayTeam.shortName || match.awayTeam.name}</p>
        </div>
      </div>
      <div class="match-info">${new Date(match.utcDate).toLocaleDateString('es', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </div>
    <div class="section-title">Detalles</div>
    <div class="info-row"><span class="label">Competición</span><span>${match.competition?.name || 'N/A'}</span></div>
    <div class="info-row"><span class="label">Jornada</span><span>${match.matchday || 'N/A'}</span></div>
    <div class="info-row"><span class="label">Estado</span><span>${match.status === 'FINISHED' ? 'Finalizado' : match.status}</span></div>
    ${match.score.halfTime?.home != null ? `<div class="info-row"><span class="label">Medio Tiempo</span><span>${match.score.halfTime.home} - ${match.score.halfTime.away}</span></div>` : ''}`;
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  screens.camera = $('#camera-screen');
  screens.search = $('#search-screen');
  screens.stats = $('#stats-screen');
  screens.match = $('#match-screen');
  screens.ocr = $('#ocr-screen');

  initCamera();
  showPopularTeams();
  initOCR(); // Pre-cargar como fallback

  $('#btn-capture').addEventListener('click', processCapture);
  $('#file-input').addEventListener('change', (e) => {
    if (e.target.files[0]) processImageFromFile(e.target.files[0]);
    e.target.value = '';
  });
  $('#btn-back-search').addEventListener('click', () => showScreen('camera'));
  $('#btn-back-stats').addEventListener('click', () => showScreen('search'));
  $('#btn-back-match').addEventListener('click', () => showScreen('stats'));
  $('#btn-back-ocr').addEventListener('click', () => showScreen('camera'));
  $('#search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const q = e.target.value.trim();
    if (q.length < 2) { showPopularTeams(); return; }
    searchTimeout = setTimeout(() => searchTeams(q), 400);
  });
});
