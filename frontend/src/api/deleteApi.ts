// src/api/deleteApi.ts
import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const api = axios.create({ baseURL: BASE_URL, headers: { "Content-Type": "application/json" } });

export interface DeleteRowsResult {
  status: string;
  table: string;
  deleted: number;
  filters: Record<string, string>;
}

export interface DeleteByPKsResult {
  status: string;
  table: string;
  deleted: number;
}

export interface DeleteModelResult {
  status: string;
  model_name: string;
  files_deleted?: number;
  predictions_deleted?: number;
  minio_files_deleted?: number;
}

/**
 * Удаление строк по фильтрам.
 */
export const deleteRowsByFilters = async (
  tableKey: string,
  filters: Record<string, string>,
  confirmAll = false
): Promise<DeleteRowsResult> => {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v && v.trim()) params.append(k, v);
  }
  if (confirmAll) params.append("confirm_delete_all", "true");

  const { data } = await api.delete<DeleteRowsResult>(
    `/api/tables/${tableKey}/rows?${params.toString()}`
  );
  return data;
};

/**
 * Удаление конкретных строк по PK.
 */
export const deleteRowsByPKs = async (
  tableKey: string,
  pks: Record<string, unknown>[]
): Promise<DeleteByPKsResult> => {
  const { data } = await api.post<DeleteByPKsResult>(
    `/api/tables/${tableKey}/delete-by-pks`,
    pks
  );
  return data;
};

/**
 * Удаление модели + предсказаний.
 */
export const deleteModelAndPredictions = async (
  modelName: string
): Promise<DeleteModelResult> => {
  const { data } = await api.delete<DeleteModelResult>(
    `/api/ml/models/${encodeURIComponent(modelName)}/all`
  );
  return data;
};

/**
 * Удаление только модели из MinIO.
 */
export const deleteModelOnly = async (
  modelName: string
): Promise<DeleteModelResult> => {
  const { data } = await api.delete<DeleteModelResult>(
    `/api/ml/models/${encodeURIComponent(modelName)}`
  );
  return data;
};