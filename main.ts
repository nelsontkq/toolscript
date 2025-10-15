import {
  Capabilities,
  executeToolScript,
  ExecutionOptions,
  ExecutionResult,
} from "./toolscript/interpreter.ts";
import {
  FunctionCall,
  parseToolScript,
  ParseToolscriptResult,
  PlanNode,
} from "./toolscript/parser.ts";

export type {
  Capabilities,
  ExecutionOptions,
  ExecutionResult,
  FunctionCall,
  PlanNode,
};

export type ToolScriptAnalysis = {
  requiredCapabilities: ParseToolscriptResult["requiredCapabilities"];
  invocations: ParseToolscriptResult["invocations"];
  plan: ParseToolscriptResult["plan"];
};

export type PreparedToolScript = ToolScriptAnalysis & {
  /**
   * Execute the analyzed ToolScript against the provided capabilities.
   * Options are forwarded directly to the interpreter.
   */
  execute: (
    capabilities: Capabilities,
    options?: ExecutionOptions,
  ) => Promise<ExecutionResult>;
};

/**
 * Parse a ToolScript string and return the structured plan plus metadata.
 * Use this to inspect which tools will be needed before execution.
 */
export function inspectToolScript(script: string): ToolScriptAnalysis {
  const { requiredCapabilities, invocations, plan } = parseToolScript(script);
  return { requiredCapabilities, invocations, plan };
}

/**
 * Parse a ToolScript string and return an object that can be executed later.
 * This allows callers to validate tool permissions or perform approvals first.
 */
export function prepareToolScript(script: string): PreparedToolScript {
  const analysis = inspectToolScript(script);
  return {
    ...analysis,
    execute: (capabilities, options) =>
      executeToolScript(analysis.plan, capabilities, options),
  };
}

/**
 * Execute a ToolScript string immediately with the provided capabilities.
 */
export function runToolScript(
  script: string,
  capabilities: Capabilities,
  options?: ExecutionOptions,
): Promise<ExecutionResult> {
  return executeToolScript(inspectToolScript(script).plan, capabilities, options);
}
