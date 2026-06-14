import {
  importAdvertisingCampaignMetrics,
  type ImportAdvertisingCampaignMetricsOptions,
  type ImportAdvertisingCampaignMetricsResult,
} from "./importAdvertisingCampaignMetrics";
import { parseMetaCampaignMetricsExcel } from "./metaCampaignExcelParse";

export type { ImportAdvertisingCampaignMetricsOptions, ImportAdvertisingCampaignMetricsResult };

export async function importAdvertisingCampaignMetricsExcel(
  buffer: Buffer,
  companyId: string,
  catalogProductId: string,
  options: ImportAdvertisingCampaignMetricsOptions & { sourceFilename?: string },
): Promise<ImportAdvertisingCampaignMetricsResult> {
  const { rows, errors: parseErrors } = parseMetaCampaignMetricsExcel(buffer, {
    sourceFilename: options.sourceFilename,
  });

  const { sourceFilename: _omit, ...importOpts } = options;
  return importAdvertisingCampaignMetrics(companyId, catalogProductId, rows, importOpts, parseErrors);
}
