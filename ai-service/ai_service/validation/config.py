"""Load validation.yaml and apply AILOKAL_VALIDATION__SECTION__KEY env overrides."""

from __future__ import annotations

import copy
import hashlib
import json
import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

ENV_PREFIX = "AILOKAL_VALIDATION__"
DEFAULT_PATH = Path(__file__).resolve().parents[2] / "config" / "validation.yaml"


class ConfigError(ValueError):
    pass


@dataclass(frozen=True)
class ValidationConfig:
    raw: dict[str, Any]
    version: str

    def section(self, name: str) -> dict[str, Any]:
        value = self.raw.get(name)
        if not isinstance(value, dict):
            raise ConfigError(f"missing config section: {name}")
        return value

    def get(self, section: str, key: str) -> Any:
        sec = self.section(section)
        if key not in sec:
            raise ConfigError(f"missing config key: {section}.{key}")
        return sec[key]

    @property
    def required_detectors(self) -> list[str]:
        return list(self.raw.get("required_detectors", []))


def _apply_overrides(data: dict[str, Any], env: Mapping[str, str], prefix: str = ENV_PREFIX) -> None:
    for name, value in env.items():
        if not name.startswith(prefix):
            continue
        path = [p.lower() for p in name[len(prefix) :].split("__") if p]
        if not path:
            continue
        node: Any = data
        for part in path[:-1]:
            if not isinstance(node, dict) or part not in node:
                raise ConfigError(f"unknown config override {name}")
            node = node[part]
        leaf = path[-1]
        if not isinstance(node, dict) or leaf not in node:
            raise ConfigError(f"unknown config override {name}")
        parsed = yaml.safe_load(value)
        if type(parsed) is not type(node[leaf]) and not (
            isinstance(parsed, (int, float)) and isinstance(node[leaf], (int, float))
        ):
            raise ConfigError(f"override {name} has wrong type")
        node[leaf] = parsed


def load_config(
    path: Path | str | None = None,
    env: Mapping[str, str] | None = None,
    overrides: Mapping[str, Any] | None = None,
    *,
    env_prefix: str = ENV_PREFIX,
) -> ValidationConfig:
    """Load a YAML config. `overrides` is a nested dict merged last (used by tests/tuning)."""
    cfg_path = Path(path or os.environ.get("AILOKAL_VALIDATION_CONFIG") or DEFAULT_PATH)
    with cfg_path.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    if not isinstance(data, dict):
        raise ConfigError("validation config must be a mapping")
    data = copy.deepcopy(data)
    _apply_overrides(data, os.environ if env is None else env, env_prefix)
    if overrides:
        _deep_merge(data, overrides)
    weights = data.get("score", {}).get("weights", {})
    total = sum(float(v) for v in weights.values())
    if weights and abs(total - 1.0) > 1e-6:
        raise ConfigError(f"score weights must sum to 1.0 (got {total})")
    digest = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()[:10]
    return ValidationConfig(raw=data, version=f"{data.get('version', 'unversioned')}+{digest}")


def _deep_merge(dst: dict[str, Any], src: Mapping[str, Any]) -> None:
    for k, v in src.items():
        if isinstance(v, Mapping) and isinstance(dst.get(k), dict):
            _deep_merge(dst[k], v)
        else:
            dst[k] = copy.deepcopy(v)
