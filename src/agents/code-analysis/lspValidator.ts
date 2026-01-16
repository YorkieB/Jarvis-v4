import { CodeValidator } from '../../services/lsp/codeValidator';
import logger from '../../utils/logger';

export interface ValidationOutcome {
  code: string;
  diagnostics: {
    errors: string[];
    warnings: string[];
  };
  clean: boolean;
}

type CodeGenerator = (feedback?: string[]) => Promise<string>;

/**
 * LSP validation loop: generate → validate → re-prompt with diagnostics up to N iterations.
 */
export class LspValidatorAdapter {
  private validator: CodeValidator;
  private maxIterations: number;

  constructor(validator?: CodeValidator) {
    this.validator = validator || new CodeValidator();
    this.maxIterations = Number(process.env.LSP_VALIDATE_MAX_ITERATIONS || 3);
  }

  async validateWithGenerator(
    generate: CodeGenerator,
  ): Promise<ValidationOutcome> {
    let feedback: string[] = [];
    let lastCode = '';

    for (let i = 0; i < this.maxIterations; i++) {
      lastCode = await generate(feedback);
      const result = await this.validator.validate(lastCode, this.virtualUri());

      if (!this.validator.hasBlockingErrors(result)) {
        return {
          code: lastCode,
          diagnostics: {
            errors: [],
            warnings: result.warnings.map((w) => this.formatDiag(w)),
          },
          clean: true,
        };
      }

      feedback = result.errors.map((e) => this.formatDiag(e));
    }

    // Max iterations reached with blocking errors
    const finalDiag = await this.validator.validate(
      lastCode,
      this.virtualUri(),
    );
    return {
      code: lastCode,
      diagnostics: {
        errors: finalDiag.errors.map((e) => this.formatDiag(e)),
        warnings: finalDiag.warnings.map((w) => this.formatDiag(w)),
      },
      clean: false,
    };
  }

  private formatDiag(d: {
    line: number;
    column: number;
    message: string;
    source?: string;
  }) {
    const src = d.source ? `[${d.source}] ` : '';
    return `${src}Line ${d.line + 1}, Col ${d.column + 1}: ${d.message}`;
  }

  private virtualUri(): string {
    return `inmemory://code-${Date.now()}.ts`;
  }
}
