import os
import resource
import sys


def lower_resource_limit(kind, soft_limit):
    try:
        _, hard = resource.getrlimit(kind)
        target = soft_limit if hard == resource.RLIM_INFINITY else min(soft_limit, hard)
        resource.setrlimit(kind, (target, hard))
    except (OSError, ValueError):
        # The language-level sandbox remains fail-closed when a host does not enforce a limit.
        pass


if len(sys.argv) < 3:
    raise SystemExit(2)

lower_resource_limit(resource.RLIMIT_CPU, 1)
lower_resource_limit(resource.RLIMIT_AS, 512 * 1024 * 1024)
lower_resource_limit(resource.RLIMIT_CORE, 0)

runtime = os.path.realpath(sys.argv[1])
worker = os.path.realpath(sys.argv[-1])
os.execve(runtime, [runtime, *sys.argv[2:-1], worker], {"LANG": "C", "PATH": "/usr/bin:/bin"})
