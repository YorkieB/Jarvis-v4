import logger from '../../utils/logger';
import { LspClient, NormalizedDiagnostic } from './lspClient';

export interface ValidationResult {
  errors: NormalizedDiagnostic[];
  warnings: NormalizedDiagnostic[];
  all: NormalizedDiagnostic[];
}

export class CodeValidator {
  private lsp: LspClient;
  private blockingSeverity: number;
  private language: string;

  constructor(lspClient?: LspClient) {
    this.lsp = lspClient || new LspClient();
    this.language = process.env.LSP_LANGUAGE || 'typescript';
    const sev = (process.env.LSP_BLOCKING_SEVERITY || 'error').toLowerCase();
    this.blockingSeverity = sev === 'warning' ? 2 : sev === 'info' ? 3 : 1; // 1=Error,2=Warning,3=Info
  }

  async validate(code: string, uri: string = 'inmemory://code.ts'): Promise<ValidationResult> {
    try {
      await this.lsp.initialize();
      await this.lsp.didOpen(uri, code);
      const diags = await this.lsp.diagnostics(uri);

      const errors = diags.filter((d) => (d.severity ?? 1) <= this.blockingSeverity);
      const warnings = diags.filter((d) => (d.severity ?? 1) > this.blockingSeverity);

      return { errors, warnings, all: diags };
    } catch (error) {
      logger.warn('LSP validation failed; continuing without blocking', { error });
      return { errors: [], warnings: [], all: [] };
    }
  }

  hasBlockingErrors(result: ValidationResult): boolean {
    return result.errors.length > 0;
  }
}
