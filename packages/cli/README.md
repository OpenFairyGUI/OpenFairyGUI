# @openfairygui/cli

Command-line interface for OpenFairyGUI.

## Install

```bash
npm install --global @openfairygui/cli
```

## Usage

```bash
ofgui --help
ofgui doctor ./MyProject --json
ofgui docs ls --json
ofgui inspect ./MyProject
ofgui validate ./MyProject
ofgui validate ./MyProject --json
ofgui tx ./MyProject --ops ./ops.json --json
ofgui backend-capabilities --json
ofgui publish ./MyProject --output ./release
# Trusted-local recovery only; this is not a normal authoring workflow.
ofgui restore ./release --output ./restored-project
```

`validate` is read-only. It exits with `0` for `valid`, `1` for `invalid`, `2` for invalid arguments, and `3` for `incomplete`; `--json` prints the CLI JSON envelope (`{ schemaVersion: 1, command: "validate", success, result, error? }`) containing the stable `ProjectValidationReport` in `result`.

`restore` accepts a publish directory and writes a new project directory. It validates artifact paths and completes a staged write before `--force` replaces an existing output; it does not make untrusted artifacts safe or recover the original source project.
The command only parses CLI input and delegates Node filesystem and Sharp image handling to `restoreNode()` from `@openfairygui/functions/node`.

The package also keeps `openfairygui` as a compatibility alias for the CLI command.

Repository:

- https://github.com/OpenFairyGUI/OpenFairyGUI
