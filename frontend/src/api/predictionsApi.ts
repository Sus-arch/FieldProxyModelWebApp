// src/api/predictionsApi.ts
import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const api = axios.create({ baseURL: BASE_URL, headers: { "Content-Type": "application/json" } });

export interface AvailableModel {
  path: string;
  model_name: string;
  field_name: string;
  model_type: string;
  target: string;
  created_at: string;
  train_scenarios: string[];
  test_scenarios: string[];
  metrics_test: { mae: number; rmse: number; r2: number } | null;
  feature_names: string[];
}

export interface PredictRequest {
  model_name: string;
  model_path: string;
  field_name: string;
  predict_test_ids: string[];
}

export interface PredictResponse {
  status: string;
  job_id: string;
  message: string;
}

export interface PredictionJobState {
  job_id: string;
  stage: string;
  stage_label: string;
  progress: number;
  logs: { timestamp: string; level: string; message: string; stage: string }[];
  error: string | null;
  result: Record<string, unknown> | null;
}

export const getAvailableModels = async (): Promise<{ models: AvailableModel[] }> => {
  const { data } = await api.get<{ models: AvailableModel[] }>("/api/predictions/models");
  return data;
};

export const startPrediction = async (req: PredictRequest): Promise<PredictResponse> => {
  const { data } = await api.post<PredictResponse>("/api/predictions/run", req);
  return data;
};

export const createPredictionSSE = (jobId: string): EventSource => {
  return new EventSource(`${BASE_URL}/api/predictions/run/${jobId}/stream`);
};