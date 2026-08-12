# Copilot Instructions for Plant Dashboard

These instructions are for agents and contributors maintaining this project.

## Project Scope

- Stack: Node.js (ESM), Express, SQLite, React + Vite.
- Main backend entrypoint: server/index.js.
- Domain logic and data validation: server/plants.js.
- DB schema and migrations-on-startup: server/db.js.
- Frontend API contract: src/services/api.ts.

## Critical Domain Rules

- Moisture is calculated from calibration bounds, not a single threshold.
- Each plant stores:
  - lowerRawReading (maps to 0% moisture)
  - upperRawReading (maps to 100% moisture)
- Inverted sensors are supported naturally when lowerRawReading > upperRawReading.
- lowerRawReading and upperRawReading must never be equal.
- Raw values are clamped to [0, 4095] and rounded to integers.

## Security-First Standards

Follow these standards when writing or changing server code:

1. OWASP Top 10 (2021, current stable): prevent injection, broken access control, and insecure design.
2. OWASP ASVS 4.0.3 controls where applicable (input validation, auth/session, crypto, logging).
3. CWE guidance for common Node/Express issues:
   - CWE-20 Improper Input Validation
   - CWE-287 Improper Authentication
   - CWE-522 Insufficiently Protected Credentials
   - CWE-400 Uncontrolled Resource Consumption
4. Node.js Security best practices:
   - Keep dependencies updated and pinned by lockfile.
   - Never log secrets or tokens.
   - Prefer constant-time comparison for token/hash checks.

## Backend Coding Requirements

- Validate all external input at the edge and again in domain logic.
- Reject invalid states explicitly with clear errors.
- Keep authorization checks in route handlers before write operations.
- Preserve backward compatibility for existing clients when practical.
- Prefer small pure helper functions for parsing/sanitizing/calculations.
- Keep side effects isolated (DB writes, network mirror calls).
- Use UTC ISO timestamps for stored/returned times.
- Avoid hidden magic values; keep calibration defaults in named constants.

## API and Data Contract Rules

- Do not silently change existing response shapes without migration notes.
- Additive changes are preferred over breaking changes.
- If introducing new fields, update:
  - server serializers
  - frontend types
  - API mappers
  - tests
- If DB schema changes, include startup-safe migration logic in server/db.js.

## Testing Standards

- Every behavior change must include or update tests.
- Minimum for backend changes:
  - Happy path test
  - Invalid input test
  - Authorization/security regression test
- For calibration logic, include tests for:
  - normal range (lower < upper)
  - inverted range (lower > upper)
  - equal bounds rejection
- Run all tests before finishing:
  - npm run test:server
  - npm run test:client

## Maintainability Standards

- Favor clear names over abbreviated names.
- Keep functions short and single-purpose.
- Avoid duplicate logic across server/index.js and server/plants.js.
- Document non-obvious decisions with concise comments.
- Do not perform broad refactors unless requested.
- Keep backwards compatibility behavior intentional and tested.

## Operational Guardrails

- Do not add plaintext secrets to source control.
- Keep production-safe defaults (rate limits, helmet, JSON body size limits).
- New admin features must require admin session verification.
- Token-protected plant writes must continue to use constant-time hash validation.

## Change Checklist (Required)

Before completing a task:

- Confirm security implications of the change.
- Update tests and ensure they pass.
- Verify frontend and backend types/contracts match.
- Verify migrations are idempotent and safe for existing data.
- Ensure no sensitive information is returned in API errors or logs.
