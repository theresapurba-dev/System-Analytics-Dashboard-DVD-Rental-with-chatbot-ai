/* ===================================================
   ai-popup.js — DVD Rental AI Assistant v3.0
   DEFAULT MODE: Groq (Cloud) - FAST
   =================================================== */

const BASE_URL = 'http://localhost:8000';

// ── Groq (Cloud AI) config ─────────────────────────
const GROQ_API_KEY = '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';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';

// ── LocalStorage helpers ───────────────────────────
const LS = {
  get: (k, def) => { 
    try { 
      const v = localStorage.getItem(k); 
      return v !== null ? JSON.parse(v) : def; 
    } catch { 
      return def; 
    } 
  },
  set: (k, v) => { 
    try { 
      localStorage.setItem(k, JSON.stringify(v)); 
    } catch {} 
  },
};

let _theme        = LS.get('theme', 'dark');
window._theme     = _theme;
let _activeFilter = LS.get('activeFilters', []);
let _lastGroqCall = 0;
const GROQ_RATE_LIMIT_DELAY = 2000; // 2 seconds between calls

window.getThemeTextColor = function() {
  return getComputedStyle(document.body).getPropertyValue('--text').trim() || '#f5e6c8';
};
window.getThemeTextDimColor = function() {
  return getComputedStyle(document.body).getPropertyValue('--text-dim').trim() || 'rgba(245,230,200,0.55)';
};
window.getThemeBorderColor = function() {
  return getComputedStyle(document.body).getPropertyValue('--border').trim() || 'rgba(230,163,65,0.12)';
};

function saveState() {
  LS.set('theme', _theme);
  LS.set('activeFilters', _activeFilter);
}

(function applySavedTheme() {
  const t = LS.get('theme', 'dark');
  if (t !== 'dark') _applyThemeClass(t);
})();

function _applyThemeClass(mode) {
  document.body.classList.remove('theme-dark', 'theme-light', 'theme-gold', 'theme-midnight', 'theme-forest');
  if (mode === 'light') document.body.classList.add('theme-light');
  else if (mode === 'gold') document.body.classList.add('theme-gold');
  else if (mode === 'midnight') document.body.classList.add('theme-midnight');
  else if (mode === 'forest') document.body.classList.add('theme-forest');
}

// ══════════════════════════════════════════════════
//  DASHBOARD CONTROL FUNCTIONS
// ══════════════════════════════════════════════════

function changeTheme(mode) {
  _applyThemeClass(mode);
  _theme = mode;
  window._theme = mode;
  saveState();
  
  if (window.Chart) {
    Chart.defaults.color = window.getThemeTextColor();
    Chart.defaults.borderColor = window.getThemeBorderColor();
  }
  
  if (typeof window.applyFilter === 'function') {
    window.applyFilter();
  } else {
    window.location.reload();
  }
  
  return 'Theme changed to "' + mode + '" mode.';
}

function changeBackgroundColor(color) {
  document.body.style.setProperty('--bg', color);
  return 'Background color changed to ' + color + '.';
}

function highlightElement(elementType) {
  const map = { 
    table: '.table-wrapper', 
    chart: '.card', 
    kpi: '.kpi-card',
    forecast: '#forecast-chart-card, .forecast-section'
  };
  const sel = map[elementType] || '.' + elementType;
  
  if (!document.getElementById('ai-highlight-style')) {
    const s = document.createElement('style');
    s.id = 'ai-highlight-style';
    s.textContent = '.ai-highlight { outline: 2px solid var(--gold) !important; box-shadow: 0 0 20px rgba(230,163,65,0.5) !important; transition: all 0.3s ease; }';
    document.head.appendChild(s);
  }
  
  document.querySelectorAll('.ai-highlight').forEach(el => el.classList.remove('ai-highlight'));
  const elements = document.querySelectorAll(sel);
  
  if (elements.length === 0) {
    return `No "${elementType}" elements found on this page.`;
  }
  
  elements.forEach(el => el.classList.add('ai-highlight'));
  setTimeout(() => document.querySelectorAll('.ai-highlight').forEach(el => el.classList.remove('ai-highlight')), 3500);
  return `Highlighted ${elements.length} "${elementType}" element(s) for 3.5 seconds.`;
}

function changeChartType(type) {
  if (typeof window._changeChartType === 'function') {
    return window._changeChartType(type);
  }
  return 'Chart type control is not available on this page.';
}

function filterData(category, value) {
  if (typeof window._filterData === 'function') {
    const result = window._filterData(category, value);
    _activeFilter = _activeFilter.filter(f => f.category !== category);
    _activeFilter.push({ category, value });
    saveState();
    return result;
  }
  return 'Filter is not available on this page.';
}

function sortData(column, order) {
  if (typeof window._sortData === 'function') return window._sortData(column, order);
  return 'Sort is not available on this page.';
}

function scrollToSection(sectionId) {
  const el = document.getElementById(sectionId) || document.querySelector('.' + sectionId);
  if (el) { 
    el.scrollIntoView({ behavior: 'smooth', block: 'start' }); 
    return 'Scrolled to section: ' + sectionId;
  }
  return 'Section "' + sectionId + '" not found on this page.';
}

function exportData(format) {
  if (format === 'csv') {
    const table = document.querySelector('table');
    if (!table) return 'No table found to export.';
    let csv = '';
    table.querySelectorAll('tr').forEach(row => {
      const cells = [...row.querySelectorAll('th,td')].map(c => '"' + c.textContent.trim().replace(/"/g, '""') + '"');
      csv += cells.join(',') + '\n';
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'dvd-rental-' + Date.now() + '.csv';
    a.click();
    return 'Table exported as CSV successfully.';
  }
  return 'Export format "' + format + '" not supported. Use: csv.';
}

// ══════════════════════════════════════════════════
//  TRANSFORM FORECAST - TIME SERIES TRANSFORMATION
// ══════════════════════════════════════════════════

async function transformForecast(filmId = null) {
  console.log('🔄 TRANSFORM FORECAST - Processing time series...');
  
  const currentPage = window.location.pathname.split('/').pop();
  
  if (currentPage !== 'inventory.html') {
    window.location.href = '/inventory.html';
    return '📊 Redirecting to inventory page. After load, type "transform forecast" again.';
  }
  
  await new Promise(r => setTimeout(r, 500));
  
  const tabs = document.querySelectorAll('.tab-btn');
  let forecastTab = null;
  for (const tab of tabs) {
    if (tab.textContent.includes('Forecast') || tab.textContent.includes('SMA')) {
      forecastTab = tab;
      break;
    }
  }
  
  if (forecastTab) {
    forecastTab.click();
    await new Promise(r => setTimeout(r, 300));
  }
  
  const select = document.getElementById('forecast-film-select');
  
  if (!select) {
    return '❌ Forecast element not found. Make sure you are on inventory.html page.';
  }
  
  let retry = 0;
  while (select.options.length <= 1 && retry < 10) {
    await new Promise(r => setTimeout(r, 500));
    retry++;
  }
  
  let selectedFilmId = filmId;
  let selectedFilmName = '';
  
  if (!selectedFilmId && select.options.length > 1) {
    selectedFilmId = select.options[1].value;
    selectedFilmName = select.options[1].text;
    select.value = selectedFilmId;
  } else if (selectedFilmId) {
    for (let i = 0; i < select.options.length; i++) {
      if (select.options[i].value == selectedFilmId) {
        select.value = selectedFilmId;
        selectedFilmName = select.options[i].text;
        break;
      }
    }
  }
  
  if (!selectedFilmId) {
    return '❌ No films available. Make sure backend is running and inventory data exists.';
  }
  
  console.log(`📽 Processing forecast for: ${selectedFilmName} (ID: ${selectedFilmId})`);
  
  if (typeof window.runForecast === 'function') {
    await window.runForecast();
    await new Promise(r => setTimeout(r, 1500));
    
    const forecastResult = extractForecastData();
    const insight = generateInsightFromData();
    
    return `✅ **FORECAST TRANSFORMATION COMPLETED!**

🎬 Film: ${selectedFilmName}
📊 Method: SMA (Simple Moving Average)
📈 Forecast Results (12 weeks ahead):

${forecastResult}

💡 **Insight:** ${insight}

📌 The forecast chart has been generated above. Adjust SMA window to change sensitivity.`;
  }
  
  select.dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 1000));
  
  return `✅ **FORECAST PROCESSED!**

🎬 Film: ${selectedFilmName}

📊 Forecast chart should appear above. Select a different film or adjust SMA window.`;
}

function extractForecastData() {
  try {
    if (window.forecastChart && window.forecastChart.data) {
      const datasets = window.forecastChart.data.datasets;
      const forecastDataset = datasets.find(d => d.label && d.label.includes('Forecast'));
      
      if (forecastDataset && forecastDataset.data) {
        const values = forecastDataset.data.filter(v => v !== null && v !== undefined);
        const last4 = values.slice(-4);
        
        if (last4.length >= 4) {
          return `• Week 1: ${Math.round(last4[0])} rentals
• Week 2: ${Math.round(last4[1])} rentals
• Week 3: ${Math.round(last4[2])} rentals
• Week 4: ${Math.round(last4[3])} rentals`;
        } else if (last4.length > 0) {
          return `• Forecast values: ${last4.map(v => Math.round(v)).join(' → ')} rentals`;
        }
      }
    }
    
    const metaVals = document.querySelectorAll('.forecast-meta-val');
    if (metaVals.length >= 2) {
      return `• Total Forecast: ${metaVals[0]?.textContent || 'N/A'}
• Weekly Average: ${metaVals[1]?.textContent || 'N/A'}`;
    }
    
    return '✅ Forecast chart displayed above. Check the visualization for detailed predictions.';
  } catch(e) {
    return '✅ Forecast data has been transformed. View the chart above.';
  }
}

function generateInsightFromData() {
  try {
    if (window.forecastChart && window.forecastChart.data) {
      const datasets = window.forecastChart.data.datasets;
      const forecastDataset = datasets.find(d => d.label && d.label.includes('Forecast'));
      
      if (forecastDataset && forecastDataset.data) {
        const values = forecastDataset.data.filter(v => v !== null);
        if (values.length >= 2) {
          const start = values[values.length - 4] || values[0];
          const end = values[values.length - 1];
          const diff = end - start;
          
          if (diff > 5) return `📈 INCREASING TREND: +${Math.round(diff)} units predicted. Recommendation: Increase stock by 15-20% before peak period.`;
          if (diff < -5) return `📉 DECREASING TREND: ${Math.abs(Math.round(diff))} units decline predicted. Recommendation: Reduce stock or run promotions.`;
          return `➡️ STABLE TREND: Normal fluctuations. Maintain current inventory levels.`;
        }
      }
    }
    
    const metaText = document.querySelector('#forecast-meta')?.innerText || '';
    if (metaText.includes('INCREASING')) return '📈 UPTREND DETECTED: Prepare for higher demand in coming weeks.';
    if (metaText.includes('DECREASING')) return '📉 DOWNTREND DETECTED: Consider inventory optimization.';
    
    return 'Use SMA window slider to adjust forecast sensitivity. Lower window = more responsive to recent changes.';
  } catch(e) {
    return 'Forecast ready for inventory optimization analysis.';
  }
}

async function forecastFilmByName(filmName) {
  const select = document.getElementById('forecast-film-select');
  if (!select) return '❌ Not on inventory page. Please open inventory.html first.';
  
  for (let i = 0; i < select.options.length; i++) {
    const optionText = select.options[i].text.toLowerCase();
    if (optionText.includes(filmName.toLowerCase())) {
      return transformForecast(select.options[i].value);
    }
  }
  
  return `❌ Film "${filmName}" not found. Available films are listed in the dropdown.`;
}

async function showForecast() {
  return transformForecast();
}

// ══════════════════════════════════════════════════
//  API HELPERS
// ══════════════════════════════════════════════════

async function recommendFilm(genre, rating) {
  try {
    const params = new URLSearchParams();
    if (genre && genre !== 'null')   params.append('genre', genre);
    if (rating && rating !== 'null') params.append('rating', rating);
    const res  = await fetch(BASE_URL + '/api/recommend/film?' + params);
    const data = await res.json();
    if (!data.length) return 'No film recommendations found for those filters.';
    return '🎬 Recommended Films:\n' + data.map((f,i) => (i+1) + '. ' + f.title + ' (' + f.genre_name + ' · ' + f.rating + ') — $' + f.total_revenue.toFixed(2)).join('\n');
  } catch { 
    return 'Could not fetch recommendations from server.'; 
  }
}

async function recommendCombination() {
  try {
    const res  = await fetch(BASE_URL + '/api/recommend/best-combination');
    const data = await res.json();
    if (!data.length) return 'No combination data available.';
    return '🏆 Top Genre × Rating Combinations:\n' + data.map((c,i) => (i+1) + '. ' + c.genre_name + ' × ' + c.rating + ' — $' + c.revenue.toFixed(2) + ' (' + c.rentals.toLocaleString() + ' rentals)').join('\n');
  } catch { 
    return 'Could not fetch combination data from server.'; 
  }
}

async function getInsight(scope) {
  try {
    const res  = await fetch(BASE_URL + '/api/insight/' + scope);
    const data = await res.json();
    return data.insight || 'No insight available for this scope.';
  } catch { 
    return 'Could not fetch insight from server.'; 
  }
}

// ══════════════════════════════════════════════════
//  PREDICTION PAGE CONTEXT
// ══════════════════════════════════════════════════

function normRadar(v, avg) {
  return avg > 0 ? Math.min(100, (v / (avg * 2)) * 100) : 50;
}

function buildPredictionContext() {
  const r = window._lastPredictionResult;
  if (!r) return null;

  const inp = r.radar_input;
  const avg = r.radar_avg_popular;

  const LABELS = {
    length:           'Film Length (min)',
    rental_rate:      'Rental Rate ($)',
    replacement_cost: 'Replacement Cost ($)',
    rental_duration:  'Rental Duration (days)',
    num_actors:       'Number of Actors',
  };

  const UNITS = {
    length: ' min', rental_rate: '$', replacement_cost: '$',
    rental_duration: ' days', num_actors: '',
  };

  const attrs      = Object.keys(LABELS);
  const comparison = attrs.map(k => {
    const inpVal  = inp[k] ?? 0;
    const avgVal  = avg[k] ?? 0;
    const normInp = normRadar(inpVal, avgVal);
    const normAvg = normRadar(avgVal, avgVal);
    const diff    = normInp - normAvg;
    const pctDiff = avgVal > 0 ? (((inpVal - avgVal) / avgVal) * 100).toFixed(1) : '0.0';
    return {
      key: k, label: LABELS[k], unit: UNITS[k],
      inpVal, avgVal,
      normInp: normInp.toFixed(1),
      diff, pctDiff,
      status: diff > 8 ? 'ABOVE' : diff < -8 ? 'BELOW' : 'AT',
    };
  });

  const strengths  = comparison.filter(c => c.status === 'ABOVE');
  const weaknesses = comparison.filter(c => c.status === 'BELOW');
  const atAverage  = comparison.filter(c => c.status === 'AT');
  const featureImp = [...(r.feature_importance || [])]
    .sort((a, b) => b.importance - a.importance)
    .map(f => f.feature + ' (' + (f.importance * 100).toFixed(1) + '%)');

  const score = r.popularity_score;
  let blockbusterAssessment;
  if (score >= 70) {
    blockbusterAssessment = 'This film profile has strong blockbuster potential.';
  } else if (score >= 45) {
    blockbusterAssessment = 'This film has moderate hit potential.';
  } else {
    blockbusterAssessment = 'This film profile is unlikely to become a top performer.';
  }

  return {
    score, classification: r.classification, blockbusterAssessment,
    input: r.input, comparison, strengths, weaknesses, atAverage,
    featureImportance: featureImp,
  };
}

function renderPredictionContextText(pc) {
  if (!pc) return '';
  const fmt2 = (v, unit) => unit === '$' ? '$' + Number(v).toFixed(2) : Number(v).toFixed(unit ? 0 : 2) + unit;

  const lines = [
    '─── CURRENT PREDICTION RESULTS ───',
    'Popularity Score : ' + pc.score + ' / 100  (' + pc.classification + ')',
    'Blockbuster Assessment: ' + pc.blockbusterAssessment,
    '',
    'Attribute Comparison (This Film vs Popular Films Average):',
  ];

  pc.comparison.forEach(c => {
    const arrow = c.status === 'ABOVE' ? '▲' : c.status === 'BELOW' ? '▼' : '●';
    lines.push('  ' + arrow + ' ' + c.label + ': ' + fmt2(c.inpVal, c.unit) + ' vs avg ' + fmt2(c.avgVal, c.unit) + '  → ' + (c.pctDiff > 0 ? '+' : '') + c.pctDiff + '%');
  });

  if (pc.strengths.length) {
    lines.push('', 'STRENGTHS:');
    pc.strengths.forEach(c => lines.push('  ✅ ' + c.label + ' is ' + c.pctDiff + '% above average'));
  }
  if (pc.weaknesses.length) {
    lines.push('', 'WEAKNESSES:');
    pc.weaknesses.forEach(c => lines.push('  ⚠️ ' + c.label + ' is ' + Math.abs(c.pctDiff) + '% below average'));
  }

  lines.push('', '─── RADAR CHART DATA POINTS (Scale 0-100 where 50 is Popular Average) ───');
  pc.comparison.forEach(c => {
    lines.push('  • ' + c.label + ': This Film = ' + Number(c.normInp).toFixed(1) + ' / 100, Popular Avg = 50.0 / 100');
  });

  lines.push('', 'FEATURE IMPORTANCE:');
  lines.push('  ' + pc.featureImportance.join(' > '));
  return lines.join('\n');
}

async function getPageContext() {
  const page = window.location.pathname.split('/').pop().replace('.html','') || 'home';
  const kpis = {};
  document.querySelectorAll('.kpi-card, .summary-card').forEach(card => {
    const label = (card.querySelector('.kpi-label') || card.querySelector('.summary-label'))?.textContent?.trim();
    const value = (card.querySelector('.kpi-value') || card.querySelector('.summary-val'))?.textContent?.trim();
    if (label && value) kpis[label] = value;
  });
  const tableHeaders = [...document.querySelectorAll('thead th')].map(th => th.textContent.trim().replace(/↕|↑|↓/g, '').trim());
  const activeTab    = document.querySelector('.tab-btn.active')?.textContent?.trim() || null;
  const chartTitles  = [...document.querySelectorAll('.card-title')].map(t => t.textContent.trim()).slice(0, 6);
  let predictionContext = null;
  if (page === 'prediction') predictionContext = buildPredictionContext();

  // Extract all tables data dynamically
  const tablesData = {};
  document.querySelectorAll('.card').forEach(card => {
    const title = card.querySelector('.card-title')?.textContent?.trim() || 'Data Table';
    const table = card.querySelector('table');
    if (table) {
      const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim().replace(/↕|↑|↓/g, '').trim());
      const rows = [];
      table.querySelectorAll('tbody tr').forEach(tr => {
        const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
        if (cells.length === headers.length) {
          const row = {};
          headers.forEach((h, i) => { row[h] = cells[i]; });
          rows.push(row);
        }
      });
      if (rows.length) {
        tablesData[title] = rows.slice(0, 30); // limit to 30 rows per table to fit context
      }
    }
  });

  return { page, kpis, tableHeaders, activeTab, chartTitles, predictionContext, tablesData };
}

function buildSystemPrompt(ctx) {
  const isPredictionPage = ctx.page === 'prediction';
  const isInventoryPage = ctx.page === 'inventory';

  let prompt = `You are "Antigravity AI", a premium business intelligence assistant for the DVD Rental Dashboard.
Your role is to help users analyze rental performance, interpret predictive models, explain forecasting methods, and navigate/control the dashboard.

CURRENT DASHBOARD CONTEXT:
- Page: ${ctx.page}
- Active Tab: ${ctx.activeTab || 'None'}
- Current Screen Metrics (KPIs): ${JSON.stringify(ctx.kpis)}
- Main Visualizations on Page: ${ctx.chartTitles.join(', ')}
${ctx.tableHeaders.length ? `- Visible Table Columns: ${ctx.tableHeaders.join(', ')}` : ''}
${ctx.tablesData && Object.keys(ctx.tablesData).length ? `- Visible Table Data (Max 30 rows per table): ${JSON.stringify(ctx.tablesData)}` : ''}

${isPredictionPage && ctx.predictionContext ? `\nPREDICTION CONTEXT (Random Forest Model):\n${renderPredictionContextText(ctx.predictionContext)}` : ''}

BUSINESS KNOWLEDGE BASE:
1. TOP GENRES: Sports, Sci-Fi, and Animation are consistently the highest revenue and rental volume drivers in our Sakila dataset.
2. RATINGS MIX: PG-13 and R ratings generally generate the highest revenue because they appeal to the largest demographic of renters. NC-17 has high average revenue per rental but lower volume.
3. FORECASTING METHOD: We use a Simple Moving Average (SMA) time-series model on the inventory page to predict future rentals (up to 12 weeks). Lowering the window size makes the forecast more responsive to recent trends.
4. PREDICTIVE POPULARITY MODEL: The prediction page uses a Random Forest classifier trained on film characteristics (length, rental rate, replacement cost, number of actors) to classify if a hypothetical new movie profile will be a "Blockbuster", "Hit", or "Flop".

AVAILABLE ACTIONS:
You can control the dashboard by embedding one or more action tags at the end of your response.
- [ACTION:transformForecast] - Run and display inventory forecasting (Inventory page only).
- [ACTION:forecastFilmByName:Film Name] - Run forecast for a specific film (Inventory page only).
- [ACTION:changeTheme:dark] / [ACTION:changeTheme:light] / [ACTION:changeTheme:gold] / [ACTION:changeTheme:midnight] / [ACTION:changeTheme:forest] - Toggle dashboard themes.
- [ACTION:exportData:csv] - Download current table data as CSV.
- [ACTION:highlightElement:table] / [ACTION:highlightElement:chart] / [ACTION:highlightElement:kpi] - Flash highlight elements to guide the user's focus.
- [ACTION:recommendFilm:GenreName:RatingName] - Recommend top rentals matching genre and rating (use "null" if omitted, e.g. recommendFilm:Action:null).
- [ACTION:recommendCombination] - List top-performing Genre x Rating combinations.
- [ACTION:getInsight:inventory] / [ACTION:getInsight:general] - Get server-generated insights.

CONVERSATION & RESPONSE RULES:
1. RESPONSE LANGUAGE: You must ALWAYS respond in English. Even if the user asks in another language (such as Indonesian), you must translate and reply exclusively in English.
2. COMPREHENSIVE RESPONSES: Do not limit yourself to short commands. Answer analytical questions, explain business trends, explain what charts represent, and offer strategic business recommendations.
3. IN-DEPTH ANALYSIS: Use the CURRENT SCREEN METRICS, VISIBLE TABLE DATA, and BUSINESS KNOWLEDGE BASE to give specific, concrete answers rather than generic replies. E.g., reference specific numbers, genres, or film stock levels present on the page!
4. ACTION TAGS: Only append action tags when the user explicitly requests them (e.g. "ganti tema ke light", "ekspor data", "ramal film sports") or they are logically required. Do not spam them.`;

  return prompt;
}

async function executeActions(text) {
  const regex = /\[ACTION:([^\]]+)\]/g;
  let match;
  const results = [];
  let cleanText = text.replace(/\[ACTION:[^\]]+\]/g, '').trim();
  
  while ((match = regex.exec(text)) !== null) {
    const parts = match[1].split(':');
    const fn = parts[0];
    const a  = parts.slice(1);
    try {
      switch(fn) {
        case 'transformForecast':
          const transformResult = await transformForecast();
          results.push(transformResult);
          break;
        case 'forecastFilmByName':
          const filmResult = await forecastFilmByName(a.join(':'));
          results.push(filmResult);
          break;
        case 'showForecast':
          const showResult = await transformForecast();
          results.push(showResult);
          break;
        case 'changeTheme':          
          results.push(changeTheme(a[0])); 
          break;
        case 'changeChartType':      
          results.push(changeChartType(a[0])); 
          break;
        case 'filterData':           
          results.push(filterData(a[0], a[1])); 
          break;
        case 'sortData':             
          results.push(sortData(a[0], a[1])); 
          break;
        case 'highlightElement':     
          results.push(highlightElement(a[0])); 
          break;
        case 'exportData':           
          results.push(exportData(a[0])); 
          break;
        case 'scrollTo':             
          results.push(scrollToSection(a[0])); 
          break;
        case 'changeBackground':     
          results.push(changeBackgroundColor(a[0])); 
          break;
        case 'recommendFilm':        
          results.push(await recommendFilm(a[0], a[1])); 
          break;
        case 'recommendCombination': 
          results.push(await recommendCombination()); 
          break;
        case 'getInsight':           
          results.push(await getInsight(a[0])); 
          break;
      }
    } catch(e) { 
      console.warn('Action failed:', fn, e); 
    }
  }
  return { cleanText, results };
}

// ══════════════════════════════════════════════════
//  GROQ AI ONLY (FAST)
// ══════════════════════════════════════════════════

async function callGroq(userMessage, history) {
  if (!GROQ_API_KEY || GROQ_API_KEY === 'YOUR_GROQ_API_KEY_HERE') {
    return { text: '⚠️ Groq API key not set. Please check the API key.', actions: [] };
  }
  
  // Rate limit protection
  const now = Date.now();
  const timeSinceLastCall = now - _lastGroqCall;
  if (timeSinceLastCall < GROQ_RATE_LIMIT_DELAY) {
    const waitTime = Math.ceil((GROQ_RATE_LIMIT_DELAY - timeSinceLastCall) / 1000);
    return { 
      text: `⏱️ Please wait ${waitTime} second(s) before sending another message. This prevents rate limiting.`, 
      actions: [] 
    };
  }
  
  _lastGroqCall = now;
  
  const ctx = await getPageContext();
  const messages = [
    { role: 'system', content: buildSystemPrompt(ctx) },
    ...history.slice(-6),
    { role: 'user', content: userMessage }
  ];
  
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY },
      body: JSON.stringify({ model: GROQ_MODEL, messages, max_tokens: 400, temperature: 0.3 }),
    });
    
    if (res.status === 429) {
      // Reset timer on rate limit
      _lastGroqCall = 0;
      return { 
        text: `⚠️ **Rate limit reached!** Please wait 30-60 seconds before sending another message. Groq free tier has limits.\n\n💡 Tip: Type "transform forecast" directly - this bypasses AI and runs immediately.`, 
        actions: [] 
      };
    }
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'HTTP ' + res.status);
    }
    
    const data = await res.json();
    const raw  = data.choices?.[0]?.message?.content || 'No response received.';
    const { cleanText, results } = await executeActions(raw);
    return { text: cleanText, actions: results };
    
  } catch(e) {
    console.error('Groq error:', e);
    return { text: '❌ Error: ' + e.message + '\n\nTry typing "transform forecast" directly - this bypasses the AI and runs the forecast immediately.', actions: [] };
  }
}

// Alias for compatibility
async function callActiveAI(userMessage, history) {
  return callGroq(userMessage, history);
}

// ══════════════════════════════════════════════════
//  POPUP UI INIT
// ══════════════════════════════════════════════════

let conversationHistory = [];

function initAIPopup() {
  const fab      = document.getElementById('ai-fab');
  const modal    = document.getElementById('ai-modal');
  const backdrop = document.getElementById('ai-modal-backdrop');
  const closeBtn = document.getElementById('ai-modal-close');
  const messages = document.getElementById('ai-chat-messages');
  const input    = document.getElementById('ai-chat-input');
  const sendBtn  = document.getElementById('ai-send-btn');
  if (!fab) return;

  // Remove mode selector since we only use Groq
  const existingModeRow = document.getElementById('ai-mode-row');
  if (existingModeRow) existingModeRow.remove();

  fab.addEventListener('click', () => { modal.classList.add('open'); input.focus(); });
  closeBtn.addEventListener('click', () => modal.classList.remove('open'));
  backdrop.addEventListener('click', () => modal.classList.remove('open'));

  function appendMsg(text, type) {
    const div = document.createElement('div');
    div.className = 'chat-msg ' + type;
    div.innerHTML = text
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\n/g,'<br>');
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  appendMsg(`👋 Hello! I am your DVD Rental AI Assistant.
  
📄 Page: **${currentPage}**

💬 **Example Prompts:**
• *"Give me a business analysis of film genres"* (Business Analysis)
• *"Forecast stock requirements for the movie Blade"* (Inventory Forecast)
• *"Export the current table data to CSV"* (Dashboard Control)
• *"Switch the theme to Midnight Blue"* (Theme Settings)

💡 I can assist with business insights, chart interpretations, inventory forecasting, and theme customization. Ask me anything!`, 'ai');

  async function handleSend() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';

    appendMsg(text, 'user');
    conversationHistory.push({ role: 'user', content: text });

    const typing    = appendMsg('⚡ Processing with Groq...', 'ai');
    typing.style.opacity   = '0.5';
    typing.style.fontStyle = 'italic';

    const { text: reply, actions } = await callActiveAI(text, conversationHistory);
    typing.remove();

    if (reply) {
      appendMsg(reply, 'ai');
      conversationHistory.push({ role: 'assistant', content: reply });
    }
    if (actions && actions.length > 0) {
      actions.forEach(r => { if (r) appendMsg('📊 ' + r, 'system'); });
    }
    
    // Keep history reasonable
    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-15);
    }
  }

  sendBtn.addEventListener('click', handleSend);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });
}

document.addEventListener('DOMContentLoaded', initAIPopup);