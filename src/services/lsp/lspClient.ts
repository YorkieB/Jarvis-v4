import { createConnection, Diagnostic, InitializeParams, InitializeResult } from 'vscode-languageserver-protocol';
import { MessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';
import fetch from 'node-fetch';
import logger from '../../utils/logger';

export interface NormalizedDiagnostic {
  severity: number | undefined;
  line: number;
  column: number;
  message: string;
  source?: string;
}

export class LspClient {
  private serverUrl: string;
  private language: string;
  private connection: MessageConnection | null = null;

  constructor(serverUrl?: string, language?: string) {
    this.serverUrl = serverUrl || process.env.LSP_SERVER_URL || 'http://localhost:2087';
    this.language = language || process.env.LSP_LANGUAGE || 'typescript';
  }

  async initialize(): Promise<void> {
    if (this.connection) return;

    // Simple health check: assume LSP server is exposed over stdio via HTTP fetchable endpoint for readiness.
    try {
      await fetch(this.serverUrl, { method: 'HEAD' });
    } catch (error) {
      logger.warn('LSP server not reachable', { serverUrl: this.serverUrl, error });
      throw error;
    }

    // Note: In a real environment, you would spawn the LSP process or connect via stdio/socket.
    // Here we stub a JSON-RPC connection expectation; adjust to actual transport as needed.
    const reader = new StreamMessageReader(process.stdin);
    const writer = new StreamMessageWriter(process.stdout);
    this.connection = createConnection(reader, writer);

    const params: InitializeParams = {
      processId: process.pid,
      rootUri: null,
      capabilities: {},
      workspaceFolders: null,
    };

    await this.connection.sendRequest('initialize', params) as InitializeResult;
  }

  async didOpen(uri: string, text: string): Promise<void> {
    if (!this.connection) return;
    await this.connection.sendNotification('textDocument/didOpen', {
      textDocument: { uri, languageId: this.language, version: 1, text },
    });
  }

  async didChange(uri: string, text: string, version: number): Promise<void> {
    if (!this.connection) return;
    await this.connection.sendNotification('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    });
  }

  async diagnostics(uri: string): Promise<NormalizedDiagnostic[]> {
    if (!this.connection) return [];
    const result = await this.connection.sendRequest<Diagnostic[]>('textDocument/diagnostic', {
      textDocument: { uri },
    });
    return (result || []).map((d) => ({
      severity: d.severity,
      line: d.range.start.line,
      column: d.range.start.character,
      message: d.message,
      source: d.source,
    }));
  }

  async shutdown(): Promise<void> {
    if (!this.connection) return;
    await this.connection.sendRequest('shutdown');
    this.connection.dispose();
    this.connection = null;
  }
}
