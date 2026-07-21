#!/usr/bin/env python3
"""Dependency-free static validation for the GitHub Pages package."""
from __future__ import annotations

import json
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class AssetParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: list[str] = []
        self.ids: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            if values["id"] in self.ids:
                raise AssertionError(f"Duplicate HTML id: {values['id']}")
            self.ids.add(values["id"])
        if tag == "script" and values.get("src"):
            self.assets.append(values["src"])
        if tag == "link" and values.get("href"):
            self.assets.append(values["href"])


def validate_json(relative: str) -> None:
    with (ROOT / relative).open(encoding="utf-8") as handle:
        json.load(handle)


def validate_html(relative: str) -> None:
    parser = AssetParser()
    parser.feed((ROOT / relative).read_text(encoding="utf-8"))
    for asset in parser.assets:
        if asset.startswith(("http://", "https://", "#", "data:")):
            continue
        path = ROOT / asset.removeprefix("./")
        assert path.exists(), f"Missing asset referenced by {relative}: {asset}"


def main() -> None:
    for relative in ["data/seed.json", "manifest.webmanifest", "apps-script/appsscript.json"]:
        validate_json(relative)
    for relative in ["index.html", "404.html"]:
        validate_html(relative)
    required = [
        ".nojekyll", "config.js", "service-worker.js", "assets/app.js", "assets/styles.css",
        ".github/workflows/pages.yml", "apps-script/Code.gs", "README.md"
    ]
    for relative in required:
        assert (ROOT / relative).exists(), f"Required file missing: {relative}"
    seed = json.loads((ROOT / "data/seed.json").read_text(encoding="utf-8"))
    trend_ids = {row["id"] for row in seed["trends"]}
    assert trend_ids, "Seed must contain at least one trend"
    assert all(row["trend_id"] in trend_ids for row in seed["observations"]), "Orphan observation in seed"
    assert all(row["trend_id"] in trend_ids for row in seed["experiments"]), "Orphan experiment in seed"
    print("Static package validation passed.")


if __name__ == "__main__":
    main()
