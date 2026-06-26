export class ImportResultDto {
  totalProcessed: number;
  successCount: number;
  errorCount: number;
  errors: ImportError[];
}

export class ImportError {
  rowNumber: number;
  sku?: string;
  reason: string;
}
