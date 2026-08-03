"""
data.py — CSV를 앱 시작 시 한 번만 읽어 메모리에 보관.
138개 행이라 DB 없이 충분함.
"""
from pathlib import Path
import math
import pandas as pd

BASE = Path(__file__).resolve().parent
CSV = BASE / "data" / "대구_행정동별_돌봄지표_최종_202606.csv"

# CSV 원본 컬럼 → 앱에서 쓸 이름
RENAME = {
    "ADM_CD": "adm_cd",
    "시군구": "gu",
    "행정동": "dong",
    "시가지": "urban",
    "면적": "area",
    "총인구수": "total_pop",
    "0-2세": "pop02",
    "3-6세": "pop36",
    "0-6세": "pop06",
    "영유아비율(%)": "kidratio",
    "기관수": "fac",
    "어린이집수": "fac_dc",
    "유치원수": "fac_kg",
    "정원": "cap",
    "현원": "enr",
    "커버율(%)": "cov",
    "이용률(%)": "use",
    "충원율(%)": "fill",
    "유형": "type",
    "반경커버율(%)": "rcov",
    "반경신뢰도": "rtrust",
    "반경주의": "rwarn",
    "인접동수_1_5km": "nbr",
    "시설수_1km": "fac1k",
    "시설수_1_5km": "fac15k",
    "유형_최종": "ftype",
    "평당가": "price",
    "연식": "age",
}

# 대구 전체 기준값 (상세 페이지 비교용)
CITY = {"cov": 106.2, "use": 69.6, "fill": 65.5, "price": 1224}

TYPE_DESC = {
    "물리적부족":   ("자리가 부족하고, 있는 자리는 꽉 찼습니다", "#e34948"),
    "이중취약":     ("자리도 적고 그마저 덜 채워집니다", "#eb6834"),
    "질적미스매치": ("정원은 넉넉하나 아동이 적습니다", "#eda100"),
    "양호":         ("수요와 공급이 맞는 편입니다", "#1baf7a"),
    "광역거점":     ("인근 동 아이들이 통원하는 시설 밀집지입니다", "#6b5bd6"),
    "완전공백":     ("관내 어린이집·유치원이 없습니다", "#8a8a8a"),
    "산출불가":     ("주변에 시설이 거의 없어 반경 지표를 낼 수 없습니다", "#c9c7bf"),
}

# 정렬 허용 컬럼 (임의 컬럼 정렬 방지)
SORTABLE = {"dong", "gu", "pop06", "kidratio", "cap", "enr",
            "cov", "rcov", "use", "fill", "price", "age"}
def _clean(v):
    """NaN을 None으로 — Jinja2에서 'nan' 출력 방지"""
    if isinstance(v, float) and math.isnan(v):
        return None
    return v


def load() -> list[dict]:
    df = pd.read_csv(CSV, dtype={"ADM_CD": str})
    df = df[[c for c in RENAME if c in df.columns]].rename(columns=RENAME)
    df = df.sort_values(["gu", "dong"])
    return [{k: _clean(v) for k, v in row.items()} for row in df.to_dict("records")]


# 앱 시작 시 1회 로드
DONGS: list[dict] = load()
BY_CODE: dict[str, dict] = {d["adm_cd"]: d for d in DONGS}
GU_LIST: list[str] = sorted({d["gu"] for d in DONGS})
TYPE_LIST = [t for t in TYPE_DESC if any(d["ftype"] == t for d in DONGS)]
def search(q: str = "", gu: str = "", type_: str = "",
           sort: str = "dong", desc: bool = False) -> list[dict]:
    rows = DONGS

    if q:
        key = q.strip().replace(" ", "")
        rows = [d for d in rows
                if key in d["dong"].replace(" ", "")
                or key in d["gu"]]
    if gu:
        rows = [d for d in rows if d["gu"] == gu]
    if type_:
        rows = [d for d in rows if d["ftype"] == type_]

    if sort in SORTABLE:
        # None은 항상 뒤로
        rows = sorted(
            rows,
            key=lambda d: (d[sort] is None, d[sort] if d[sort] is not None else 0),
            reverse=desc,
        )
    return rows


SUMMARY_ORDER = ["물리적부족", "이중취약", "질적미스매치", "양호",
                 "광역거점", "완전공백", "산출불가"]


def type_summary() -> list[dict]:
    total = sum(d["pop06"] for d in DONGS)
    out = []
    for name in SUMMARY_ORDER:
        rows = [d for d in DONGS if d["ftype"] == name]
        if not rows:
            continue
        pop = sum(d["pop06"] for d in rows)
        out.append({
            "name": name,
            "color": TYPE_DESC[name][1],
            "n": len(rows),
            "kids": pop,
            "share": round(pop / total * 100, 1),
        })
    return out


TYPE_COLORS: dict[str, str] = {k: v[1] for k, v in TYPE_DESC.items()}
