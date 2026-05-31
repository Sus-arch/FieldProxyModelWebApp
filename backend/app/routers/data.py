# backend/app/routers/data.py
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
from typing import Optional

from app.db import get_db
from app.models import ConnectionData, WellData, GroupData, ConnectionUnsumry

router = APIRouter(prefix="/data", tags=["Data"])


@router.get("/wells")
async def get_wells(
    db: AsyncSession = Depends(get_db),
    test_id: Optional[str] = Query(None, description="Filter by test_id"),
    limit: int = Query(100, ge=1, le=1000),
):
    """Получить данные из data.well"""
    query = select(WellData).limit(limit)
    if test_id:
        query = query.where(WellData.test_id == test_id)

    result = await db.execute(query)
    wells = result.scalars().all()

    return {
        "count": len(wells),
        "data": [
            {
                "dt": w.dt.isoformat(),
                "well_id": w.well_id,
                "test_id": w.test_id,
                "weff": w.weff,  # ✅ исправлено: w.WEFF -> w.weff
            }
            for w in wells
        ],
    }


@router.get("/groups")
async def get_groups(
    db: AsyncSession = Depends(get_db),
    test_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
):
    """Получить данные из data.group"""
    query = select(GroupData).limit(limit)
    if test_id:
        query = query.where(GroupData.test_id == test_id)

    result = await db.execute(query)
    groups = result.scalars().all()

    return {
        "count": len(groups),
        "data": [
            {
                "dt": g.dt.isoformat(),
                "group_id": g.group_id,
                "test_id": g.test_id,
                "geff": g.geff,  # ✅ исправлено: g.GEFF -> g.geff
            }
            for g in groups
        ],
    }


@router.get("/connections")
async def get_connections(
    db: AsyncSession = Depends(get_db),
    test_id: Optional[str] = Query(None),
    well_id: Optional[str] = Query(None),
    dt_from: Optional[datetime] = Query(None),
    dt_to: Optional[datetime] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
):
    """Получить входные данные из data.connection с фильтрами"""
    query = select(ConnectionData).limit(limit)

    if test_id:
        query = query.where(ConnectionData.test_id == test_id)
    if well_id:
        query = query.where(ConnectionData.well_id == well_id)
    if dt_from:
        query = query.where(ConnectionData.dt >= dt_from)
    if dt_to:
        query = query.where(ConnectionData.dt <= dt_to)

    result = await db.execute(query)
    connections = result.scalars().all()

    return {
        "count": len(connections),
        "data": [
            {
                "dt": c.dt.isoformat(),
                "well_id": c.well_id,
                "perf": {"i": c.i, "j": c.j, "k": c.k},  # ✅ исправлено
                "test_id": c.test_id,
                "swl": c.swl,  # ✅ исправлено: c.SWL -> c.swl
                "swu": c.swu,  # ✅ исправлено: c.SWU -> c.swu
            }
            for c in connections
        ],
    }


@router.get("/results")
async def get_results(
    db: AsyncSession = Depends(get_db),
    test_id: Optional[str] = Query(None),
    well_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
):
    """Получить результаты обработки из unsumry.connection"""
    query = select(ConnectionUnsumry).limit(limit)

    if test_id:
        query = query.where(ConnectionUnsumry.test_id == test_id)
    if well_id:
        query = query.where(ConnectionUnsumry.well_id == well_id)

    result = await db.execute(query)
    results = result.scalars().all()

    return {
        "count": len(results),
        "data": [
            {
                "dt": r.dt.isoformat(),
                "well_id": r.well_id,
                "perf": {"i": r.i, "j": r.j, "k": r.k},  # ✅ исправлено
                "test_id": r.test_id,
                "gas": {"rate": r.cgpr, "total": r.cgpt},  # ✅ исправлено
                "water": {"rate": r.cwpr, "total": r.cwpt},  # ✅ исправлено
            }
            for r in results
        ],
    }


@router.get("/dashboard/{test_id}")
async def get_dashboard(test_id: str, db: AsyncSession = Depends(get_db)):
    """Сводная страница по тесту: все данные в одном ответе"""
    wells_res = await db.execute(
        select(WellData).where(WellData.test_id == test_id).limit(50)
    )
    groups_res = await db.execute(
        select(GroupData).where(GroupData.test_id == test_id).limit(50)
    )
    connections_res = await db.execute(
        select(ConnectionData).where(ConnectionData.test_id == test_id).limit(100)
    )
    results_res = await db.execute(
        select(ConnectionUnsumry).where(ConnectionUnsumry.test_id == test_id).limit(100)
    )

    wells = wells_res.scalars().all()
    groups = groups_res.scalars().all()
    connections = connections_res.scalars().all()
    results = results_res.scalars().all()

    return {
        "test_id": test_id,
        "summary": {
            "wells_count": len(wells),
            "groups_count": len(groups),
            "connections_count": len(connections),
            "results_count": len(results),
        },
        "data": {
            "wells": [
                {
                    "well_id": w.well_id,
                    "weff": w.weff,
                    "dt": w.dt.isoformat(),
                }  # ✅ исправлено
                for w in wells
            ],
            "groups": [
                {
                    "group_id": g.group_id,
                    "geff": g.geff,
                    "dt": g.dt.isoformat(),
                }  # ✅ исправлено
                for g in groups
            ],
            "latest_results": [
                {
                    "well_id": r.well_id,
                    "perf": f"{r.i}:{r.j}:{r.k}",  # ✅ исправлено
                    "cgpr": r.cgpr,  # ✅ исправлено
                    "cwpr": r.cwpr,  # ✅ исправлено
                    "dt": r.dt.isoformat(),
                }
                for r in results[:20]  # последние 20
            ],
        },
    }
