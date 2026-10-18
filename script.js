const API_BASE = "https://open.er-api.com/v6/latest/";
const CACHE_MS = 30 * 60 * 1000;
const POPULAR = ["USD", "EUR", "JPY", "GBP"];
const FLAG_MAP = {
  IDR: "🇮🇩", USD: "🇺🇸", EUR: "🇪🇺", JPY: "🇯🇵", GBP: "🇬🇧",
  MYR: "🇲🇾", SGD: "🇸🇬", AUD: "🇦🇺", CAD: "🇨🇦", CHF: "🇨🇭",
  CNY: "🇨🇳", INR: "🇮🇳", KRW: "🇰🇷", THB: "🇹🇭", PHP: "🇵🇭",
  NZD: "🇳🇿", HKD: "🇭🇰", SAR: "🇸🇦", AED: "🇦🇪", VND: "🇻🇳",
  BRL: "🇧🇷", MXN: "🇲🇽", ZAR: "🇿🇦", TRY: "🇹🇷", SEK: "🇸🇪",
  NOK: "🇳🇴", DKK: "🇩🇰", PLN: "🇵🇱", RUB: "🇷🇺", PKR: "🇵🇰"
};
const COLORS = ["#72e0dc", "#3f9ce5", "#79c9ee", "#a99ae9"];
const $ = (id) => document.getElementById(id);

const amountInput = $("amount");
const fromSelect = $("fromCurrency");
const toSelect = $("toCurrency");
const resultAmount = $("resultAmount");
const rateLine = $("rateLine");
const updatedLine = $("updatedLine");
const statusMessage = $("statusMessage");
const convertBtn = $("convertBtn");
const rateList = $("rateList");
const toast = $("toast");

let currencies = {};
let rateCache = new Map();
let latestRates = {};
let updateTimestamp = "";
let expandedRates = false;
let chart = null;
let toastTimer = null;

function currencyName(code) {
  try {
    return new Intl.DisplayNames(["id"], { type: "currency" }).of(code) || code;
  } catch {
    return code;
  }
}

function flagFor(code) {
  return FLAG_MAP[code] || "💱";
}

function money(value, code) {
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: code,
      maximumFractionDigits: code === "IDR" || code === "JPY" || code === "KRW" ? 0 : 4
    }).format(value);
  } catch {
    return `${value.toLocaleString("id-ID", { maximumFractionDigits: 4 })} ${code}`;
  }
}

function numberFormat(value, maximumFractionDigits = 4) {
  return Number(value).toLocaleString("id-ID", { maximumFractionDigits });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

async function getRates(base, force = false) {
  const cached = rateCache.get(base);
  if (!force && cached && Date.now() - cached.savedAt < CACHE_MS) return cached.data;

  const response = await fetch(`${API_BASE}${encodeURIComponent(base)}`, {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error("Layanan kurs sedang tidak bisa dihubungi.");
  const data = await response.json();
  if (data.result !== "success" || !data.rates) {
    throw new Error("Data kurs tidak tersedia untuk saat ini.");
  }

  rateCache.set(base, { data: data.rates, savedAt: Date.now() });
  if (base === "USD") {
    updateTimestamp = data.time_last_update_utc || "";
    latestRates = data.rates;
  }
  return data.rates;
}

function populateSelect(select, selected) {
  const codes = Object.keys(currencies).sort((a, b) => a.localeCompare(b));
  select.replaceChildren();
  for (const code of codes) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = `${code} · ${currencies[code]}`;
    select.appendChild(option);
  }
  select.value = codes.includes(selected) ? selected : (codes[0] || "");
}

function updateFlags() {
  $("fromFlag").textContent = flagFor(fromSelect.value);
  $("toFlag").textContent = flagFor(toSelect.value);
}

async function convertCurrency({ save = true } = {}) {
  const rawAmount = amountInput.value.trim();
  const amount = Number(rawAmount);
  const from = fromSelect.value;
  const to = toSelect.value;

  if (rawAmount === "" || !Number.isFinite(amount) || amount < 0) {
    resultAmount.textContent = "Nominal tidak valid";
    rateLine.textContent = "Masukkan angka nol atau lebih.";
    return;
  }
  if (!from || !to) return;

  convertBtn.disabled = true;
  convertBtn.textContent = "Menghitung...";
  statusMessage.textContent = "Mengambil nilai tukar terbaru...";

  try {
    const rates = await getRates(from);
    const exchangeRate = rates[to];
    if (typeof exchangeRate !== "number") throw new Error("Pasangan mata uang ini belum tersedia.");

    const converted = amount * exchangeRate;
    resultAmount.textContent = money(converted, to);
    rateLine.textContent = `1 ${from} = ${numberFormat(exchangeRate, 6)} ${to}`;
    updatedLine.textContent = updateTimestamp
      ? `Pembaruan data: ${updateTimestamp} · Kurs indikatif`
      : "Kurs indikatif, bukan kurs transaksi bank.";
    statusMessage.textContent = "Konversi berhasil. Nilai dapat berubah mengikuti pembaruan kurs.";
    updateFlags();

    if (save) addHistory({ amount, from, to, converted, time: Date.now() });
  } catch (error) {
    resultAmount.textContent = "Kurs tidak tersedia";
    rateLine.textContent = "Periksa koneksi internet lalu coba lagi.";
    statusMessage.textContent = error.message || "Terjadi kesalahan saat mengambil kurs.";
  } finally {
    convertBtn.disabled = false;
    convertBtn.innerHTML = 'Konversi sekarang <span>→</span>';
  }
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem("gc-history") || "[]"); }
  catch { return []; }
}

function addHistory(item) {
  const history = getHistory();
  const last = history[0];
  if (last && last.from === item.from && last.to === item.to &&
      last.amount === item.amount && Date.now() - last.time < 5000) return;
  history.unshift(item);
  localStorage.setItem("gc-history", JSON.stringify(history.slice(0, 8)));
  renderHistory();
}

function renderHistory() {
  const list = $("historyList");
  const history = getHistory();
  list.replaceChildren();

  if (!history.length) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = "Belum ada riwayat. Lakukan konversi untuk mulai.";
    list.appendChild(p);
    return;
  }

  for (const item of history.slice(0, 5)) {
    const row = document.createElement("div");
    row.className = "history-item";
    const left = document.createElement("div");
    const title = document.createElement("span");
    title.textContent = `${money(item.amount, item.from)} → ${item.to}`;
    const date = document.createElement("small");
    date.textContent = new Date(item.time).toLocaleString("id-ID");
    left.append(title, date);
    const right = document.createElement("strong");
    right.textContent = money(item.converted, item.to);
    row.append(left, right);
    list.appendChild(row);
  }
}

function getFavorites() {
  try { return JSON.parse(localStorage.getItem("gc-favorites") || "[]"); }
  catch { return []; }
}

function updateFavoriteCounts() {
  const count = getFavorites().length;
  $("savedCount").textContent = count.toString().padStart(2, "0");
  $("favoriteCount").textContent = count.toString().padStart(2, "0");
}

function saveCurrentPair() {
  const from = fromSelect.value;
  const to = toSelect.value;
  if (!from || !to) return;
  const favorites = getFavorites();
  const key = `${from}-${to}`;
  if (favorites.some(item => item.key === key)) {
    showToast("Pasangan ini sudah ada di favorit.");
    return;
  }
  favorites.unshift({ key, from, to });
  localStorage.setItem("gc-favorites", JSON.stringify(favorites.slice(0, 12)));
  updateFavoriteCounts();
  showToast(`${from} → ${to} disimpan ke favorit.`);
}

function renderChart() {
  const canvas = $("currencyChart");
  if (typeof Chart === "undefined") {
    $("chartLegend").textContent = "Grafik membutuhkan koneksi internet.";
    return;
  }

  if (chart) chart.destroy();
  chart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: POPULAR,
      datasets: [{
        data: [42, 28, 18, 12],
        backgroundColor: COLORS,
        borderColor: "#294861",
        borderWidth: 3,
        hoverOffset: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: "66%",
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        label: context => `${context.label}: ${context.raw}% (ilustrasi)`
      }}}
    }
  });

  const legend = $("chartLegend");
  legend.replaceChildren();
  POPULAR.forEach((code, index) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    const dot = document.createElement("span");
    dot.className = "legend-dot";
    dot.style.backgroundColor = COLORS[index];
    const name = document.createElement("span");
    name.textContent = code;
    const percent = document.createElement("strong");
    percent.textContent = [42, 28, 18, 12][index] + "%";
    item.append(dot, name, percent);
    legend.appendChild(item);
  });
}

function renderRates() {
  const base = "IDR";
  const preferred = ["USD", "EUR", "JPY", "GBP", "MYR", "SGD", "AUD", "CNY", "INR", "KRW"];
  const codes = expandedRates ? preferred : preferred.slice(0, 3);
  rateList.replaceChildren();

  if (!latestRates.IDR) {
    rateList.innerHTML = '<div class="loading-row">Kurs belum tersedia.</div>';
    return;
  }

  codes.forEach(code => {
    if (typeof latestRates[code] !== "number" || latestRates[code] === 0) return;
    const idrPerUnit = 1 / latestRates[code];
    const row = document.createElement("div");
    row.className = "rate-row";

    const flag = document.createElement("span");
    flag.className = "rate-flag";
    flag.textContent = flagFor(code);

    const name = document.createElement("div");
    name.className = "rate-name";
    const strong = document.createElement("strong");
    strong.textContent = `${code} / IDR`;
    const small = document.createElement("small");
    small.textContent = currencies[code] || currencyName(code);
    name.append(strong, small);

    const value = document.createElement("div");
    value.className = "rate-value";
    const valueStrong = document.createElement("strong");
    valueStrong.textContent = numberFormat(idrPerUnit, code === "JPY" || code === "KRW" ? 2 : 0);
    const valueSmall = document.createElement("small");
    valueSmall.textContent = "● Kurs indikatif";
    value.append(valueStrong, valueSmall);

    row.append(flag, name, value);
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Gunakan ${code} sebagai mata uang tujuan`);
    row.addEventListener("click", () => {
      fromSelect.value = "IDR";
      toSelect.value = code;
      amountInput.value = "10000";
      updateFlags();
      document.getElementById("converter").scrollIntoView({ behavior: "smooth", block: "start" });
      convertCurrency();
    });
    rateList.appendChild(row);
  });
}

function updateSearch(query) {
  const normalized = query.trim().toLowerCase();
  for (const option of fromSelect.options) {
    option.hidden = normalized !== "" &&
      !option.textContent.toLowerCase().includes(normalized);
  }
  for (const option of toSelect.options) {
    option.hidden = normalized !== "" &&
      !option.textContent.toLowerCase().includes(normalized);
  }
  if (normalized) {
    const match = Object.keys(currencies).find(code =>
      code.toLowerCase().includes(normalized) ||
      currencies[code].toLowerCase().includes(normalized)
    );
    if (match) {
      toSelect.value = match;
      updateFlags();
      convertCurrency({ save: false });
    }
  }
}

async function initialize(force = false) {
  $("refreshBtn").disabled = true;
  statusMessage.textContent = force ? "Memperbarui kurs..." : "Menghubungkan ke layanan kurs...";
  try {
    const rates = await getRates("USD", force);
    currencies = {};
    Object.keys(rates).sort().forEach(code => {
      currencies[code] = currencyName(code);
    });

    populateSelect(fromSelect, "IDR");
    populateSelect(toSelect, "USD");
    $("currencyCount").textContent = Object.keys(currencies).length + "+";
    $("updateDate").textContent = updateTimestamp
      ? new Date(updateTimestamp).toLocaleDateString("id-ID")
      : "Tersedia online";

    // Rates panel shows the amount of IDR per 1 unit of foreign currency.
    const idrRates = await getRates("IDR", force);
    latestRates = idrRates;
    renderRates();
    renderChart();
    updateFavoriteCounts();
    renderHistory();
    updateFlags();
    await convertCurrency({ save: false });
    if (force) showToast("Data kurs berhasil diperbarui.");
  } catch (error) {
    statusMessage.textContent = "Tidak dapat memuat kurs. Periksa koneksi internet lalu tekan tombol ↻.";
    rateLine.textContent = "Koneksi ke layanan kurs gagal.";
    resultAmount.textContent = "—";
    rateList.innerHTML = '<div class="loading-row">Data kurs tidak bisa dimuat. Coba refresh.</div>';
    showToast("Gagal mengambil kurs online.");
  } finally {
    $("refreshBtn").disabled = false;
  }
}

convertBtn.addEventListener("click", () => convertCurrency());
amountInput.addEventListener("input", () => {
  if (amountInput.value !== "") convertCurrency({ save: false });
});
amountInput.addEventListener("keydown", event => {
  if (event.key === "Enter") convertCurrency();
});
fromSelect.addEventListener("change", () => { updateFlags(); convertCurrency(); });
toSelect.addEventListener("change", () => { updateFlags(); convertCurrency(); });

$("swapBtn").addEventListener("click", () => {
  const previous = fromSelect.value;
  fromSelect.value = toSelect.value;
  toSelect.value = previous;
  updateFlags();
  convertCurrency();
});

$("refreshBtn").addEventListener("click", () => initialize(true));
$("saveFavoriteBtn").addEventListener("click", saveCurrentPair);
$("showMoreRates").addEventListener("click", () => {
  expandedRates = !expandedRates;
  renderRates();
  $("showMoreRates").innerHTML = expandedRates
    ? 'Tampilkan lebih sedikit <span>↑</span>'
    : 'Lihat mata uang lainnya <span>↓</span>';
});
$("clearHistoryBtn").addEventListener("click", () => {
  localStorage.removeItem("gc-history");
  renderHistory();
  showToast("Riwayat konversi dihapus.");
});
document.querySelectorAll(".quick-currency").forEach(button => {
  button.addEventListener("click", () => {
    const code = button.dataset.currency;
    if (!currencies[code]) {
      showToast(`Mata uang ${code} belum tersedia.`);
      return;
    }
    fromSelect.value = "IDR";
    toSelect.value = code;
    amountInput.value = "10000";
    updateFlags();
    convertCurrency();
    document.getElementById("converter").scrollIntoView({ behavior: "smooth", block: "start" });
  });
});
$("currencySearch").addEventListener("input", event => updateSearch(event.target.value));

document.querySelectorAll(".nav-link").forEach(link => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".nav-link").forEach(item => item.classList.remove("active"));
    link.classList.add("active");
  });
});

updateFavoriteCounts();
renderHistory();
initialize();
