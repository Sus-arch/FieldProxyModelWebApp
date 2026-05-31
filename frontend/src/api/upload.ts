// src/api/upload.ts
export type TableKey = 
  | "data_group" 
  | "data_well" 
  | "data_connection" 
  | "unsumry_connection";

export interface UploadResponse {
  status: "success";
  table: string;
  test_id_applied: string;
  rows_received: number;
  rows_inserted: number;
  duplicates_removed?: number;
}

export interface UploadProgress {
  status: "uploading" | "processing" | "done" | "error";
  message: string;
  progress?: number; // 0-100
  fileIndex?: number;
  totalFiles?: number;
}

/**
 * Загружает один Parquet-файл на сервер.
 */
export async function uploadParquet(
  tableKey: TableKey,
  file: File,
  folderTag: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file, file.name);
  formData.append("folder_tag", folderTag.trim().replace(/\s+/g, "_"));

  onProgress?.({ status: "uploading", message: `Загрузка ${file.name}...`, progress: 0 });

  try {
    const response = await fetch(`/api/upload/${tableKey}`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Ошибка ${response.status}: ${response.statusText}`);
    }

    onProgress?.({ status: "processing", message: `Обработка ${file.name}...`, progress: 70 });
    const result: UploadResponse = await response.json();
    onProgress?.({ status: "done", message: `${file.name} готов!`, progress: 100 });
    
    return result;
  } catch (error) {
    onProgress?.({ 
      status: "error", 
      message: error instanceof Error ? error.message : "Неизвестная ошибка",
      progress: 0 
    });
    throw error;
  }
}

/**
 * 🆕 Массовая загрузка файлов из структуры папок.
 * Автоматически определяет target table и test_id из пути.
 */
export async function uploadFolderStructure(
  files: FileList,
  onProgress?: (progress: UploadProgress & { currentFile?: string }) => void
): Promise<{ total: number; success: number; failed: number; errors: string[] }> {
  // 🗂️ Маппинг: имя файла → table_key
  const FILE_TO_TABLE: Record<string, TableKey> = {
    "data_well.parquet": "data_well",
    "data_group.parquet": "data_group",
    "data_connection.parquet": "data_connection",
    // Если нужно загружать в unsumry.connection — добавьте:
    "unsumry_connection.parquet": "unsumry_connection",
  };

  // 📋 Фильтруем и группируем файлы
  const validFiles = Array.from(files).filter(f => 
    f.name.endsWith(".parquet") && FILE_TO_TABLE[f.name]
  );

  if (validFiles.length === 0) {
    throw new Error("Не найдено файлов data_well.parquet, data_group.parquet или data_connection.parquet");
  }

  const results = { total: validFiles.length, success: 0, failed: 0, errors: [] as string[] };

  // 🔄 Загружаем последовательно (можно заменить на Promise.all для параллельной)
  for (let i = 0; i < validFiles.length; i++) {
    const file = validFiles[i];
    
    // 🧠 Извлекаем test_id из webkitRelativePath: "root/subfolder/file.parquet"
    const rawPath = file.webkitRelativePath || file.name;
    const parts = rawPath.replace(/\\/g, "/").split("/").filter(Boolean);
    
    let folderTag: string;
    if (parts.length >= 3) {
      // root/subfolder/file.parquet → "root_subfolder"
      const root = parts[parts.length - 3];
      const subfolder = parts[parts.length - 2];
      folderTag = `${root}_${subfolder}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    } else if (parts.length === 2) {
      folderTag = `root_${parts[0]}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    } else {
      folderTag = "unknown_source";
    }

    const tableKey = FILE_TO_TABLE[file.name];
    
    onProgress?.({
      status: "uploading",
      message: `Загрузка ${i + 1}/${validFiles.length}: ${file.name}`,
      progress: Math.round((i / validFiles.length) * 100),
      fileIndex: i + 1,
      totalFiles: validFiles.length,
      currentFile: file.name,
    });

    try {
      await uploadParquet(tableKey, file, folderTag);
      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push(`${file.name}: ${error instanceof Error ? error.message : "Ошибка"}`);
      console.error(`❌ Ошибка загрузки ${file.name}:`, error);
    }
  }

  return results;
}