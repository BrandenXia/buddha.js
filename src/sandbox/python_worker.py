import ast
import json
import keyword
import math
import random
import re
import resource
import statistics
import sys

MAX_OUTPUT_LENGTH = 1_800
MAX_OPERATIONS = 50_000
MAX_RANGE_LENGTH = 10_000
MAX_VALUE_SIZE = 32_000


class ValidationError(Exception):
    pass


class ExecutionLimitError(Exception):
    pass


class ResponseComplete(Exception):
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
    "all",
    "any",
    "ascii",
    "bin",
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
    "chr",
    "dict",
    "enumerate",
    "hex",
    "list",
    "ord",
    "reversed",
    "set",
    "tuple",
    "zip",
}
BASE_SAFE_INPUTS = {"input", "user_name"}

SAFE_STRING_METHODS = {
    "capitalize",
    "casefold",
    "center",
    "count",
    "endswith",
    "expandtabs",
    "find",
    "index",
    "isalnum",
    "isalpha",
    "isascii",
    "isdecimal",
    "isdigit",
    "isidentifier",
    "islower",
    "isnumeric",
    "isprintable",
    "isspace",
    "istitle",
    "isupper",
    "join",
    "ljust",
    "lower",
    "lstrip",
    "removeprefix",
    "removesuffix",
    "replace",
    "rfind",
    "rindex",
    "rjust",
    "rsplit",
    "rstrip",
    "split",
    "splitlines",
    "startswith",
    "strip",
    "swapcase",
    "title",
    "upper",
    "zfill",
}

SAFE_MODULE_CALLS = {
    "json": {"dumps", "loads"},
    "math": {
        "acos",
        "acosh",
        "asin",
        "asinh",
        "atan",
        "atan2",
        "atanh",
        "ceil",
        "comb",
        "copysign",
        "cos",
        "cosh",
        "degrees",
        "dist",
        "erf",
        "erfc",
        "exp",
        "expm1",
        "fabs",
        "factorial",
        "floor",
        "fmod",
        "frexp",
        "fsum",
        "gamma",
        "gcd",
        "hypot",
        "isclose",
        "isfinite",
        "isinf",
        "isnan",
        "isqrt",
        "lcm",
        "ldexp",
        "lgamma",
        "log",
        "log10",
        "log1p",
        "log2",
        "modf",
        "nextafter",
        "perm",
        "pow",
        "prod",
        "radians",
        "remainder",
        "sin",
        "sinh",
        "sqrt",
        "tan",
        "tanh",
        "trunc",
        "ulp",
    },
    "random": {
        "choice",
        "choices",
        "getrandbits",
        "randint",
        "random",
        "randrange",
        "sample",
        "triangular",
        "uniform",
    },
    "re": {"escape", "findall", "finditer", "fullmatch", "match", "search", "split", "sub", "subn"},
    "statistics": {
        "correlation",
        "covariance",
        "fmean",
        "geometric_mean",
        "harmonic_mean",
        "linear_regression",
        "mean",
        "median",
        "median_grouped",
        "median_high",
        "median_low",
        "mode",
        "multimode",
        "pstdev",
        "pvariance",
        "quantiles",
        "stdev",
        "variance",
    },
}
SAFE_MODULE_VALUES = {
    "math": {"e", "inf", "nan", "pi", "tau"},
    "re": {"A", "ASCII", "I", "IGNORECASE", "M", "MULTILINE", "S", "DOTALL", "X", "VERBOSE"},
}
SAFE_MODULE_OBJECTS = {
    "json": json,
    "math": math,
    "random": random,
    "re": re,
    "statistics": statistics,
}

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
    ast.Set,
    ast.Subscript,
    ast.Slice,
    ast.Attribute,
    ast.Import,
    ast.alias,
    ast.keyword,
    ast.GeneratorExp,
    ast.ListComp,
    ast.SetComp,
    ast.DictComp,
    ast.comprehension,
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


def parse_declaration(code):
    try:
        tree = ast.parse(code, filename="<command-declaration>", mode="exec")
    except SyntaxError as error:
        raise ValidationError(f"Syntax error on line {error.lineno}.") from None

    if len(tree.body) != 1 or not isinstance(tree.body[0], ast.FunctionDef):
        raise ValidationError("Declare exactly one top-level function.")
    function = tree.body[0]
    if function.decorator_list:
        raise ValidationError("Function decorators are not allowed.")
    if (
        function.args.posonlyargs
        or function.args.kwonlyargs
        or function.args.vararg
        or function.args.kwarg
    ):
        raise ValidationError("Use simple positional parameters only.")

    description = ast.get_docstring(function, clean=True)
    if not description:
        raise ValidationError("Add a function docstring for the command description.")
    description = " ".join(description.split())
    if len(description) > 100:
        raise ValidationError("The command description cannot exceed 100 characters.")

    type_names = {"str": "string", "int": "integer", "float": "number", "bool": "boolean"}
    defaults_start = len(function.args.args) - len(function.args.defaults)
    parameters = []
    for position, argument in enumerate(function.args.args):
        if not isinstance(argument.annotation, ast.Name) or argument.annotation.id not in type_names:
            raise ValidationError(
                f"Parameter '{argument.arg}' needs a str, int, float, or bool annotation."
            )
        parameter_type = type_names[argument.annotation.id]
        has_default = position >= defaults_start
        default_value = None
        if has_default:
            default_node = function.args.defaults[position - defaults_start]
            try:
                default_value = ast.literal_eval(default_node)
            except (ValueError, TypeError):
                raise ValidationError(
                    f"Parameter '{argument.arg}' must use a literal default value."
                ) from None
            valid_default = (
                (parameter_type == "string" and type(default_value) is str)
                or (parameter_type == "integer" and type(default_value) is int)
                or (
                    parameter_type == "number"
                    and type(default_value) in (int, float)
                )
                or (parameter_type == "boolean" and type(default_value) is bool)
            )
            if not valid_default:
                raise ValidationError(
                    f"Default value for '{argument.arg}' does not match its annotation."
                )
        parameters.append(
            {
                "name": argument.arg,
                "type": parameter_type,
                "required": not has_default,
                "defaultValue": default_value,
                "position": position,
            }
        )

    body = function.body
    if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
        if isinstance(body[0].value.value, str):
            body = body[1:]
    executable = ast.unparse(ast.Module(body=body or [ast.Pass()], type_ignores=[]))
    parameter_names = [parameter["name"] for parameter in parameters]
    validate_source(executable, parameter_names)
    return {
        "name": function.name,
        "description": description,
        "code": executable,
        "parameters": parameters,
    }


def normalize_parameter_names(value):
    if not isinstance(value, list):
        raise ValidationError("Invalid parameter definition.")
    names = []
    for name in value:
        if (
            not isinstance(name, str)
            or not name.isascii()
            or not name.isidentifier()
            or keyword.iskeyword(name)
            or name.startswith("_")
            or name in BASE_SAFE_INPUTS | SAFE_FUNCTIONS
        ):
            raise ValidationError("Invalid parameter definition.")
        names.append(name)
    if len(set(names)) != len(names):
        raise ValidationError("Duplicate parameter definition.")
    return names


def validate_source(code, parameter_names):
    safe_inputs = BASE_SAFE_INPUTS | set(parameter_names)
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
    direct_call_attributes = {
        id(node.func)
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
    }
    attribute_bases = {
        id(node.value)
        for node in ast.walk(tree)
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name)
    }
    imported_modules = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.asname or alias.name not in SAFE_MODULE_OBJECTS:
                    raise ValidationError(
                        "Only direct imports of math, random, statistics, re, and json are allowed."
                    )
                imported_modules.add(alias.name)
    for name in declarations:
        if name.startswith("_") or name in SAFE_FUNCTIONS or name in safe_inputs:
            raise ValidationError(f"Variable name '{name}' is reserved.")

    for node in ast.walk(tree):
        if type(node) not in ALLOWED_NODES:
            raise ValidationError(f"{type(node).__name__} syntax is not allowed.")
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
            if node.id not in declarations | SAFE_FUNCTIONS | safe_inputs | imported_modules:
                raise ValidationError(f"Name '{node.id}' is not available.")
            if node.id in SAFE_FUNCTIONS and id(node) not in direct_call_names:
                raise ValidationError("Sandbox functions may only be used as direct calls.")
            if node.id in imported_modules and id(node) not in attribute_bases:
                raise ValidationError("Imported modules may only be used through safe attributes.")
        if isinstance(node, ast.Call):
            valid_name_call = isinstance(node.func, ast.Name) and node.func.id in SAFE_FUNCTIONS
            valid_attribute_call = isinstance(node.func, ast.Attribute)
            if not valid_name_call and not valid_attribute_call:
                raise ValidationError("Only documented sandbox functions may be called.")
            if any(keyword_argument.arg is None for keyword_argument in node.keywords):
                raise ValidationError("Expanded keyword arguments are not allowed.")
        if isinstance(node, ast.Attribute):
            if node.attr.startswith("_"):
                raise ValidationError("Private and reflective attributes are not allowed.")
            is_string_method = node.attr in SAFE_STRING_METHODS
            is_module_call = (
                isinstance(node.value, ast.Name)
                and node.value.id in imported_modules
                and node.attr in SAFE_MODULE_CALLS.get(node.value.id, set())
            )
            is_module_value = (
                isinstance(node.value, ast.Name)
                and node.value.id in imported_modules
                and node.attr in SAFE_MODULE_VALUES.get(node.value.id, set())
            )
            if not is_string_method and not is_module_call and not is_module_value:
                raise ValidationError(f"Attribute '{node.attr}' is not available.")
            if (is_string_method or is_module_call) and id(node) not in direct_call_attributes:
                raise ValidationError("Sandbox methods may only be used as direct calls.")
        if isinstance(node, (ast.Assign, ast.AugAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            if any(not isinstance(target, ast.Name) for target in targets):
                raise ValidationError("Assignments may only update local variables.")
        if isinstance(node, ast.For) and not isinstance(node.target, ast.Name):
            raise ValidationError("Loop targets must be simple variable names.")
        if isinstance(node, ast.comprehension) and not isinstance(node.target, ast.Name):
            raise ValidationError("Comprehension targets must be simple variable names.")
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
    if isinstance(value, (list, tuple, set)):
        values = list(value)[:1_000]
        size += sum(approximate_size(item, seen) for item in values)
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
    if type(value) in (list, tuple, set):
        if len(value) > 100:
            raise ExecutionLimitError("Printed collections are limited to 100 values.")
        if type(value) is list:
            opening, closing = "[", "]"
        elif type(value) is tuple:
            opening, closing = "(", ")"
        else:
            opening, closing = "{", "}"
        return opening + ", ".join(format_value(item, depth + 1) for item in value) + closing
    if type(value) is dict:
        if len(value) > 100:
            raise ExecutionLimitError("Printed collections are limited to 100 values.")
        return "{" + ", ".join(
            f"{format_value(key, depth + 1)}: {format_value(item, depth + 1)}"
            for key, item in value.items()
        ) + "}"
    raise ValidationError("print() accepts primitive values and simple collections only.")


def execute(tree, context, parameter_names):
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
        "all": all,
        "any": any,
        "ascii": ascii,
        "bin": bin,
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
        "chr": chr,
        "dict": dict,
        "enumerate": enumerate,
        "hex": hex,
        "list": list,
        "ord": ord,
        "reversed": reversed,
        "set": set,
        "tuple": tuple,
        "zip": zip,
    }

    def safe_import(name, _globals=None, _locals=None, fromlist=(), level=0):
        if level != 0 or fromlist or name not in SAFE_MODULE_OBJECTS:
            raise ValidationError("That module import is not allowed.")
        return SAFE_MODULE_OBJECTS[name]

    safe_builtins["__import__"] = safe_import
    namespace = {
        "__builtins__": safe_builtins,
        "input": context.get("input", "") if isinstance(context.get("input", ""), str) else "",
        "user_name": context.get("user_name", "")
        if isinstance(context.get("user_name", ""), str)
        else "",
    }
    arguments = context.get("arguments", {})
    if not isinstance(arguments, dict):
        arguments = {}
    for name in parameter_names:
        value = arguments.get(name, "")
        namespace[name] = value if type(value) in (str, int, float, bool) else ""

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
    if request.get("action") == "parse-declaration":
        respond({"ok": True, "output": json.dumps(parse_declaration(code), separators=(",", ":"))})
        raise ResponseComplete()
    parameter_names = normalize_parameter_names(request.get("parameterNames", []))
    parsed = validate_source(code, parameter_names)
    if request.get("action") == "validate":
        respond({"ok": True, "output": "Code is valid."})
    elif request.get("action") == "execute":
        context = request.get("context")
        respond(
            {
                "ok": True,
                "output": execute(
                    parsed, context if isinstance(context, dict) else {}, parameter_names
                ),
            }
        )
    else:
        raise ValidationError("Invalid runner action.")
except ResponseComplete:
    pass
except (ValidationError, ExecutionLimitError, ValueError, TypeError, ZeroDivisionError) as error:
    respond({"ok": False, "error": str(error)[:300]})
except BaseException:
    respond({"ok": False, "error": "Code failed at runtime."})
