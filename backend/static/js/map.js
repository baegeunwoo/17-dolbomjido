/* ============================================================
   대구 영유아 돌봄지도 — static/js/map.js
   구성: 상수 → 전역 → 지도초기화 → 헬퍼 → 패널 → 상호작용
        → 지표전환 → 범례 → 데이터로드 → 버튼연결
   ============================================================ */

/* ── 1. 상수 ───────────────────────────────────────────── */

// 대구 전체 기준값 (패널의 "평균 대비" 비교용)
const CITY = {
  cov: 106.1,   // 커버율 (%)
  rcov: 94.4,   // 반경 커버율 (%)
  use: 69.5,    // 이용률 (%)
  fill: 65.6,   // 충원율 (%)
  price: 1224,  // 아파트 평당가 중위 (만원)
};

// 유형 설명 — GeoJSON properties.type 값과 키가 정확히 일치해야 함
const TYPE_DESC = {
  "물리적부족":   { color: "#e34948", txt: "자리가 부족하고, 있는 자리는 꽉 찼습니다" },
  "이중취약":     { color: "#eb6834", txt: "자리도 적고 그마저 덜 채워집니다" },
  "질적미스매치": { color: "#eda100", txt: "정원은 넉넉하나 아동이 적습니다" },
  "양호":         { color: "#1baf7a", txt: "수요와 공급이 맞는 편입니다" },
  "광역거점":     { color: "#6b5bd6", txt: "인근 동 아이들이 통원하는 시설 밀집지입니다" },
  "완전공백":     { color: "#8a8a8a", txt: "관내 어린이집·유치원이 없습니다" },
  "산출불가":     { color: "#c9c7bf", txt: "주변에 시설이 거의 없어 반경 지표를 낼 수 없습니다" },
};

// 지표 정의 — 새 지표는 여기만 추가하면 됨
const METRICS = {
  type: {
    label: "유형", unit: "", kind: "category",
    desc: "반경 커버율 × 충원율 기준",
    map: {
      "물리적부족":   "#e34948",
      "이중취약":     "#eb6834",
      "질적미스매치": "#eda100",
      "양호":         "#1baf7a",
      "광역거점":     "#6b5bd6",
      "완전공백":     "#8a8a8a",
      "산출불가":     "#c9c7bf",
    },
  },
  rcov: {
    label: "반경 커버율", unit: "%", kind: "range",
    desc: "인근 1km 시설 포함",
    breaks: [70, 100, 130, 180],
    colors: ["#e34948", "#f0a08a", "#f5e0c8", "#9dc6e8", "#2a78d6"],
    labels: ["70% 미만", "70~100%", "100~130%", "130~180%", "180% 이상"],
  },
  cov: {
    label: "커버율", unit: "%", kind: "range",
    desc: "정원 ÷ 0~6세 인구",
    breaks: [50, 100, 150, 250],
    colors: ["#e34948", "#f0a08a", "#f5e0c8", "#9dc6e8", "#2a78d6"],
    labels: ["50% 미만", "50~100%", "100~150%", "150~250%", "250% 이상"],
  },
  use: {
    label: "이용률", unit: "%", kind: "range",
    desc: "현원 ÷ 0~6세 인구",
    breaks: [30, 50, 70, 100],
    colors: ["#e34948", "#f0a08a", "#f5e0c8", "#9dc6e8", "#2a78d6"],
    labels: ["30% 미만", "30~50%", "50~70%", "70~100%", "100% 이상"],
  },
  fill: {
    label: "충원율", unit: "%", kind: "range",
    desc: "현원 ÷ 정원",
    breaks: [40, 55, 70, 85],
    colors: ["#e34948", "#f0a08a", "#f5e0c8", "#9dc6e8", "#2a78d6"],
    labels: ["40% 미만", "40~55%", "55~70%", "70~85%", "85% 이상"],
  },
};

const NO_DATA = "#d3d1c7";
const GEOJSON_URL = "/static/data/daegu_dong.geojson";
const FOCUS_MAX_ZOOM = 13;   // 클릭·포커스 시 최대 확대 배율

/* ── 2. 전역 상태 ──────────────────────────────────────── */

let currentMetric = "type";   // 첫 화면 기본 지표
let geoLayer = null;
let focused = null;           // ?focus= 또는 클릭으로 강조 중인 레이어

/* ── 3. 지도 초기화 ────────────────────────────────────── */

const map = L.map("map", { zoomSnap: 0.5 }).setView([35.86, 128.58], 11);

L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  { attribution: "&copy; OpenStreetMap, &copy; CARTO", maxZoom: 19 }
).addTo(map);

/* ── 4. 헬퍼 ───────────────────────────────────────────── */

const fmt = (v, d = 1) => (v == null ? "—" : Number(v).toFixed(d));
const num = (v) => (v == null ? "—" : Number(v).toLocaleString());

function diffTag(value, base, unit = "%p") {
  if (value == null) return "";
  const d = value - base;
  const cls = d >= 0 ? "up" : "down";
  const sign = d >= 0 ? "+" : "";
  return `<span class="diff ${cls}">${sign}${d.toFixed(1)}${unit}</span>`;
}

function bar(value, max) {
  const w = value == null ? 0 : Math.min(100, (value / max) * 100);
  return `<div class="bar"><span style="width:${w}%"></span></div>`;
}

function getColor(value, key) {
  if (value == null) return NO_DATA;
  const m = METRICS[key];

  if (m.kind === "category") return m.map[value] ?? NO_DATA;

  for (let i = 0; i < m.breaks.length; i++) {
    if (value < m.breaks[i]) return m.colors[i];
  }
  return m.colors[m.colors.length - 1];
}

function styleFor(feature) {
  return {
    fillColor: getColor(feature.properties[currentMetric], currentMetric),
    fillOpacity: 0.75,
    color: "#ffffff",
    weight: 1,
  };
}

function highlight(layer) {
  layer.setStyle({ weight: 3, color: "#14161a" });
  layer.bringToFront();
}

/* ── 5. 상세 패널 ──────────────────────────────────────── */

function showPanel(p) {
  const t = TYPE_DESC[p.type] ?? { color: "#999", txt: "" };

  document.getElementById("panel").innerHTML = `
    <h2>${p.gu} ${p.dong}</h2>
    <div class="badge" style="background:${t.color}">${p.type ?? "—"}</div>
    <p class="type-desc">${t.txt}</p>

    <h3>수요와 공급</h3>
    <table class="kv">
      <tr><th>0~6세 인구</th><td>${num(p.pop06)}명</td></tr>
      <tr><th>정원</th><td>${num(p.cap)}석</td></tr>
      <tr><th>현원</th><td>${num(p.enr)}명</td></tr>
    </table>

    <h3>돌봄 지표 <small>대구 평균 대비</small></h3>
    <table class="kv">
      <tr><th>커버율</th><td>${fmt(p.cov)}% ${diffTag(p.cov, CITY.cov)}</td></tr>
      <tr><th class="sub">반경 보정</th><td>${fmt(p.rcov)}%</td></tr>
      <tr><th>이용률</th><td>${fmt(p.use)}% ${diffTag(p.use, CITY.use)}</td></tr>
      <tr><th>충원율</th><td>${fmt(p.fill)}% ${diffTag(p.fill, CITY.fill)}</td></tr>
    </table>
    ${bar(p.fill, 100)}

    <h3>주거 환경</h3>
    <table class="kv">
      <tr><th>아파트 평당가</th><td>${
        p.price == null ? "—" : num(Math.round(p.price)) + "만원"
      } ${diffTag(p.price, CITY.price, "만원")}</td></tr>
      <tr><th>아파트 연식</th><td>${fmt(p.age, 0)}년</td></tr>
    </table>
    ${p.price == null
      ? '<p class="note">최근 1년 아파트 거래가 없어 집값 정보가 없습니다.</p>'
      : ""}

    ${p.pop06 < 100
      ? '<p class="warn">0~6세 100명 미만으로 지표가 크게 흔들릴 수 있습니다.</p>'
      : ""}

    <a class="more" href="/dong/${p.adm_cd}">이 동네 자세히 보기</a>
  `;
}

/* ── 6. 상호작용 ───────────────────────────────────────── */

function bindTip(layer) {
  const p = layer.feature.properties;
  const m = METRICS[currentMetric];
  const v = p[currentMetric];
  const txt = m.kind === "category" ? (v ?? "—") : fmt(v) + m.unit;
  layer.setTooltipContent(`${p.gu} ${p.dong}<br>${m.label} ${txt}`);
}

function onEachFeature(feature, layer) {
  layer.bindTooltip("", { sticky: true });
  bindTip(layer);

  layer.on({
    mouseover: (e) => highlight(e.target),
    mouseout: (e) => {
      geoLayer.resetStyle(e.target);
      if (focused === e.target) highlight(e.target);
    },
    click: (e) => {
      focused = e.target;
      showPanel(e.target.feature.properties);
      map.fitBounds(e.target.getBounds(), {
        maxZoom: FOCUS_MAX_ZOOM,
        padding: [40, 40],
      });
      highlight(e.target);
    },
  });
}

/* ── 7. 지표 전환 ──────────────────────────────────────── */

function switchMetric(key) {
  currentMetric = key;

  geoLayer.setStyle(styleFor);   // 색만 다시 칠함 — 재로드 없음
  geoLayer.eachLayer(bindTip);   // 툴팁 갱신
  if (focused) highlight(focused);
  legend.update();

  document.querySelectorAll("#metric-btns button")
    .forEach((b) => b.classList.toggle("on", b.dataset.metric === key));
}

/* ── 8. 범례 ───────────────────────────────────────────── */

const legend = L.control({ position: "bottomright" });

legend.onAdd = function () {
  this._div = L.DomUtil.create("div", "legend");
  this.update();
  return this._div;
};

legend.update = function () {
  const m = METRICS[currentMetric];

  const rows = m.kind === "category"
    ? Object.entries(m.map)
        .map(([k, c]) => `<i style="background:${c}"></i>${k}`).join("<br>")
    : m.colors
        .map((c, i) => `<i style="background:${c}"></i>${m.labels[i]}`).join("<br>");

  this._div.innerHTML =
    `<strong>${m.label}</strong><span class="sub">${m.desc}</span>` +
    rows +
    (m.kind === "category" ? "" : `<br><i style="background:${NO_DATA}"></i>값 없음`);
};

legend.addTo(map);

/* ── 9. 데이터 로드 + ?focus= 처리 ─────────────────────── */

fetch(GEOJSON_URL)
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then((data) => {
    geoLayer = L.geoJSON(data, { style: styleFor, onEachFeature }).addTo(map);

    document.querySelectorAll("#metric-btns button")
      .forEach((b) => b.classList.toggle("on", b.dataset.metric === currentMetric));

    // 상세 페이지에서 "지도에서 보기"로 넘어온 경우
    const code = new URLSearchParams(location.search).get("focus");
    let target = null;

    if (code) {
      geoLayer.eachLayer((l) => {
        if (String(l.feature.properties.adm_cd) === String(code)) target = l;
      });
      console.log(`focus=${code} → ${target ? "찾음" : "못 찾음"}`);
    }

    if (target) {
      focused = target;
      map.fitBounds(target.getBounds(), {
        maxZoom: FOCUS_MAX_ZOOM,
        padding: [60, 60],
      });
      showPanel(target.feature.properties);
      highlight(target);
    } else {
      map.fitBounds(geoLayer.getBounds(), { padding: [10, 10] });
    }

    console.log(`행정동 ${data.features.length}개 로드 완료`);
  })
  .catch((e) => {
    console.error("GeoJSON 로드 실패:", e);
    document.getElementById("panel").innerHTML =
      '<p class="warn">지도 데이터를 불러오지 못했습니다.</p>';
  });

/* ── 10. 버튼 연결 ─────────────────────────────────────── */

document.querySelectorAll("#metric-btns button").forEach((btn) => {
  btn.addEventListener("click", () => switchMetric(btn.dataset.metric));
});