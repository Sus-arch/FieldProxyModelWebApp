# backend/app/schemas/tables.py
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ConnectionDataSchema(BaseModel):
    dt: datetime
    well_id: str
    i: int
    j: int
    k: int
    test_id: str
    swl: Optional[float] = None
    swu: Optional[float] = None
    conn_id: Optional[int] = None
    id: Optional[str] = None

    model_config = {"from_attributes": True}


class WellDataSchema(BaseModel):
    dt: datetime
    well_id: str
    test_id: str
    weff: Optional[float] = None

    model_config = {"from_attributes": True}


class GroupDataSchema(BaseModel):
    dt: datetime
    group_id: str
    test_id: str
    geff: Optional[float] = None

    model_config = {"from_attributes": True}


class FieldTestsMetaSchema(BaseModel):
    field_name: str
    test_id: str

    model_config = {"from_attributes": True}


class ConnectionUnsumrySchema(BaseModel):
    dt: datetime
    well_id: str
    i: int
    j: int
    k: int
    test_id: str
    cgpr: Optional[float] = None
    cgpt: Optional[float] = None
    cwpr: Optional[float] = None
    cwpt: Optional[float] = None
    cbp: Optional[float] = None
    conn_id: Optional[int] = None
    id: Optional[str] = None

    model_config = {"from_attributes": True}


class PredictionResultSchema(BaseModel):
    model_name: str
    dt: datetime
    conn_id: int
    test_id: str
    cbp: Optional[float] = None

    model_config = {"from_attributes": True}


class PredictionMetricsSchema(BaseModel):
    id: str
    model_name: str
    train_scenarios: str
    test_scenario: str
    mae: Optional[float] = None
    rmse: Optional[float] = None
    r2: Optional[float] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
