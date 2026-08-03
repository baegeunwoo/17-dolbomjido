"""
scripts/make_geojson.py

BND_ADM_DONG_PG.shp (EPSG:5186, TM 미터)
  → static/data/daegu_dong.geojson (EPSG:4326, WGS84 위경도)

필요 패키지: uv add geopandas pyogrio pandas
실행:        uv run python scripts/make_geojson.py
"""
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd

# ── 경로 (실행 위치와 무관하게 프로젝트 루트 기준) ──────────
BASE = Path(__file__).resolve().parent.parent
SHP = BASE / "data" / "raw" / "BND_ADM_DONG_PG.shp"
CSV = BASE / "data" / "대구_행정동별_돌봄지표_최종_202606.csv"
OUT = BASE / "static" / "data" / "daegu_dong.geojson"

# ── 설정 ────────────────────────────────────────────────
INCLUDE_GUNWI = False   # 군위군 포함 여부
TOLERANCE_M = 40        # 폴리곤 단순화 허용오차(미터)

# ── 1) 읽기 + 좌표계 지정 ───────────────────────────────
gdf = gpd.read_file(SHP, engine="pyogrio")
gdf = gdf.set_crs("EPSG:5186", allow_override=True)

# ── 2) 대구만 필터 (통계청 시도코드 22) ─────────────────
gdf = gdf[gdf["ADM_CD"].str.startswith("22")].copy()
if not INCLUDE_GUNWI:
    gdf = gdf[~gdf["ADM_CD"].str.startswith("2272")]

# ── 3) 단순화 — 반드시 미터 좌표계에서 먼저 ─────────────
gdf["geometry"] = gdf.geometry.simplify(TOLERANCE_M, preserve_topology=True)

# ── 4) 역변환 (내부적으로 pyproj 사용) ──────────────────
gdf = gdf.to_crs("EPSG:4326")

# ── 5) 지표 붙이기 ──────────────────────────────────────
# 키 이름은 data.py / map.js 와 반드시 일치해야 함
df = pd.read_csv(CSV, dtype={"ADM_CD": str})

cols = [
    "ADM_CD", "시군구", "행정동", "0-6세", "정원", "현원",
    "커버율(%)", "이용률(%)", "충원율(%)", "유형",
    "반경커버율(%)", "면적", "평당가", "연식",
]
gdf = gdf.merge(df[cols], on="ADM_CD", how="inner")

gdf = gdf.rename(columns={
    "ADM_CD": "adm_cd",
    "시군구": "gu",
    "행정동": "dong",
    "0-6세": "pop06",
    "정원": "cap",
    "현원": "enr",
    "커버율(%)": "cov",
    "이용률(%)": "use",
    "충원율(%)": "fill",
    "유형": "type",
    "반경커버율(%)": "rcov",
    "면적": "area",
    "평당가": "price",
    "연식": "age",
})

keep = [
    "adm_cd", "gu", "dong", "pop06", "cap", "enr",
    "cov", "use", "fill", "type", "rcov", "area",
    "price", "age", "geometry",
]
gdf = gdf[keep]

for c in ["cov", "use", "fill", "rcov", "area"]:
    gdf[c] = gdf[c].round(1)
for c in ["price", "age"]:
    gdf[c] = gdf[c].round(0)

# ── 6) 좌표 축약 후 저장 ────────────────────────────────
OUT.parent.mkdir(parents=True, exist_ok=True)
geo = json.loads(gdf.to_json())


def trim(coords):
    """좌표를 소수점 6자리(약 10cm)로 반올림 — 재귀"""
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], 6), round(coords[1], 6)]
    return [trim(c) for c in coords]


for f in geo["features"]:
    f["geometry"]["coordinates"] = trim(f["geometry"]["coordinates"])
    f.pop("id", None)

with open(OUT, "w", encoding="utf-8") as fp:
    json.dump(geo, fp, ensure_ascii=False, separators=(",", ":"))

# ── 7) 검증 ─────────────────────────────────────────────
b = gdf.total_bounds
print(f"동 개수   : {len(gdf)}")
print(f"경도      : {b[0]:.4f} ~ {b[2]:.4f}   (대구 시가지 약 128.3~128.8)")
print(f"위도      : {b[1]:.4f} ~ {b[3]:.4f}   (대구 시가지 약 35.6~36.0)")
print(f"집값 결측 : {gdf['price'].isna().sum()}개")
print(f"충원율 결측: {gdf['fill'].isna().sum()}개 (정원 0인 동)")
print(f"유형 목록 : {sorted(gdf['type'].dropna().unique())}")
print(f"저장      : {OUT}  ({OUT.stat().st_size / 1024:.0f} KB)")
