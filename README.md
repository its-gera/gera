<p align="center">
  <img src="src-tauri/icons/logo.svg" width="200"/>
    <h1>Gera</h1>
</p>

> [!WARNING]
> Gera is in pre-alpha state and under heavy development, it is mostly feature-complete as far as basic functionality goes. Bugs are expected and undoubtly numerous.

Gera is a unified workspace that connects your schedule, tasks, and knowledge. It organizes your work locally without restricting your data to proprietary formats or cloud subscriptions.

<p align="center">
  <img src="public/gera.png"/>
</p>

## Core Concepts

Gera separates your information into three distinct categories:

* **Events**: Occurrences bound to a specific time, such as meetings and appointments.
* **Tasks**: Actions you need to complete.
* **Notes**: Your knowledge, ideas, and context. Notes store the background information required for your events and tasks.

## Local-First Architecture

You own your data completely. Gera operates entirely on your local device.

* **Standard Formats**: Gera stores all data as plain files using standard Markdown (`.md`) and YAML.
* **Absolute Accessibility**: You can open, search, and modify your files with any basic text editor outside of the app.
* **Privacy by Default**: Your files remain on your local drive and never sync to a server unless you configure an external tool to do so.

## Application Comparisons

* **Gera vs. Calendars (e.g., Google Calendar)**: Calendars organize time but isolate your reference notes and actionable tasks. Gera links your schedule directly to your to-do items and related documentation.
* **Gera vs. Note Apps (e.g., Obsidian, Notion)**: Traditional note applications treat events and tasks as plain text strings. Gera treats time and action as primary data types and provides dedicated interfaces for them.
* **Gera vs. Task Managers (e.g., Todoist)**: Task managers list what you need to do but omit the broader context. Gera places your tasks directly alongside the project notes and calendar events that define them.

## Building Gera

Gera uses `bun` for frontend dependencies and `uv` for Python backend management.

Follow these steps to build the project locally:

1. Install the `bun` and `uv` package managers on your system.
2. Run `bun install` in the project root to download frontend dependencies.
3. Run `uv sync` to prepare the Python environment.
4. Execute the build script matching your operating system located in the `scripts/` directory (for example, `bash scripts/linux/build.sh` or `./scripts/windows/build.ps1`).

## Roadmap

Miscellaneous UI improvements and bugfixes can be expected in early future.

Major milestones planned for the project:

- [x] Packaging Gera for humans (brew, choco, installers) - __0.0.1__
- [x] Dark mode - __0.0.3__
- [x] Keybindings (customizable) - __0.0.4__
- [x] Plain-text note editor - __0.0.7__
- [ ] Syncing calendar event changes back to the source calendar
- [ ] Scriptability or plugin system
- [ ] Sync for Outlook calendar
- [ ] Localization
- [ ] Update distribution
- [ ] Mobile app
- [ ] P2P sync between mobile apps and desktop apps
