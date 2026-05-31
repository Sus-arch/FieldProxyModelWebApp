// src/api/mlApi.ts
import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const api = axios.create({ baseURL: BASE_URL, headers: { "Content-Type": "application/json" } });


export interface ModelExistsResponse {
  model_name: string;
  exists: boolean;
  minio_exists: boolean;
  predictions_count: number;
  metrics_count: number;
}

export interface TrainRequest {
  model_name: string;
  field_name: string;
  train_test_ids: string[];
  test_test_ids: string[];
  model_type: string;
  hyperparams?: Record<string, unknown>;
  overwrite?: boolean;
}

export interface TrainResponse {
  status: string;
  job_id: string;
  message: string;
}

export interface ModelInfo {
  path: string;
  model_name: string;
  field_name: string;
  model_type: string;
  created_at: string;
  train_scenarios: string[];
  test_scenarios: string[];
  metrics_test: { mae: number; rmse: number; r2: number } | null;
  training_time_seconds: number | null;
  avg_prediction_time_ms: number | null;
  hyperparameters: Record<string, unknown>;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  stage: string;
}

export interface TrainingJobState {
  job_id: string;
  stage: string;
  stage_label: string;
  progress: number;
  logs: LogEntry[];
  error: string | null;
  result: Record<string, unknown> | null;
}

export interface ModelTypeInfo {
  default_params: Record<string, unknown>;
}

export const checkModelExists = async (
  modelName: string
): Promise<ModelExistsResponse> => {
  const { data } = await api.get<ModelExistsResponse>(
    `/api/ml/models/${encodeURIComponent(modelName)}/exists`
  );
  return data;
};

export const startTraining = async (req: TrainRequest): Promise<TrainResponse> => {
  const { data } = await api.post<TrainResponse>("/api/ml/train", req);
  return data;
};

export const listModels = async (): Promise<{ models: ModelInfo[]; total: number }> => {
  const { data } = await api.get<{ models: ModelInfo[]; total: number }>("/api/ml/models");
  return data;
};

export const getModelTypes = async (): Promise<Record<string, ModelTypeInfo>> => {
  const { data } = await api.get<Record<string, ModelTypeInfo>>("/api/ml/model-types");
  return data;
};

export const createSSEConnection = (jobId: string): EventSource => {
  return new EventSource(`${BASE_URL}/api/ml/train/${jobId}/stream`);
};