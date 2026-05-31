// src/api/tablesApi.ts
import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

export interface FilterValues {
  column: string;
  values: (string | number | boolean)[];
  total_count: number;
  truncated: boolean;
  table: string;
}

export interface FetchParams {
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  [key: string]: string | number | boolean | undefined;
}

export interface TableMeta {
  key: string;
  label: string;
  schema: string;
  columns: string[];
}

export interface TableResponse {
  table: string;
  columns: string[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
  data: Record<string, unknown>[];
  applied_filters?: Record<string, string>;
  applied_sort?: { by: string; dir: "asc" | "desc" } | null;
}

export const fetchTablesMeta = async (): Promise<TableMeta[]> => {
  const { data } = await api.get<TableMeta[]>("/api/tables/meta");
  return data;
};

export const fetchTableData = async (
  tableKey: string,
  params: FetchParams = {}
): Promise<TableResponse> => {
  const cleanParams: Record<string, string | number> = {};

  for (const [key, value] of Object.entries(params)) {
    if (
      value === undefined ||
      value === null ||
      value === "" ||
      ["page", "page_size", "sort_by", "sort_dir"].includes(key)
    ) {
      continue;
    }
    cleanParams[key] = String(value);
  }

  const { data } = await api.get<TableResponse>(`/api/tables/${tableKey}`, {
    params: {
      page: params.page ?? 1,
      page_size: params.page_size ?? 50,
      ...(params.sort_by ? { sort_by: params.sort_by } : {}),
      ...(params.sort_dir ? { sort_dir: params.sort_dir } : {}),
      ...cleanParams,
    },
  });

  return data;
};

export const fetchColumnFilterValues = async (
  tableKey: string,
  columnName: string,
  limit = 500,
  search = ""
): Promise<FilterValues> => {
  const { data } = await api.get<FilterValues>(
    `/api/tables/${tableKey}/filters/${columnName}`,
    {
      params: {
        limit,
        ...(search.trim() ? { search: search.trim() } : {}),
      },
    }
  );
  return data;
};  