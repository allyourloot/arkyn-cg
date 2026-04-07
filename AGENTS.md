# AGENTS2.md

This file provides guidance to AI coding assistants (Copilot, Cursor, Gemini, etc.) when working with code in this repository.

## Commands

**Install dependencies:**
```bash
pnpm install
```

**Build all packages (core + plugins):**
```bash
pnpm build
```

**Run the template sandbox (development):**
```bash
# Terminal 1 - client (port 8180)
cd packages/template-sandbox && pnpm client

# Terminal 2 - server (port 8181)
cd packages/template-sandbox && pnpm server
```

**Build a single plugin:**
```bash
cd packages/plugin-<name> && pnpm build
```

**Package the sandbox for deployment:**
```bash
cd packages/template-sandbox && pnpm package
```

## Architecture Overview

This is a `pnpm` monorepo for **HYTOPIA Neo** — a voxel-based multiplayer game framework with a plugin-first architecture. Everything beyond core networking is a swappable plugin.

### Core Package (`packages/core`)

- **Server**: `ServerBuilder` → `ColyseusServer` → `GameRoom` (one per session) → `ServerRuntime`
- **Client**: `ClientBuilder` → `Connection` (Colyseus WebSocket) → `ClientRuntime`
- **Shared**: `GameState` (Colyseus Schema, holds a map of plugin states), `PluginState` (base class for all plugin states)

Network state sync is automatic via Colyseus Schema. Imperative actions use message passing.

### Plugin System

Every feature is a plugin. Each plugin package has three entry points:
- `<pkg>/server` — `ServerPlugin` (Node.js, returns a Schema-based state)
- `<pkg>/client` — `ClientPlugin` (browser, adds systems and React UI overlays)
- `<pkg>/shared` — shared types and Schema state classes

**ServerPlugin** implements `init(runtime: ServerRuntime): Promise<PluginState>`. The returned state syncs automatically to clients.

**ClientPlugin** implements `init(runtime: ClientRuntime, state: PluginState): Promise<void>`.

### Runtime System Loop

Systems (plain functions) run each tick in ordered phases:

- Server: `PRE_UPDATE → UPDATE → POST_UPDATE`
- Client: `PRE_FIXED_UPDATE → FIXED_UPDATE → POST_FIXED_UPDATE → PRE_UPDATE → UPDATE → POST_UPDATE`

Register with `runtime.addSystem(phase, fn)`.

### Plugin Communication

**Do not** import or export plugin state types between plugins. Instead use:
1. **Interfaces** — `runtime.addInterface('name', impl)` / `runtime.getInterface('name')` for synchronous cross-plugin APIs
2. **Messages** — `runtime.sendMessage` / `runtime.onMessage` for event-driven communication

### Rules

- Compartmentalize plugins for reusability across games
- Expose functionality via `runtime.addInterface()` so other plugins can consume it
- Copy/move assets to `assets/__generated/<plugin-name>/` so they're included in builds
- Do not modify `packages/core` unless absolutely necessary

### Template Sandbox (`packages/template-sandbox`)

Reference game that composes all plugins into a working game. Vite + React + Tailwind CSS on the client, `tsx` on the server.
