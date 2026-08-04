# @openfairygui/cli

Command-line interface for OpenFairyGUI.

## Install

```bash
npm install --global @openfairygui/cli
```

## Usage

```bash
ofgui --help
ofgui inspect ./MyProject
ofgui validate ./MyProject
ofgui validate ./MyProject --json
ofgui publish ./MyProject --output ./release
# Trusted-local recovery only; this is not a normal authoring workflow.
ofgui restore ./release --output ./restored-project
```

`validate` is read-only. It exits with `0` for `valid`, `1` for `invalid`, and `2` for `incomplete`; `--json` prints the stable `ProjectValidationReport` for CI and tools.

`restore` accepts a publish directory and writes a new project directory. It validates artifact paths and completes a staged write before `--force` replaces an existing output; it does not make untrusted artifacts safe or recover the original source project.
The command only parses CLI input and delegates Node filesystem and Sharp image handling to `restoreNode()` from `@openfairygui/functions/node`.

The package also keeps `openfairygui` as a compatibility alias for the CLI command.

Repository:

- https://github.com/OpenFairyGUI/OpenFairyGUI
