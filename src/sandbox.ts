import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type SandboxLanguage = "javascript" | "python";

type SandboxContext = {
  input: string;
  user_name: string;
};

type SandboxResult = { ok: true; output: string } | { ok: false; error: string };

type WorkerResponse = {
  ok?: boolean;
  output?: unknown;
  error?: unknown;
};

const MAX_SOURCE_LENGTH = 4_000;
const MAX_INPUT_LENGTH = 1_000;
const WORKER_TIMEOUT_MS = 1_000;

const pythonExecutable = () => process.env.CUSTOM_COMMAND_PYTHON ?? "python3";

const workerFor = (language: SandboxLanguage) =>
  language === "javascript"
    ? [
        pythonExecutable(),
        "-I",
        "-S",
        `${import.meta.dir}/sandbox/supervisor.py`,
        process.execPath,
        "--smol",
        `${import.meta.dir}/sandbox/javascript-worker.ts`,
      ]
    : [pythonExecutable(), "-I", "-S", `${import.meta.dir}/sandbox/python_worker.py`];

const runWorker = async (
  language: SandboxLanguage,
  request: Record<string, unknown>,
): Promise<SandboxResult> => {
  let processHandle: Bun.Subprocess<"pipe", "pipe", "pipe">;
  const sandboxDirectory = await mkdtemp(join(tmpdir(), "buddha-command-"));

  try {
    processHandle = Bun.spawn({
      cmd: workerFor(language),
      cwd: sandboxDirectory,
      env: { LANG: "C", PATH: "/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin" },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch {
    await rm(sandboxDirectory, { recursive: true, force: true });
    return { ok: false, error: `${language} runner is not available.` };
  }

  processHandle.stdin.write(JSON.stringify(request));
  processHandle.stdin.end();

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    processHandle.kill("SIGKILL");
  }, WORKER_TIMEOUT_MS);

  const stdout = new Response(processHandle.stdout).text();
  const stderr = new Response(processHandle.stderr).text();

  try {
    await processHandle.exited;
  } finally {
    clearTimeout(timeout);
    await rm(sandboxDirectory, { recursive: true, force: true });
  }

  // Always drain stderr, but never expose worker diagnostics or local paths to Discord.
  await stderr;

  if (timedOut) return { ok: false, error: "Execution limit exceeded." };
  if (processHandle.exitCode !== 0) return { ok: false, error: "The isolated runner failed." };

  try {
    const response = JSON.parse(await stdout) as WorkerResponse;
    if (response.ok === true && typeof response.output === "string")
      return { ok: true, output: response.output };
    if (response.ok === false && typeof response.error === "string")
      return { ok: false, error: response.error.slice(0, 300) };
  } catch {
    // Fall through to the deliberately generic protocol error below.
  }

  return { ok: false, error: "The isolated runner returned an invalid response." };
};

const validateSandboxSource = async (
  language: SandboxLanguage,
  code: string,
): Promise<SandboxResult> => {
  if (code.length === 0) return { ok: false, error: "Code cannot be empty." };
  if (code.length > MAX_SOURCE_LENGTH)
    return {
      ok: false,
      error: `Code cannot exceed ${MAX_SOURCE_LENGTH.toLocaleString()} characters.`,
    };

  return runWorker(language, { action: "validate", code });
};

const executeSandbox = async (
  language: SandboxLanguage,
  code: string,
  context: SandboxContext,
): Promise<SandboxResult> => {
  if (code.length === 0 || code.length > MAX_SOURCE_LENGTH)
    return { ok: false, error: "Stored code is outside the allowed size." };

  return runWorker(language, {
    action: "execute",
    code,
    context: {
      input: context.input.slice(0, MAX_INPUT_LENGTH),
      user_name: context.user_name.slice(0, 100),
    },
  });
};

export { executeSandbox, validateSandboxSource };
export type { SandboxContext, SandboxLanguage, SandboxResult };
