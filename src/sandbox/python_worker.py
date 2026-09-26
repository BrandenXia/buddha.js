import ast
import json
import resource
import sys

MAX_OUTPUT_LENGTH = 1_800
MAX_OPERATIONS = 50_000
MAX_RANGE_LENGTH = 10_000
MAX_VALUE_SIZE = 32_000


class ValidationError(Exception):
    pass


class ExecutionLimitError(Exception):
    pass


def lower_resource_limit(kind, soft_limit):
    try:
        _, hard = resource.getrlimit(kind)
        target = soft_limit if hard == resource.RLIM_INFINITY else min(soft_limit, hard)
        resource.setrlimit(kind, (target, hard))
    except (OSError, ValueError):
        # Some platforms (notably macOS) expose but do not enforce every rlimit.
        pass


lower_resource_limit(resource.RLIMIT_CPU, 1)
lower_resource_limit(resource.RLIMIT_AS, 256 * 1024 * 1024)
lower_resource_limit(resource.RLIMIT_CORE, 0)


def safe_range(*args):
    value = range(*args)
    if len(value) > MAX_RANGE_LENGTH:
        raise ExecutionLimitError("range() is limited to 10,000 values.")
    return value


SAFE_FUNCTIONS = {
    "print",
    "str",
    "int",
    "float",
    "bool",
    "len",
    "range",
    "abs",
    "round",
    "min",
    "max",
    "sum",
    "sorted",
}
SAFE_INPUTS = {"input", "user_name"}

ALLOWED_NODES = {
    ast.Module,
    ast.Expr,
    ast.Assign,
    ast.AugAssign,
    ast.Name,
    ast.Store,
    ast.Load,
    ast.Constant,
    ast.List,
    ast.Tuple,
    ast.Dict,
    ast.Subscript,
    ast.Slice,
    ast.BinOp,
    ast.UnaryOp,
    ast.BoolOp,
    ast.Compare,
    ast.IfExp,
    ast.JoinedStr,
    ast.FormattedValue,
    ast.Call,
    ast.If,
    ast.While,
    ast.For,
    ast.Break,
    ast.Continue,
    ast.Pass,
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.FloorDiv,
    ast.Mod,
    ast.UAdd,
    ast.USub,
    ast.Not,
    ast.And,
    ast.Or,
    ast.Eq,
    ast.NotEq,
    ast.Lt,
    ast.LtE,
    ast.Gt,
    ast.GtE,
    ast.Is,
    ast.IsNot,
    ast.In,
    ast.NotIn,
}


def validate_source(code):
    try:
        tree = ast.parse(code, filename="<custom-command>", mode="exec")
    except SyntaxError as error:
        raise ValidationError(f"Syntax error on line {error.lineno}.") from None

    declarations = {
        node.id for node in ast.walk(tree) if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store)
    }
    direct_call_names = {
        id(node.func)
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
    }
    for name in declarations:
        if name.startswith("_") or name in SAFE_FUNCTIONS or name in SAFE_INPUTS:
            raise ValidationError(f"Variable name '{name}' is reserved.")

    for node in ast.walk(tree):
        if type(node) not in ALLOWED_NODES:
            raise ValidationError(f"{type(node).__name__} syntax is not allowed.")
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
            if node.id not in declarations | SAFE_FUNCTIONS | SAFE_INPUTS:
                raise ValidationError(f"Name '{node.id}' is not available.")
            if node.id in SAFE_FUNCTIONS and id(node) not in direct_call_names:
                raise ValidationError("Sandbox functions may only be used as direct calls.")
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in SAFE_FUNCTIONS:
                raise ValidationError("Only documented sandbox functions may be called.")
            if node.keywords:
                raise ValidationError("Keyword arguments are not allowed.")
        if isinstance(node, (ast.Assign, ast.AugAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            if any(not isinstance(target, ast.Name) for target in targets):
                raise ValidationError("Assignments may only update local variables.")
        if isinstance(node, ast.For) and not isinstance(node.target, ast.Name):
            raise ValidationError("Loop targets must be simple variable names.")
        if isinstance(node, ast.Constant):
            if type(node.value) is int and abs(node.value) > 10_000:
                raise ValidationError("Integer literals are limited to 10,000.")
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Mult):
            numeric_types = (int, float, bool)

            def definitely_numeric(value):
                if isinstance(value, ast.Constant):
                    return type(value.value) in numeric_types
                if isinstance(value, ast.UnaryOp):
                    return definitely_numeric(value.operand)
                if isinstance(value, ast.BinOp):
                    return definitely_numeric(value.left) and definitely_numeric(value.right)
                if isinstance(value, ast.Call) and isinstance(value.func, ast.Name):
                    return value.func.id in {"int", "float", "len", "abs", "round", "sum"}
                return False

            if not definitely_numeric(node.left) or not definitely_numeric(node.right):
                raise ValidationError(
                    "Multiplication is limited to expressions known to be numeric."
                )

    return tree


def approximate_size(value, seen=None):
    if seen is None:
        seen = set()
    value_id = id(value)
    if value_id in seen:
        return 0
    seen.add(value_id)
    size = sys.getsizeof(value)
    if isinstance(value, (list, tuple)):
        size += sum(approximate_size(item, seen) for item in value[:1_000])
    elif isinstance(value, dict):
        for index, (key, item) in enumerate(value.items()):
            if index >= 1_000:
                break
            size += approximate_size(key, seen) + approximate_size(item, seen)
    return size


def make_trace():
    operations = 0

    def trace(frame, event, _arg):
        nonlocal operations
        if frame.f_code.co_filename != "<custom-command>":
            return trace
        if event == "call":
            frame.f_trace_opcodes = True
        elif event == "opcode":
            operations += 1
            if operations > MAX_OPERATIONS:
                raise ExecutionLimitError("Operation limit exceeded.")
            value_size = sum(
                approximate_size(value)
                for name, value in frame.f_locals.items()
                if not name.startswith("__")
            )
            if value_size > MAX_VALUE_SIZE:
                raise ExecutionLimitError("Working value limit exceeded.")
        return trace

    return trace


def format_value(value, depth=0):
    if depth > 4:
        raise ExecutionLimitError("Printed values are nested too deeply.")
    if value is None:
        return "None"
    if type(value) in (str, int, float, bool):
        return str(value)
    if type(value) in (list, tuple):
        if len(value) > 100:
            raise ExecutionLimitError("Printed collections are limited to 100 values.")
        opening, closing = ("[", "]") if type(value) is list else ("(", ")")
        return opening + ", ".join(format_value(item, depth + 1) for item in value) + closing
    if type(value) is dict:
        if len(value) > 100:
            raise ExecutionLimitError("Printed collections are limited to 100 values.")
        return "{" + ", ".join(
            f"{format_value(key, depth + 1)}: {format_value(item, depth + 1)}"
            for key, item in value.items()
        ) + "}"
    raise ValidationError("print() accepts primitive values and simple collections only.")


def execute(tree, context):
    lines = []
    output_length = 0

    def safe_print(*values):
        nonlocal output_length
        line = " ".join(format_value(value) for value in values)
        output_length += len(line) + (1 if lines else 0)
        if output_length > MAX_OUTPUT_LENGTH:
            raise ExecutionLimitError("Output limit exceeded.")
        lines.append(line)

    safe_builtins = {
        "print": safe_print,
        "str": str,
        "int": int,
        "float": float,
        "bool": bool,
        "len": len,
        "range": safe_range,
        "abs": abs,
        "round": round,
        "min": min,
        "max": max,
        "sum": sum,
        "sorted": sorted,
    }
    namespace = {
        "__builtins__": safe_builtins,
        "input": context.get("input", "") if isinstance(context.get("input", ""), str) else "",
        "user_name": context.get("user_name", "")
        if isinstance(context.get("user_name", ""), str)
        else "",
    }

    compiled = compile(tree, "<custom-command>", "exec")
    sys.settrace(make_trace())
    try:
        exec(compiled, namespace, namespace)
    finally:
        sys.settrace(None)

    return "\n".join(lines) or "Command completed without output."


def respond(response):
    sys.stdout.write(json.dumps(response, separators=(",", ":")))


try:
    request = json.loads(sys.stdin.read())
    code = request.get("code")
    if not isinstance(code, str):
        raise ValidationError("Code is required.")
    parsed = validate_source(code)
    if request.get("action") == "validate":
        respond({"ok": True, "output": "Code is valid."})
    elif request.get("action") == "execute":
        context = request.get("context")
        respond({"ok": True, "output": execute(parsed, context if isinstance(context, dict) else {})})
    else:
        raise ValidationError("Invalid runner action.")
except (ValidationError, ExecutionLimitError, ValueError, TypeError, ZeroDivisionError) as error:
    respond({"ok": False, "error": str(error)[:300]})
except BaseException:
    respond({"ok": False, "error": "Code failed at runtime."})
