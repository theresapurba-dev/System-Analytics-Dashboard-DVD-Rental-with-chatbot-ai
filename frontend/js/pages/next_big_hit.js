/**
 * pages/next_big_hit.js — Random Forest popularity predictor UI.
 * AI may EXPLAIN results but NOT retrain the model.
 */
import { getGenres, getFilmFeatures, postPredict } from "../api.js";
import { ChartRegistry } from "../chart_registry.js";

const PALETTE = ["#E6A341","#B14A36","#8C0902","#FECE79","#210100","#D4845A","#A0522D","#C0392B"];

let _gaugeChart = null;
let _featureChart = null;

function buildGauge(score, color) {
  const ctx = document.getElementById("popularity_gauge")?.getContext("2d");
  if (!ctx) return;
  if (_gaugeChart) { _gaugeChart.destroy(); ChartRegistry.destroy("popularity_gauge"); }

  const chart = new Chart(ctx, {
    type: "doughnut",
    data: {
      datasets: [{
        data: [score, 100 - score],
        backgroundColor: [color, "rgba(0,0,0,0.07)"],
        borderWidth: 0,
        circumference: 180,
        rotation: -90,
      }]
    },
    options: {
      responsive: true,
      cutout: "75%",
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    }
  });
  _gaugeChart = chart;
  ChartRegistry.register("popularity_gauge", chart);
}

function buildFeatureChart(featImp) {
  const card = document.getElementById("feature-card");
  card.style.display = "block";

  const ctx = document.getElementById("feature_chart")?.getContext("2d");
  if (!ctx) return;
  if (_featureChart) { _featureChart.destroy(); ChartRegistry.destroy("feature_chart"); }

  const labels = featImp.map(([n]) => n.replace(/_/g, " "));
  const values = featImp.map(([, v]) => (v * 100).toFixed(2));

  const chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Importance (%)",
        data: values,
        backgroundColor: PALETTE,
        borderRadius: 5,
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { callback: v => v + "%" }, grid: { color: "rgba(0,0,0,.05)" } },
        y: { grid: { display: false } },
      }
    }
  });
  _featureChart = chart;
  ChartRegistry.register("feature_chart", chart);
}

function showResult(data) {
  document.getElementById("nbh-score").textContent = data.score;
  document.getElementById("nbh-score").style.color  = data.color;
  document.getElementById("nbh-label").textContent   = data.label;
  document.getElementById("nbh-label").style.color   = data.color;
  buildGauge(data.score, data.color);
  if (data.feature_importance?.length) {
    buildFeatureChart(data.feature_importance);
  }
}

function getFormValues() {
  const sf = [];
  if (document.getElementById("nbh-trailers")?.checked)      sf.push("Trailers");
  if (document.getElementById("nbh-commentaries")?.checked)  sf.push("Commentaries");
  if (document.getElementById("nbh-deleted")?.checked)       sf.push("Deleted Scenes");
  if (document.getElementById("nbh-behind")?.checked)        sf.push("Behind the Scenes");

  return {
    genre_name:       document.getElementById("nbh-genre")?.value,
    rating:           document.getElementById("nbh-rating")?.value,
    length:           parseFloat(document.getElementById("nbh-length")?.value || 100),
    rental_rate:      parseFloat(document.getElementById("nbh-rate")?.value   || 2.99),
    replacement_cost: parseFloat(document.getElementById("nbh-cost")?.value   || 19.99),
    rental_duration:  parseInt(document.getElementById("nbh-duration")?.value || 3),
    num_actors:       parseInt(document.getElementById("nbh-actors")?.value   || 5),
    special_features: sf.join(","),
  };
}

export async function init() {
  // Populate genre select
  const gRes = await getGenres().catch(() => null);
  if (gRes?.ok) {
    const sel = document.getElementById("nbh-genre");
    gRes.data.forEach(g => {
      const opt = document.createElement("option");
      opt.value = g; opt.textContent = g;
      if (g === "Drama") opt.selected = true;
      sel.appendChild(opt);
    });
  }

  // Populate film lookup select
  const fRes = await getFilmFeatures().catch(() => null);
  if (fRes?.ok) {
    const sel = document.getElementById("nbh-film-select");
    fRes.data.slice(0, 200).forEach(f => {
      const opt = document.createElement("option");
      opt.value = f.film_id;
      opt.textContent = `${f.title} (${f.genre_name || "?"})`;
      sel.appendChild(opt);
    });
  }

  // Manual predict
  document.getElementById("btn-predict")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-predict");
    btn.disabled = true; btn.textContent = "Predicting…";
    try {
      const res = await postPredict(getFormValues());
      if (res.ok) showResult(res.data);
      else alert("Prediction error: " + res.error);
    } catch (e) { alert(e.message); }
    finally { btn.disabled = false; btn.textContent = "🔮 Predict Popularity"; }
  });

  // Film lookup predict
  document.getElementById("btn-predict-film")?.addEventListener("click", async () => {
    const filmId = document.getElementById("nbh-film-select")?.value;
    if (!filmId) return;
    const btn = document.getElementById("btn-predict-film");
    btn.disabled = true; btn.textContent = "Loading…";
    try {
      const res = await postPredict({ film_id: parseInt(filmId) });
      if (res.ok) showResult(res.data);
      else alert("Prediction error: " + res.error);
    } catch (e) { alert(e.message); }
    finally { btn.disabled = false; btn.textContent = "Predict Selected Film"; }
  });
}

export function cleanup() {
  if (_gaugeChart)   { _gaugeChart.destroy(); }
  if (_featureChart) { _featureChart.destroy(); }
}
