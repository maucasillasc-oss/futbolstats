// Football Stats App con OCR (Tesseract.js)
// Las llamadas van al proxy local /api/ que evita problemas de CORS
const API_BASE = '/api';

const $ = (sel) => document.querySelector(sel);

// Screens
const screens = {
  camera: null,
  search: null,
  stats: null,
  match: null,
  ocr: null,
};

let currentScreen = 'camera';
let searchTimeout = null;
let ocrWorker = null;

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

// --- Tesseract OCR ---
async function initOCR() {
  try {
    ocrWorker = await Tesseract.createWorker('eng+spa', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          showLoading(true, `Analizando imagen... ${pct}%`);
        }
      }
    });
    console.log('OCR engine ready');
  } catch (err) {
    console.error('OCR init error:', err);
  }
}

// Diccionario de nombres conocidos para mejorar el matching
const TEAM_ALIASES = {
  'real madrid': 'Real Madrid', 'r madrid': 'Real Madrid', 'rma': 'Real Madrid', 'rea': 'Real Madrid',
  'barcelona': 'Barcelona', 'barca': 'Barcelona', 'fcb': 'Barcelona', 'bar': 'Barcelona',
  'atletico': 'Atlético Madrid', 'atl madrid': 'Atlético Madrid', 'atm': 'Atlético Madrid',
  'manchester city': 'Manchester City', 'man city': 'Manchester City', 'mci': 'Manchester City',
  'manchester united': 'Manchester United', 'man united': 'Manchester United', 'man utd': 'Manchester United', 'mun': 'Manchester United',
  'liverpool': 'Liverpool', 'liv': 'Liverpool', 'lfc': 'Liverpool',
  'arsenal': 'Arsenal', 'ars': 'Arsenal',
  'chelsea': 'Chelsea', 'che': 'Chelsea',
  'bayern': 'Bayern Munich', 'bayern munich': 'Bayern Munich', 'fcb munich': 'Bayern Munich',
  'dortmund': 'Borussia Dortmund', 'borussia': 'Borussia Dortmund', 'bvb': 'Borussia Dortmund',
  'psg': 'PSG', 'paris': 'PSG', 'paris saint': 'PSG',
  'inter': 'Inter Milan', 'inter milan': 'Inter Milan', 'internazionale': 'Inter Milan',
  'ac milan': 'AC Milan', 'milan': 'AC Milan',
  'juventus': 'Juventus', 'juve': 'Juventus', 'juv': 'Juventus',
  'napoli': 'Napoli', 'nap': 'Napoli',
  'tottenham': 'Tottenham', 'spurs': 'Tottenham', 'tot': 'Tottenham',
  'real sociedad': 'Real Sociedad', 'r sociedad': 'Real Sociedad',
  'villarreal': 'Villarreal', 'vil': 'Villarreal',
  'sevilla': 'Sevilla', 'sev': 'Sevilla',
  'betis': 'Real Betis', 'real betis': 'Real Betis',
  'valencia': 'Valencia', 'val': 'Valencia',
};

function findTeamInText(text) {
  const lower = text.toLowerCase().replace(/[^a-záéíóúñü0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const found = [];

  // Buscar aliases (de más largo a más corto para priorizar matches exactos)
  const sortedAliases = Object.keys(TEAM_ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of sortedAliases) {
    if (lower.includes(alias)) {
      const teamName = TEAM_ALIASES[alias];
      if (!found.includes(teamName)) {
        found.push(teamName);
      }
    }
  }
  return found;
}

async function processCapture() {
  const video = $('#camera');
  const canvas = $('#capture-canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);

  // Preprocesar: recortar la parte superior e inferior donde suelen estar los marcadores
  // Las transmisiones ponen el marcador arriba (10-25% de la pantalla)
  const regions = [
    { name: 'top', y: 0, h: Math.floor(canvas.height * 0.2) },
    { name: 'bottom', y: Math.floor(canvas.height * 0.8), h: Math.floor(canvas.height * 0.2) },
    { name: 'full', y: 0, h: canvas.height },
  ];

  showLoading(true, 'Analizando imagen con OCR...');

  if (!ocrWorker) {
    showLoading(true, 'Iniciando motor OCR...');
    await initOCR();
  }

  let allTeams = [];
  let allText = '';

  for (const region of regions) {
    const regionCanvas = document.createElement('canvas');
    regionCanvas.width = canvas.width;
    regionCanvas.height = region.h;
    const rCtx = regionCanvas.getContext('2d');

    // Mejorar contraste para OCR
    rCtx.filter = 'contrast(1.5) brightness(1.1)';
    rCtx.drawImage(canvas, 0, region.y, canvas.width, region.h, 0, 0, canvas.width, region.h);

    try {
      const result = await ocrWorker.recognize(regionCanvas);
      const text = result.data.text;
      allText += text + ' ';
      console.log(`OCR [${region.name}]:`, text);

      const teams = findTeamInText(text);
      teams.forEach(t => { if (!allTeams.includes(t)) allTeams.push(t); });

      // Si ya encontramos 2 equipos, no necesitamos seguir
      if (allTeams.length >= 2) break;
    } catch (err) {
      console.error(`OCR error [${region.name}]:`, err);
    }
  }

  showLoading(false);
  showOCRResults(allTeams, allText.trim(), canvas.toDataURL('image/jpeg', 0.7));
}

function showOCRResults(teams, rawText, imageData) {
  showScreen('ocr');
  let html = `
    <div style="padding:12px">
      <img src="${imageData}" style="width:100%;border-radius:8px;margin-bottom:12px" alt="Captura">
  `;

  if (teams.length > 0) {
    html += `
      <div style="background:#0a2a1a;border:1px solid #00ff88;border-radius:10px;padding:16px;margin-bottom:12px">
        <p style="color:#00ff88;font-size:14px;margin-bottom:8px">⚽ Equipos detectados:</p>
        ${teams.map(t => `
          <div class="result-item" onclick="searchAndShowTeam('${t}')" style="margin:4px 0">
            <span style="font-size:24px">⚽</span>
            <div>
              <div class="team-name">${t}</div>
              <div class="team-league" style="color:#00ff88">Toca para ver estadísticas →</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    if (teams.length >= 2) {
      html += `
        <div style="background:#16213e;border-radius:10px;padding:16px;text-align:center;margin-bottom:12px">
          <p style="font-size:16px;margin-bottom:8px">🏟️ Partido detectado</p>
          <p style="font-size:22px;font-weight:700">${teams[0]} vs ${teams[1]}</p>
          <button onclick="searchAndShowTeam('${teams[0]}')" class="btn-action" style="margin:8px 4px;font-size:14px">
            Ver ${teams[0]}
          </button>
          <button onclick="searchAndShowTeam('${teams[1]}')" class="btn-action" style="margin:8px 4px;font-size:14px">
            Ver ${teams[1]}
          </button>
        </div>
      `;
    }
  } else {
    html += `
      <div style="background:#2a1a0a;border:1px solid #ff8800;border-radius:10px;padding:16px;margin-bottom:12px">
        <p style="color:#ff8800;font-size:14px">🔍 No se detectaron equipos automáticamente</p>
        <p style="color:#888;font-size:13px;margin-top:8px">Intenta:</p>
        <ul style="color:#888;font-size:13px;padding-left:20px;margin-top:4px">
          <li>Enfocar el marcador/scoreboard de la transmisión</li>
          <li>Acercar más la cámara al texto</li>
          <li>Asegurar buena iluminación</li>
        </ul>
        <button onclick="showScreen('search');$('#search-input').focus()" class="btn-action" style="margin-top:12px;width:100%">
          🔍 Buscar manualmente
        </button>
      </div>
    `;
  }

  // Mostrar texto raw detectado (debug)
  if (rawText) {
    html += `
      <details style="margin-top:8px">
        <summary style="color:#555;font-size:12px;cursor:pointer">Texto detectado por OCR</summary>
        <pre style="color:#666;font-size:11px;white-space:pre-wrap;margin-top:4px;background:#111;padding:8px;border-radius:6px">${rawText}</pre>
      </details>
    `;
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
      showLoading(false);
      await loadTeamStats(teams[0].id);
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
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    $('#camera').srcObject = stream;
  } catch (err) {
    console.error('Camera error:', err);
    $('.scan-text').textContent = 'No se pudo acceder a la cámara. Usa el buscador.';
  }
}

// --- API ---
async function apiFetch(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Equipos populares
const POPULAR_TEAMS = [
  { id: 86, name: 'Real Madrid', crest: '⚪' },
  { id: 81, name: 'Barcelona', crest: '🔵🔴' },
  { id: 5529, name: 'Atlético Madrid', crest: '🔴⚪' },
  { id: 65, name: 'Manchester City', crest: '🔵' },
  { id: 66, name: 'Manchester United', crest: '🔴' },
  { id: 64, name: 'Liverpool', crest: '🔴' },
  { id: 108, name: 'Inter Milan', crest: '🔵⚫' },
  { id: 98, name: 'AC Milan', crest: '🔴⚫' },
  { id: 5, name: 'Bayern Munich', crest: '🔴' },
  { id: 4, name: 'Borussia Dortmund', crest: '🟡' },
  { id: 524, name: 'PSG', crest: '🔵🔴' },
  { id: 57, name: 'Arsenal', crest: '🔴' },
];

function showPopularTeams() {
  const html = `
    <div class="popular-teams">
      <h3>⭐ Equipos Populares</h3>
      <div class="popular-grid">
        ${POPULAR_TEAMS.map(t => `
          <div class="popular-item" onclick="loadTeamStats(${t.id})">
            <span style="font-size:24px">${t.crest}</span>
            <span>${t.name}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  $('#search-results').innerHTML = html;
}

async function searchTeams(query) {
  try {
    showLoading(true, 'Buscando equipos...');
    const data = await apiFetch(`/teams?name=${encodeURIComponent(query)}`);
    renderSearchResults(data.teams || []);
  } catch (err) {
    console.error(err);
    $('#search-results').innerHTML = '<div class="no-results">Error al buscar.</div>';
  } finally {
    showLoading(false);
  }
}

function renderSearchResults(teams) {
  if (teams.length === 0) {
    $('#search-results').innerHTML = '<div class="no-results">No se encontraron equipos</div>';
    return;
  }
  const html = teams.map(t => `
    <div class="result-item" onclick="loadTeamStats(${t.id})">
      ${t.crest ? `<img src="${t.crest}" alt="${t.name}">` : `<span style="font-size:28px">${t._emoji || '⚽'}</span>`}
      <div>
        <div class="team-name">${t.name}</div>
        <div class="team-league">${t.area?.name || ''}</div>
      </div>
    </div>
  `).join('');
  $('#search-results').innerHTML = html;
}

// --- Team Stats ---
async function loadTeamStats(teamId) {
  showLoading(true, 'Cargando estadísticas...');
  showScreen('stats');
  try {
    const [teamData, matchesData] = await Promise.all([
      apiFetch(`/teams/${teamId}`),
      apiFetch(`/teams/${teamId}/matches?status=FINISHED&limit=10`)
    ]);
    renderTeamStats(teamData, matchesData.matches || []);
  } catch (err) {
    console.error(err);
    $('#stats-content').innerHTML = '<div class="no-results">Error al cargar estadísticas</div>';
  } finally {
    showLoading(false);
  }
}

function renderTeamStats(team, matches) {
  let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;

  matches.forEach(m => {
    const isHome = m.homeTeam.id === team.id;
    const homeScore = m.score.fullTime.home;
    const awayScore = m.score.fullTime.away;
    goalsFor += isHome ? homeScore : awayScore;
    goalsAgainst += isHome ? awayScore : homeScore;
    if (homeScore === awayScore) draws++;
    else if ((isHome && homeScore > awayScore) || (!isHome && awayScore > homeScore)) wins++;
    else losses++;
  });

  const winRate = matches.length > 0 ? Math.round((wins / matches.length) * 100) : 0;

  const html = `
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
      const result = m.score.fullTime.home === m.score.fullTime.away ? '🟡' :
        ((isHome && m.score.fullTime.home > m.score.fullTime.away) ||
         (!isHome && m.score.fullTime.away > m.score.fullTime.home)) ? '🟢' : '🔴';
      return `
        <div class="match-card" onclick='showMatchDetail(${JSON.stringify(m).replace(/'/g, "\\'")})'>
          <div class="match-teams">
            <div>${result} ${m.homeTeam.shortName || m.homeTeam.name} vs ${m.awayTeam.shortName || m.awayTeam.name}</div>
            <div class="match-date">${new Date(m.utcDate).toLocaleDateString('es')}</div>
          </div>
          <div class="match-score">${m.score.fullTime.home} - ${m.score.fullTime.away}</div>
        </div>`;
    }).join('')}
  `;
  $('#stats-content').innerHTML = html;
}

function showMatchDetail(match) {
  showScreen('match');
  const html = `
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
    ${match.score.halfTime?.home != null ? `
      <div class="info-row"><span class="label">Medio Tiempo</span><span>${match.score.halfTime.home} - ${match.score.halfTime.away}</span></div>
    ` : ''}
  `;
  $('#match-content').innerHTML = html;
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  // Cache screen refs
  screens.camera = $('#camera-screen');
  screens.search = $('#search-screen');
  screens.stats = $('#stats-screen');
  screens.match = $('#match-screen');
  screens.ocr = $('#ocr-screen');

  initCamera();
  showPopularTeams();

  // Pre-cargar OCR en background
  initOCR();

  // Event listeners
  $('#btn-capture').addEventListener('click', processCapture);

  $('#btn-search').addEventListener('click', () => {
    showScreen('search');
    $('#search-input').focus();
    showPopularTeams();
  });

  $('#btn-back-search').addEventListener('click', () => showScreen('camera'));
  $('#btn-back-stats').addEventListener('click', () => showScreen('search'));
  $('#btn-back-match').addEventListener('click', () => showScreen('stats'));
  $('#btn-back-ocr').addEventListener('click', () => showScreen('camera'));

  $('#search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length < 2) { showPopularTeams(); return; }
    searchTimeout = setTimeout(() => searchTeams(query), 400);
  });
});
