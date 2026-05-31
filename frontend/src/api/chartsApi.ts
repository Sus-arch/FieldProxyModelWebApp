// src/api/chartsApi.ts
import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const api = axios.create({ baseURL: BASE_URL });

export interface ChartPoint {
  dt: string;
  cbp_predicted: number | null;
  cbp_actual: number | null;
  n_connections: number;
}

export interface CompareStats {
  model_name: string;
  total_predictions: number;
  scenarios: string[];
  n_scenarios: number;
  mae?: number;
  rmse?: number;
  r2?: number;
}

export interface CompareResponse {
  stats: CompareStats;
  scenarios: Record<string, ChartPoint[]>;
}

export interface ModelWithPredictions {
  model_name: string;
  predictions_count: number;
  dt_min: string | null;
  dt_max: string | null;
}

export const getModelsWithPredictions = async (): Promise<{
  models: ModelWithPredictions[];
}> => {
  const { data } = await api.get("/api/predictions/models-with-predictions");
  return data;
};

export const getCompareData = async (
  modelName: string,
  testId?: string
): Promise<CompareResponse> => {
  const params: Record<string, string> = {};
  if (testId) params.test_id = testId;
  const { data } = await api.get(
    `/api/predictions/compare/${encodeURIComponent(modelName)}`,
    { params }
  );
  return data;
};