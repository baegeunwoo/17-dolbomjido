from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

import data

BASE = Path(__file__).resolve().parent
app = FastAPI(title="대구 영유아 돌봄지도")

app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")
templates = Jinja2Templates(directory=BASE / "templates")


@app.get("/map")
async def map_page(request: Request):
    return templates.TemplateResponse(request, "map.html")

@app.get("/")
async def dong_list(
    request: Request,
    q: str = Query("", description="동 이름 검색"),
    gu: str = Query(""),
    type: str = Query(""),
    sort: str = Query("dong"),
    desc: bool = Query(False),
):
    rows = data.search(q=q, gu=gu, type_=type, sort=sort, desc=desc)
    return templates.TemplateResponse(
        request,
        "dong_list.html",
        context={
            "rows": rows,
            "q": q, "gu": gu, "type": type,
            "sort": sort, "desc": desc,
            "gu_list": data.GU_LIST,
            "type_list": data.TYPE_LIST,
            "total": len(data.DONGS),
        },
    )

@app.get("/dong")
async def dong_list(
    request: Request,
    q: str = Query("", description="동 이름 검색"),
    gu: str = Query(""),
    type: str = Query(""),
    sort: str = Query("dong"),
    desc: bool = Query(False),
):
    rows = data.search(q=q, gu=gu, type_=type, sort=sort, desc=desc)
    return templates.TemplateResponse(
        request,
        "dong_list.html",
        context={
            "rows": rows,
            "q": q, "gu": gu, "type": type,
            "sort": sort, "desc": desc,
            "gu_list": data.GU_LIST,
            "type_list": data.TYPE_LIST,
            "total": len(data.DONGS),
        },
    )


@app.get("/dong/{adm_cd}")
async def dong_detail(request: Request, adm_cd: str):
    d = data.BY_CODE.get(adm_cd)
    if not d:
        raise HTTPException(404, "존재하지 않는 행정동입니다")

    txt, color = data.TYPE_DESC.get(d["ftype"], ("", "#999"))

    # 같은 구의 다른 동 (하단 링크용)
    siblings = [x for x in data.DONGS if x["gu"] == d["gu"] and x["adm_cd"] != adm_cd]

    return templates.TemplateResponse(
        request,
        "dong_detail.html",
        context={
            "d": d,
            "city": data.CITY,
            "type_txt": txt,
            "type_color": color,
            "siblings": siblings,
        },
    )


@app.get("/quadrant")
async def quadrant_page(request: Request):
    rows = [
        {
            "adm_cd": d["adm_cd"], "gu": d["gu"], "dong": d["dong"],
            "pop06": d["pop06"], "cov": d["cov"], "rcov": d["rcov"],
            "fill": d["fill"], "ftype": d["ftype"],
            "price": d["price"], "age": d["age"],
        }
        for d in data.DONGS
        if d["rcov"] is not None and d["fill"] is not None
    ]
    return templates.TemplateResponse(
        request,
        "quadrant.html",
        context={
            "rows": rows,
            "summary": data.type_summary(),
            "colors": data.TYPE_COLORS,
        },
    )