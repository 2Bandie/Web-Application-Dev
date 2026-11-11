"""Package tracked static assets alongside the built Pulse app, without sources/secrets."""

import argparse
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[3]
WEB_EXTENSIONS = {
    ".html",
    ".css",
    ".js",
    ".json",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".ico",
    ".mp3",
    ".wav",
    ".svg",
    ".webp",
    ".woff",
    ".woff2",
    ".txt",
}


def package(output):
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise ValueError("Choose an empty output directory.")
    dist = ROOT / "Projects/Midterm/frontend/dist"
    if not (dist / "index.html").is_file():
        raise ValueError("Build the frontend before packaging Pages.")
    tracked = (
        subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT)
        .decode()
        .split("\0")
    )
    for name in filter(None, tracked):
        relative = Path(name)
        if relative.parts[0].startswith(".") or relative.is_relative_to(
            "Projects/Midterm"
        ):
            continue
        if relative.suffix.lower() not in WEB_EXTENSIONS and name != "CNAME":
            continue
        source = ROOT / relative
        if not source.is_file() or source.is_symlink():
            continue
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    shutil.copytree(dist, output / "Projects/Midterm")
    # Keep the existing capital-I Wordle page available at both paths.
    if not (output / "index.html").exists() and (output / "Index.html").exists():
        shutil.copy2(output / "Index.html", output / "index.html")
    (output / ".nojekyll").touch()
    print(f"Packaged static projects and Pulse in {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    package(parser.parse_args().output)
