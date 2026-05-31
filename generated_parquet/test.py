import pyarrow.parquet as pq
import pandas as pd

# Чтение
pf = pq.ParquetFile("generated_parquet/unsumry_connection.parquet")
df = pf.read().to_pandas()

print(df.head())
print(f"\nМетаданные: {pf.schema_arrow.metadata}")
print(f"Типы: {df.dtypes.to_dict()}")
