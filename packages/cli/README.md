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
ofgui publish ./MyProject --output ./release
# Trusted-local recovery only; this is not a normal authoring workflow.
ofgui restore ./release --output ./restored-project
```

`restore` accepts a publish directory and writes a new project directory. It validates artifact paths and completes a staged write before `--force` replaces an existing output; it does not make untrusted artifacts safe or recover the original source project.

The package also keeps `openfairygui` as a compatibility alias for the CLI command.

Repository:

- https://github.com/OpenFairyGUI/OpenFairyGUI
