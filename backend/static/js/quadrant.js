/* ============================================================
   static/js/quadrant.js — 사분면 산점도
   ROWS, COLORS 는 quadrant.html 에서 주입됨
   ============================================================ */

const CT = 100.0;    // 커버율 기준선
const FT = 65.5;     // 충원율 기준선
const HUB = 150.0;   // 광역거점 경계

// 유형별로 데이터셋 분리 (범례 클릭으로 켜고 끌 수 있음)
const types = [...new Set(ROWS.map((r) => r.ftype))];

const datasets = types.map((t) => ({
  label: t,
  data: ROWS.filter((r) => r.ftype === t).map((r) => ({
    x: r.rcov,
    y: r.fill,
    r: Math.max(4, Math.sqrt(r.pop06) / 7),
    code: r.adm_cd,
    name: `${r.gu} ${r.dong}`,
    pop: r.pop06,
    cov: r.cov,
    price: r.price,
    age: r.age,
  })),
  backgroundColor: (COLORS[t] || "#999") + "66",
  borderColor: COLORS[t] || "#999",
  borderWidth: 1.5,
}));

// 기준선 + 사분면 라벨
const guides = {
  id: "guides",
  beforeDatasetsDraw(c) {
    const { ctx, scales: { x, y } } = c;
    ctx.save();

    ctx.strokeStyle = "#aaa";
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x.getPixelForValue(CT), y.top);
    ctx.lineTo(x.getPixelForValue(CT), y.bottom);
    ctx.moveTo(x.left, y.getPixelForValue(FT));
    ctx.lineTo(x.right, y.getPixelForValue(FT));
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.strokeStyle = "#6b5bd6";
    ctx.beginPath();
    ctx.moveTo(x.getPixelForValue(HUB), y.top);
    ctx.lineTo(x.getPixelForValue(HUB), y.bottom);
    ctx.stroke();

    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#999";
    ctx.textAlign = "left";
    ctx.fillText("물리적 부족", x.left + 8, y.top + 16);
    ctx.fillText("이중취약", x.left + 8, y.bottom - 8);
    ctx.textAlign = "right";
    ctx.fillText("양호 / 광역거점", x.right - 8, y.top + 16);
    ctx.fillText("질적 미스매치", x.right - 8, y.bottom - 8);

    ctx.restore();
  },
};

const chart = new Chart(document.getElementById("quad"), {
  type: "bubble",
  plugins: [guides],
  data: { datasets },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: 14 },
    onClick(evt, els) {
      if (!els.length) return;
      const d = datasets[els[0].datasetIndex].data[els[0].index];
      location.href = `/dong/${d.code}`;
    },
    onHover(evt, els) {
      evt.native.target.style.cursor = els.length ? "pointer" : "default";
    },
    plugins: {
      legend: { position: "top", labels: { usePointStyle: true, boxWidth: 8 } },
      tooltip: {
        callbacks: {
          label(c) {
            const d = c.raw;
            const price = d.price == null ? "—" : Math.round(d.price).toLocaleString() + "만원";
            return [
              d.name,
              `0~6세 ${d.pop.toLocaleString()}명`,
              `반경 커버율 ${d.x}% (원본 ${d.cov}%)`,
              `충원율 ${d.y}%`,
              `평당가 ${price} · 연식 ${d.age ?? "—"}년`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: "반경 커버율 (%) — 정원 ÷ 인근 영유아" },
        grid: { color: "rgba(0,0,0,0.06)" },
      },
      y: {
        min: 0,
        max: 105,
        title: { display: true, text: "충원율 (%) — 현원 ÷ 정원" },
        grid: { color: "rgba(0,0,0,0.06)" },
      },
    },
  },
});
