# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
# Terminal 1 - client
cd packages/template-sandbox && pnpm client

# Terminal 2 - server
cd packages/template-sandbox && pnpm server
```
Client runs on port 8180, server on port 8181.

**Build a single plugin:**
```bash
cd packages/plugin-<name> && pnpm build
```

**Package the sandbox for deployment:**
```bash
cd packages/template-sandbox && pnpm package
```

## Architecture Overview

This is a monorepo (`pnpm` workspaces) for **HYTOPIA Neo** — a voxel-based multiplayer game framework built around a plugin-first architecture. Everything beyond core networking is a swappable plugin.

### Core Package (`packages/core`)

Provides the runtime infrastructure:

- **Server side**: `ServerBuilder` (entry point) → `ColyseusServer` → `GameRoom` (one per game session) → `ServerRuntime` (manages system loop and plugin state)
- **Client side**: `ClientBuilder` → `Connection` (Colyseus WebSocket) → `ClientRuntime` (manages systems and React overlays)
- **Shared**: `GameState` (Colyseus Schema — contains a map of plugin states), `PluginState` (base Schema class all plugins extend)

Network sync is automatic via Colyseus Schema. Imperative actions use message passing.

### Plugin System

Every feature is a plugin. Each plugin package exports three separate entry points:
- `<pkg>/server` — `ServerPlugin` definition (runs in Node.js, returns a Schema-based state)
- `<pkg>/client` — `ClientPlugin` definition (runs in browser, adds systems/UI)
- `<pkg>/shared` — shared types and Schema state classes

**ServerPlugin** must implement `init(runtime: ServerRuntime): Promise<PluginState>`. The returned state is automatically synced to all clients.

**ClientPlugin** must implement `init(runtime: ClientRuntime, state: PluginState): Promise<void>`.

### Runtime System Loop

Both server and client runtimes execute registered **systems** (plain functions) each tick in ordered phases:

- Server: `PRE_UPDATE → UPDATE → POST_UPDATE`
- Client: `PRE_FIXED_UPDATE → FIXED_UPDATE → POST_FIXED_UPDATE → PRE_UPDATE → UPDATE → POST_UPDATE`

Systems are registered with `runtime.addSystem(phase, fn)`.

### Plugin Communication

Plugins **must not** import each other's state types directly. Use:
1. **Interfaces** — `runtime.addInterface('name', impl)` / `runtime.getInterface('name')` for synchronous API between plugins
2. **Messages** — `runtime.sendMessage` / `runtime.onMessage` for event-driven communication

### Asset Convention

Generated or copied assets go in `assets/__generated/<plugin-name>/` within the consuming package.

### Template Sandbox (`packages/template-sandbox`)

Reference game implementation. Client is built with Vite + React + Tailwind CSS. Server runs with `tsx`. Demonstrates how to compose plugins into a working game.
