"use strict";

const STORAGE = {
  matches: "fq_matches_v1",
  predictions: "fq_predictions_v1"
};

const $ = (id) => document.getElementById(id);

function loadJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

let matches = loadJSON(STORAGE.matches, []);
let predictions = loadJSON(STORAGE.predictions, []);

function formatPercent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatEuro(value) {
  return value.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR"
  });
}

function poisson(k, lambda) {
  if (k < 0 || !Number.isInteger(k)) return 0;

  let factorial = 1;

  for (let i = 2; i <= k; i++) {
    factorial *= i;
  }

  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial;
}

function calculateModel(lambdaHome, lambdaAway) {
  const maxGoals = 12;

  const homeProb = [];
  const awayProb = [];

  for (let i = 0; i <= maxGoals; i++) {
    homeProb.push(poisson(i, lambdaHome));
    awayProb.push(poisson(i, lambdaAway));
  }

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let over25 = 0;
  let bothScore = 0;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const probability = homeProb[h] * awayProb[a];

      if (h > a) homeWin += probability;
      else if (h === a) draw += probability;
      else awayWin += probability;

      if (h + a >= 3) over25 += probability;
      if (h > 0 && a > 0) bothScore += probability;
    }
  }

  return {
    homeWin,
    draw,
    awayWin,
    over25,
    under25: 1 - over25,
    bothScore,
    noBothScore: 1 - bothScore
  };
}

function resultCard(label, value) {
  const card = document.createElement("div");
  card.className = "result-card";

  const title = document.createElement("span");
  title.textContent = label;

  const number = document.createElement("strong");
  number.textContent = value;

  card.append(title, number);

  return card;
}

function renderAnalysisResults(model) {
  const container = $("analysisResults");
  container.replaceChildren();

  const values = [
    ["Vittoria casa", model.homeWin],
    ["Pareggio", model.draw],
    ["Vittoria ospite", model.awayWin],
    ["Over 2,5", model.over25],
    ["Under 2,5", model.under25],
    ["Goal", model.bothScore],
    ["No Goal", model.noBothScore]
  ];

  for (const [label, value] of values) {
    container.appendChild(
      resultCard(label, formatPercent(value))
    );
  }
}

function renderValueResults(probability, odds) {
  const container = $("valueResults");
  container.replaceChildren();

  const implied = 1 / odds;
  const expectedValue = probability * odds - 1;
  const fairOdds = 1 / probability;

  container.append(
    resultCard("Probabilità stimata", formatPercent(probability)),
    resultCard("Probabilità implicita", formatPercent(implied)),
    resultCard("Quota equa teorica", fairOdds.toFixed(2)),
    resultCard("Valore atteso", formatPercent(expectedValue))
  );

  const note = document.createElement("p");
  note.className = "disclaimer";

  note.textContent =
    "Valore teorico prima di eventuali costi. " +
    "Non dimostra che la probabilità stimata sia corretta.";

  container.appendChild(note);
}

function renderDashboard() {
  $("matchesCount").textContent = matches.length;
  $("predictionsCount").textContent = predictions.length;

  $("bankrollValue").textContent = formatEuro(500);

  $("systemStatus").textContent =
    matches.length > 0 ? "DATI CARICATI" : "PRONTO";

  renderPredictionHistory();
}

function renderPredictionHistory() {
  const container = $("predictionHistory");
  container.replaceChildren();

  if (predictions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Nessuna previsione registrata.";
    container.appendChild(empty);
    return;
  }

  const tableWrapper = document.createElement("div");
  tableWrapper.className = "table-wrapper";

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  for (const heading of [
    "Data",
    "Mercato",
    "Probabilità",
    "Quota",
    "EV teorico"
  ]) {
    const th = document.createElement("th");
    th.textContent = heading;
    headerRow.appendChild(th);
  }

  thead.appendChild(headerRow);

  const tbody = document.createElement("tbody");

  for (const prediction of predictions.slice().reverse()) {
    const row = document.createElement("tr");

    const cells = [
      prediction.date,
      prediction.market,
      formatPercent(prediction.probability),
      prediction.odds.toFixed(2),
      formatPercent(prediction.ev)
    ];

    for (const value of cells) {
      const td = document.createElement("td");
      td.textContent = value;
      row.appendChild(td);
    }

    tbody.appendChild(row);
  }

  table.append(thead, tbody);
  tableWrapper.appendChild(table);
  container.appendChild(tableWrapper);
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());

  return result;
}

function parseCSV(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());

  if (lines.length < 2) {
    throw new Error("Il CSV non contiene righe sufficienti.");
  }

  const headers = parseCSVLine(lines[0]).map((header) =>
    header.trim().toLowerCase()
  );

  const aliases = {
    date: ["date", "data"],
    home: ["home", "hometeam", "home_team", "casa", "squadra casa"],
    away: ["away", "awayteam", "away_team", "ospite", "squadra ospite"],
    homeGoals: ["fthg", "homegoals", "home_goals", "gol casa"],
    awayGoals: ["ftag", "awaygoals", "away_goals", "gol ospite"]
  };

  function findIndex(names) {
    return headers.findIndex((header) => names.includes(header));
  }

  const indexes = {
    date: findIndex(aliases.date),
    home: findIndex(aliases.home),
    away: findIndex(aliases.away),
    homeGoals: findIndex(aliases.homeGoals),
    awayGoals: findIndex(aliases.awayGoals)
  };

  for (const [key, index] of Object.entries(indexes)) {
    if (index < 0) {
      throw new Error(`Colonna mancante nel CSV: ${key}`);
    }
  }

  const output = [];

  for (let i = 1; i < lines.length; i++) {
    const columns = parseCSVLine(lines[i]);

    const homeGoals = Number(columns[indexes.homeGoals]);
    const awayGoals = Number(columns[indexes.awayGoals]);

    if (
      !Number.isInteger(homeGoals) ||
      !Number.isInteger(awayGoals) ||
      homeGoals < 0 ||
      awayGoals < 0
    ) {
      continue;
    }

    output.push({
      date: columns[indexes.date],
      home: columns[indexes.home],
      away: columns[indexes.away],
      homeGoals,
      awayGoals
    });
  }

  return output;
}

$("analysisForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const home = Number($("lambdaHome").value);
  const away = Number($("lambdaAway").value);

  if (
    !Number.isFinite(home) ||
    !Number.isFinite(away) ||
    home <= 0 ||
    away <= 0 ||
    home > 6 ||
    away > 6
  ) {
    alert("Inserisci valori compresi tra 0,1 e 6.");
    return;
  }

  const model = calculateModel(home, away);
  renderAnalysisResults(model);
});

$("valueForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const probability =
    Number($("estimatedProbability").value) / 100;

  const odds = Number($("decimalOdds").value);

  if (
    !Number.isFinite(probability) ||
    !Number.isFinite(odds) ||
    probability <= 0 ||
    probability > 1 ||
    odds <= 1 ||
    odds > 1000
  ) {
    alert("Controlla probabilità e quota.");
    return;
  }

  renderValueResults(probability, odds);

  predictions.push({
    date: new Date().toISOString(),
    market: "Analisi manuale",
    probability,
    odds,
    ev: probability * odds - 1
  });

  saveJSON(STORAGE.predictions, predictions);
  renderDashboard();
});

$("csvFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];

  if (!file) return;

  try {
    const text = await file.text();
    const imported = parseCSV(text);

    matches = imported;

    saveJSON(STORAGE.matches, matches);

    $("fileStatus").textContent =
      `Importate ${matches.length} partite.`;

    renderMatches();
    renderDashboard();
  } catch (error) {
    $("fileStatus").textContent =
      `Errore: ${error.message}`;
  }
});

function renderMatches() {
  const tbody = $("matchesTable");
  tbody.replaceChildren();

  if (matches.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 4;
    cell.className = "empty";
    cell.textContent = "Nessuna partita disponibile.";

    row.appendChild(cell);
    tbody.appendChild(row);

    return;
  }

  for (const match of matches.slice(0, 100)) {
    const row = document.createElement("tr");

    const values = [
      match.date,
      match.home,
      match.away,
      `${match.homeGoals} - ${match.awayGoals}`
    ];

    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    }

    tbody.appendChild(row);
  }
}

$("exportPredictions").addEventListener("click", () => {
  if (predictions.length === 0) {
    alert("Non ci sono previsioni da esportare.");
    return;
  }

  const headers = [
    "date",
    "market",
    "probability",
    "odds",
    "expected_value"
  ];

  const escapeCSV = (value) =>
    `"${String(value).replace(/"/g, '""')}"`;

  const rows = predictions.map((prediction) =>
    headers.map((header) => escapeCSV(
      header === "expected_value"
        ? prediction.ev
        : prediction[header]
    )).join(",")
  );

  const csv = [headers.join(","), ...rows].join("\n");

  const blob = new Blob(
    ["\uFEFF", csv],
    { type: "text/csv;charset=utf-8;" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "football-quant-predictions.csv";
  link.click();

  URL.revokeObjectURL(url);
});

function initialize() {
  renderDashboard();
  renderMatches();
}

initialize();
