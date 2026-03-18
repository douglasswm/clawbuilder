# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0.0] - 2026-03-18

### Added
- Deploy wizard with persona selection, name generation, and advanced settings (region, size, model)
- Deployment detail page with real-time status polling, progress tracking, and destroy functionality
- Settings page for managing encrypted AI API keys (Anthropic, OpenAI, Gemini)
- Skills catalog proxy with category browsing, search, and 5-minute caching
- AES-256-GCM credential encryption for API key storage
- CLI wrapper for clawmacdo with isolated sandboxes and 30s timeout
- Supabase migration for deployments and user_api_keys tables with RLS policies
- Dashboard deployment list with status badges and deployment cards
- Validation module for deployment names, regions, sizes, and models
- Unit tests for all server modules (132 tests)

### Changed
- Dashboard now shows deployment list instead of placeholder
- Authenticated layout includes toast notifications via sonner

### Fixed
- Server modules use dynamic imports to prevent node:crypto leaking into client bundle
- Explicit CLI environment construction prevents server secret leakage to subprocesses
- Sandbox directories cleaned up on deployment failure and timeout
- Graceful decrypt error handling prevents 500 errors from corrupted keys
- Polling cleanup guards prevent state updates on unmounted components
- Error states shown in dashboard and settings instead of silent failures

## [0.1.0.0] - 2026-03-17

### Added
- Initial project setup with TanStack Start, Supabase Auth, and Google OAuth
- Authenticated layout with sidebar navigation
