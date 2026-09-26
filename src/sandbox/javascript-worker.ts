import vm from "node:vm";
import ts from "typescript";

type Request = {
  action?: unknown;
  code?: unknown;
  parameterNames?: unknown;
  context?: {
    input?: unknown;
    user_name?: unknown;
    arguments?: Record<string, unknown>;
  };
};

const MAX_OUTPUT_LENGTH = 1_800;
const EXECUTION_TIMEOUT_MS = 500;
const baseAllowedInputs = new Set(["input", "user_name", "undefined"]);
const allowedCalls = new Set([
  "print",
  "String",
  "Number",
  "Boolean",
  "parseInt",
  "parseFloat",
  "abs",
  "ceil",
  "floor",
  "round",
  "min",
  "max",
  "random",
]);

class ValidationError extends Error {}

const allowedNodeKinds = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.SourceFile,
  ts.SyntaxKind.EndOfFileToken,
  ts.SyntaxKind.VariableStatement,
  ts.SyntaxKind.VariableDeclarationList,
  ts.SyntaxKind.VariableDeclaration,
  ts.SyntaxKind.Identifier,
  ts.SyntaxKind.ExpressionStatement,
  ts.SyntaxKind.Block,
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.BreakStatement,
  ts.SyntaxKind.ContinueStatement,
  ts.SyntaxKind.EmptyStatement,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.ParenthesizedExpression,
  ts.SyntaxKind.TemplateExpression,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateSpan,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.BinaryExpression,
  ts.SyntaxKind.PrefixUnaryExpression,
  ts.SyntaxKind.PostfixUnaryExpression,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.CallExpression,
]);

const assignmentOperators = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
]);

const allowedBinaryOperators = new Set<ts.SyntaxKind>([
  ...assignmentOperators,
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.MinusToken,
  ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.SlashToken,
  ts.SyntaxKind.PercentToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

const allowedPrefixOperators = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.MinusToken,
  ts.SyntaxKind.ExclamationToken,
  ts.SyntaxKind.PlusPlusToken,
  ts.SyntaxKind.MinusMinusToken,
]);

const comparisonOperators = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
]);

const numericCalls = new Set([
  "Number",
  "parseInt",
  "parseFloat",
  "abs",
  "ceil",
  "floor",
  "round",
  "min",
  "max",
  "random",
]);

const normalizeParameterNames = (value: unknown) => {
  if (!Array.isArray(value)) throw new ValidationError("Invalid parameter definition.");
  const names = value.map((name) => {
    if (
      typeof name !== "string" ||
      !/^[a-z][a-z0-9_]{0,31}$/.test(name) ||
      baseAllowedInputs.has(name) ||
      allowedCalls.has(name)
    )
      throw new ValidationError("Invalid parameter definition.");
    return name;
  });
  if (new Set(names).size !== names.length)
    throw new ValidationError("Duplicate parameter definition.");
  return names;
};

const collectDeclarations = (sourceFile: ts.SourceFile, allowedInputs: Set<string>) => {
  const declarations = new Set<string>();

  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node)) {
      if (!ts.isIdentifier(node.name))
        throw new ValidationError("Only simple variable names are allowed.");
      const name = node.name.text;
      if (name.startsWith("_") || allowedInputs.has(name) || allowedCalls.has(name))
        throw new ValidationError(`Variable name '${name}' is reserved.`);
      declarations.add(name);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return declarations;
};

const validateSource = (code: string, parameterNames: string[]) => {
  const allowedInputs = new Set([...baseAllowedInputs, ...parameterNames]);
  const sourceFile = ts.createSourceFile(
    "custom-command.js",
    code,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.JS,
  );
  const diagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] })
    .parseDiagnostics;
  if (diagnostics && diagnostics.length > 0)
    throw new ValidationError(ts.flattenDiagnosticMessageText(diagnostics[0]!.messageText, " "));

  const declarations = collectDeclarations(sourceFile, allowedInputs);

  // Keeping strings out of local variables prevents compact source from repeatedly doubling a
  // value before the process memory limit can intervene. Strings can still be used directly in
  // conditions and print().
  const isSafeStoredExpression = (node: ts.Expression): boolean => {
    if (
      ts.isNumericLiteral(node) ||
      node.kind === ts.SyntaxKind.TrueKeyword ||
      node.kind === ts.SyntaxKind.FalseKeyword ||
      node.kind === ts.SyntaxKind.NullKeyword
    )
      return true;
    if (ts.isIdentifier(node)) return declarations.has(node.text) || node.text === "undefined";
    if (ts.isParenthesizedExpression(node)) return isSafeStoredExpression(node.expression);
    if (ts.isCallExpression(node))
      return ts.isIdentifier(node.expression) && numericCalls.has(node.expression.text);
    if (ts.isPrefixUnaryExpression(node))
      return (
        node.operator === ts.SyntaxKind.ExclamationToken || isSafeStoredExpression(node.operand)
      );
    if (ts.isPostfixUnaryExpression(node)) return isSafeStoredExpression(node.operand);
    if (ts.isConditionalExpression(node))
      return isSafeStoredExpression(node.whenTrue) && isSafeStoredExpression(node.whenFalse);
    if (ts.isBinaryExpression(node)) {
      if (comparisonOperators.has(node.operatorToken.kind)) return true;
      if (assignmentOperators.has(node.operatorToken.kind))
        return isSafeStoredExpression(node.right);
      return isSafeStoredExpression(node.left) && isSafeStoredExpression(node.right);
    }
    return false;
  };

  const visit = (node: ts.Node) => {
    if (
      !allowedNodeKinds.has(node.kind) &&
      !allowedBinaryOperators.has(node.kind) &&
      !allowedPrefixOperators.has(node.kind)
    )
      throw new ValidationError(`${ts.SyntaxKind[node.kind]} syntax is not allowed.`);

    if (ts.isVariableDeclarationList(node)) {
      const isLetOrConst =
        (node.flags & ts.NodeFlags.Let) !== 0 || (node.flags & ts.NodeFlags.Const) !== 0;
      if (!isLetOrConst) throw new ValidationError("Use let or const for variables.");
    }

    if (ts.isVariableDeclaration(node) && (node.type || node.exclamationToken))
      throw new ValidationError("Type annotations are not allowed.");
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      !isSafeStoredExpression(node.initializer)
    )
      throw new ValidationError(
        "Local variables may store numbers and booleans only; print strings directly.",
      );

    if (ts.isIdentifier(node)) {
      const isDeclaration = ts.isVariableDeclaration(node.parent) && node.parent.name === node;
      const isDirectCall = ts.isCallExpression(node.parent) && node.parent.expression === node;
      if (allowedCalls.has(node.text) && !isDirectCall)
        throw new ValidationError("Sandbox functions may only be used as direct calls.");
      if (
        !isDeclaration &&
        !declarations.has(node.text) &&
        !allowedInputs.has(node.text) &&
        !allowedCalls.has(node.text)
      )
        throw new ValidationError(`Name '${node.text}' is not available.`);
    }

    if (ts.isCallExpression(node)) {
      if (!ts.isIdentifier(node.expression) || !allowedCalls.has(node.expression.text))
        throw new ValidationError("Only documented sandbox functions may be called.");
      if (node.arguments.some(ts.isSpreadElement))
        throw new ValidationError("Spread arguments are not allowed.");
    }

    if (ts.isBinaryExpression(node)) {
      if (!allowedBinaryOperators.has(node.operatorToken.kind))
        throw new ValidationError("That operator is not allowed.");
      if (
        assignmentOperators.has(node.operatorToken.kind) &&
        (!ts.isIdentifier(node.left) || !declarations.has(node.left.text))
      )
        throw new ValidationError("Assignments may only update local variables.");
      if (assignmentOperators.has(node.operatorToken.kind) && !isSafeStoredExpression(node.right))
        throw new ValidationError(
          "Local variables may store numbers and booleans only; print strings directly.",
        );
    }

    if (ts.isPrefixUnaryExpression(node)) {
      if (!allowedPrefixOperators.has(node.operator))
        throw new ValidationError("That unary operator is not allowed.");
      if (
        (node.operator === ts.SyntaxKind.PlusPlusToken ||
          node.operator === ts.SyntaxKind.MinusMinusToken) &&
        (!ts.isIdentifier(node.operand) || !declarations.has(node.operand.text))
      )
        throw new ValidationError("Updates may only change local variables.");
    }

    if (
      ts.isPostfixUnaryExpression(node) &&
      (!ts.isIdentifier(node.operand) || !declarations.has(node.operand.text))
    )
      throw new ValidationError("Updates may only change local variables.");

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
};

const parseDeclarationDefault = (
  expression: ts.Expression,
  parameterType: "string" | "integer" | "number" | "boolean",
) => {
  let value: string | number | boolean;
  if (ts.isStringLiteral(expression)) value = expression.text;
  else if (ts.isNumericLiteral(expression)) value = Number(expression.text);
  else if (expression.kind === ts.SyntaxKind.TrueKeyword) value = true;
  else if (expression.kind === ts.SyntaxKind.FalseKeyword) value = false;
  else if (
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expression.operand)
  )
    value = -Number(expression.operand.text);
  else throw new ValidationError("Parameter defaults must be string, number, or boolean literals.");

  const matches =
    (parameterType === "string" && typeof value === "string") ||
    ((parameterType === "integer" || parameterType === "number") &&
      typeof value === "number" &&
      (parameterType !== "integer" || Number.isInteger(value))) ||
    (parameterType === "boolean" && typeof value === "boolean");
  if (!matches) throw new ValidationError("A parameter default does not match its type.");
  if (typeof value === "number" && !Number.isFinite(value))
    throw new ValidationError("Numeric parameter defaults must be finite.");
  if (parameterType === "integer" && typeof value === "number" && !Number.isSafeInteger(value))
    throw new ValidationError("Integer parameter defaults must be safe integers.");
  return value;
};

const parseDeclaration = (code: string) => {
  const sourceFile = ts.createSourceFile(
    "command-declaration.ts",
    code,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );
  const diagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] })
    .parseDiagnostics;
  if (diagnostics && diagnostics.length > 0)
    throw new ValidationError(ts.flattenDiagnosticMessageText(diagnostics[0]!.messageText, " "));
  if (sourceFile.statements.length !== 1 || !ts.isFunctionDeclaration(sourceFile.statements[0]))
    throw new ValidationError("Declare exactly one top-level function.");

  const declaration = sourceFile.statements[0];
  if (!declaration.name || !declaration.body)
    throw new ValidationError("The declared function needs a name and body.");
  if (
    declaration.asteriskToken ||
    declaration.typeParameters?.length ||
    declaration.modifiers?.length
  )
    throw new ValidationError("Async, generator, generic, and modified functions are not allowed.");

  const jsDoc = (declaration as ts.FunctionDeclaration & { jsDoc?: ts.JSDoc[] }).jsDoc;
  let description = jsDoc?.find((doc) => typeof doc.comment === "string")?.comment as
    | string
    | undefined;
  let bodyStatements = [...declaration.body.statements];
  const firstStatement = bodyStatements[0];
  if (
    !description &&
    firstStatement &&
    ts.isExpressionStatement(firstStatement) &&
    ts.isStringLiteral(firstStatement.expression)
  ) {
    description = firstStatement.expression.text;
    bodyStatements = bodyStatements.slice(1);
  }
  description = description ? description.replace(/\s+/g, " ").trim() : undefined;
  if (!description)
    throw new ValidationError("Add a JSDoc comment or leading string for the command description.");
  if (description.length > 100)
    throw new ValidationError("The command description cannot exceed 100 characters.");

  const parameters = declaration.parameters.map((parameter, position) => {
    if (!ts.isIdentifier(parameter.name) || parameter.dotDotDotToken || parameter.modifiers?.length)
      throw new ValidationError("Use simple positional parameters only.");

    let type: "string" | "integer" | "number" | "boolean";
    if (!parameter.type) {
      if (parameter.initializer && ts.isNumericLiteral(parameter.initializer)) type = "number";
      else if (
        parameter.initializer &&
        (parameter.initializer.kind === ts.SyntaxKind.TrueKeyword ||
          parameter.initializer.kind === ts.SyntaxKind.FalseKeyword)
      )
        type = "boolean";
      else type = "string";
    } else if (parameter.type.kind === ts.SyntaxKind.StringKeyword) type = "string";
    else if (parameter.type.kind === ts.SyntaxKind.NumberKeyword) type = "number";
    else if (parameter.type.kind === ts.SyntaxKind.BooleanKeyword) type = "boolean";
    else if (
      ts.isTypeReferenceNode(parameter.type) &&
      ts.isIdentifier(parameter.type.typeName) &&
      parameter.type.typeName.text === "integer"
    )
      type = "integer";
    else
      throw new ValidationError(
        `Parameter '${parameter.name.text}' needs a string, number, integer, or boolean type.`,
      );

    return {
      name: parameter.name.text,
      type,
      required: !parameter.questionToken && !parameter.initializer,
      defaultValue: parameter.initializer
        ? parseDeclarationDefault(parameter.initializer, type)
        : null,
      position,
    };
  });

  const executable =
    bodyStatements.map((statement) => statement.getText(sourceFile)).join("\n") || ";";
  const parameterNames = parameters.map((parameter) => parameter.name);
  validateSource(executable, parameterNames);
  return {
    name: declaration.name.text,
    description,
    code: executable,
    parameters,
  };
};

const formatValue = (value: unknown) => {
  if (value === null) return "null";
  if (["string", "number", "boolean", "bigint", "undefined"].includes(typeof value))
    return String(value);
  throw new Error("print() accepts primitive values only.");
};

const execute = (code: string, request: Request, parameterNames: string[]) => {
  const lines: string[] = [];
  let outputLength = 0;
  const print = (...values: unknown[]) => {
    const line = values.map(formatValue).join(" ");
    outputLength += line.length + (lines.length > 0 ? 1 : 0);
    if (outputLength > MAX_OUTPUT_LENGTH) throw new Error("Output limit exceeded.");
    lines.push(line);
  };

  const globals: Record<string, unknown> = {
    input: typeof request.context?.input === "string" ? request.context.input : "",
    user_name: typeof request.context?.user_name === "string" ? request.context.user_name : "",
    print,
    String,
    Number,
    Boolean,
    parseInt,
    parseFloat,
    abs: Math.abs,
    ceil: Math.ceil,
    floor: Math.floor,
    round: Math.round,
    min: Math.min,
    max: Math.max,
    random: Math.random,
  };
  for (const name of parameterNames) {
    const value = request.context?.arguments?.[name];
    globals[name] = ["string", "number", "boolean"].includes(typeof value) ? value : "";
  }

  const context = vm.createContext(globals, {
    codeGeneration: { strings: false, wasm: false },
    name: "custom-command",
  });

  new vm.Script(`"use strict";\n${code}`, { filename: "custom-command.js" }).runInContext(context, {
    timeout: EXECUTION_TIMEOUT_MS,
  });

  return lines.join("\n") || "Command completed without output.";
};

const respond = (response: Record<string, unknown>) =>
  process.stdout.write(JSON.stringify(response));

try {
  const request = JSON.parse(await Bun.stdin.text()) as Request;
  if (typeof request.code !== "string") throw new ValidationError("Code is required.");
  if (request.action === "parse-declaration")
    respond({ ok: true, output: JSON.stringify(parseDeclaration(request.code)) });
  else {
    const parameterNames = normalizeParameterNames(request.parameterNames ?? []);
    validateSource(request.code, parameterNames);

    if (request.action === "validate") respond({ ok: true, output: "Code is valid." });
    else if (request.action === "execute")
      respond({ ok: true, output: execute(request.code, request, parameterNames) });
    else throw new ValidationError("Invalid runner action.");
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "Code could not be processed.";
  respond({
    ok: false,
    error: error instanceof ValidationError ? message : `Runtime error: ${message}`,
  });
}
