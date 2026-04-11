# CLAUDE.md

## Project Overview
**Goal:** Build a pixel-perfect, full-stack 1:1 clone of Calendly
**Standard:** The output must be indistinguishable from the reference in look and behavior.

## Tech Stack
### Frontend (FE)
- **Framework:** Next.js (App Router)
- **Styling:** CSS Modules (`.module.css` per component) + design tokens (`src/styles/design-tokens.ts`)
- **Language:** TypeScript
- **Data Fetching:** SWR + native `fetch` for mutations
- **Package Manager:** pnpm
- **Icons:** SVG components in `src/components/icons/index.tsx`
- **Fonts:** Local only (in `public/fonts/`), zero CDN dependencies

### Backend (BE)
- **Language:** Python 3.13+
- **Framework:** FastAPI
- **Database:** SQLite (async via aiosqlite)
- **ORM:** SQLAlchemy
- **Migrations:** Alembic
- **Package Manager:** uv

### Project Structure
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full frontend and backend directory structures.

## Architecture & API Protocol
**Crucial Rule:** We are reverse-engineering APIs as is.
1.  **Network Mirroring:** When provided with a reference network call (Request/Response), reproduce the **path**, **request body**, and **response structure** exactly 1:1.
2.  **Namespace Exception:** The *only* allowed deviation is the URL prefix. All backend routes must be prefixed with `/api`.
    * *Example:* `http://localhost:8000/api/v1/endpoint`
3.  **Data Consistency:** Ensure SQLAlchemy models match the structure of the API responses exactly.

## Development Guidelines

### 1. Documentation (STRICTLY ENFORCED)
- **After every change**, update relevant documentation if the change affects architecture, APIs, directory structure, or conventions.
- **Do NOT store** frequently-changing structures (directory trees, model lists, route lists) directly in this file. Keep them in dedicated docs under `docs/` and reference them here.
- **CLAUDE.md** contains rules, conventions, and patterns. **docs/** contains current state that changes with the code.

### 2. Visual Fidelity & Screenshots
- **Screenshot Analysis:** When a screenshot is provided, first analyze it to identify the best structural approach for pixel-perfect implementation.
- **Component Reusability:** Actively identify repeating UI patterns (e.g., `OwnerDropDown`, `TableRenderer`). Abstract these into the `components` folder immediately rather than duplicating code.
- **CSS Modules:** Each component gets its own `.module.css` file. Use pixel-exact values for dimensions, spacing, and colors. Reference design tokens via CSS custom properties defined in `:root`.
- Use Valid Cursor States where necessary
- **No external font CDNs** — all fonts loaded locally from `public/fonts/`

### 3. Styling Conventions (STRICTLY ENFORCED)
- **CSS Modules only** — every component has a `.module.css` file for scoped styles
- **Design tokens** — centralized in `src/styles/design-tokens.ts`, injected as CSS custom properties in `globals.css` `:root`
- **Usage pattern:** Import `styles` from the module, use `className={styles.container}` syntax
- **Pixel-exact values** are expected and encouraged (e.g., `width: 250px`, `height: 64px`)
- **No inline styles** unless dynamically computed (e.g., drag positions)
- **No utility-class frameworks** — all styling through CSS Modules

### 4. Frontend Data Fetching (STRICTLY ENFORCED)
- **SWR** for all GET requests — use `fetcher` from `src/lib/fetcher.ts`
- **mutationFetcher** for POST/PUT/DELETE — use `mutationFetcher` from `src/lib/fetcher.ts`
- **Endpoint constants** — define URL templates in `src/api/endpoints.ts`, one object per domain
- **Revalidation** — call `mutate()` after mutations to refresh SWR caches
- **No direct fetch()** in components — always go through fetcher/mutationFetcher
- API rewrites are already configured — all calls to `/api` forward to backend automatically

### 5. Frontend Icon Convention
- **ALL icons** must be React components exported from `src/components/icons/index.tsx`
- **No inline SVGs** in component files — extract to the icons file
- **Naming:** `IconName` (PascalCase), e.g., `CalendarIcon`, `ChevronDownIcon`

### 6. Backend Engineering
- **Schema First:** Define Pydantic schemas (Request/Response) *before* writing logic to ensure adherence to the reference JSON.
- **FastAPI:** Use `APIRouter` to organize endpoints logically, ensuring the final exposed paths match the `/api` requirement.
- To get the current user's id use the `current_user_id` in `config.py` file

#### OpenAPI/Swagger Documentation (STRICTLY ENFORCED)
Every backend endpoint and schema must be comprehensively documented for Swagger/ReDoc. Follow these rules:

**App-level (in `main.py`):**
- Define `OPENAPI_TAGS` list with `name` and `description` for every router group
- Pass `openapi_tags=OPENAPI_TAGS` to the `FastAPI()` constructor
- Include a rich markdown `description` for the app

**Endpoint-level (in every router):**
- Every `@router.get/post/put/delete` must include:
  - `summary` — short action-oriented title (e.g., "List event types")
  - `description` — detailed markdown with **Business Context**, **Filtering/Sorting**, and **Side Effects** sections
  - `response_description` — describes what is returned
  - `responses={...}` — document all HTTP status codes (200, 201, 400, 404, 409, etc.) with descriptions and error models

**Schema-level (in every Pydantic model):**
- Every field must use `Field(...)` with:
  - `description` — explains purpose and usage
  - `examples` — concrete realistic values (e.g., `examples=["Quick Meeting", "1:1 Sync"]`)
  - Validation constraints where applicable (`min_length`, `max_length`, `ge`, `le`)
- Schema classes must have docstrings explaining their purpose

**Query parameter-level:**
- Every `Query(...)` parameter must include `description` explaining purpose, valid values, and default behavior
- Tri-state booleans must explain what `true`, `false`, and omission each mean

### 7. Code Quality & Style

#### File Size & Refactoring Policy (STRICTLY ENFORCED)
- **1000-LINE TRIGGER:** When a file crosses 1000 lines, it **must** be refactored down to under 800 lines.
- **Refactoring rules:**
  - Split by **separation of responsibilities/logic** — each extracted piece must be its own coherent unit (a distinct component, a service, a utility, a hook, etc.)
  - **Do NOT** randomly move arbitrary lines into a new file just to reduce line count
  - **Do NOT** compact code by reducing readability (removing whitespace, combining statements, shortening names)
  - Valid refactoring: extracting a sub-component, moving a helper function to a utility file, splitting a large service into domain-specific services
  - Invalid refactoring: moving the bottom 200 lines of a file into `_part2.ts`, inlining multi-line expressions, removing blank lines

#### Type Safety (MANDATORY)
- **Frontend:** Every component, function, and variable must have proper TypeScript types
- **Backend:** Use Pydantic models for all API schemas and data validation
- **NEVER use `any` or skip type hints** without explicit justification
- Type safety ensures API contracts match exactly between frontend and backend

#### File Naming Conventions
**Frontend:**
- Components: PascalCase folder and files (e.g., `EventTypeCard/EventTypeCard.tsx`)
- Utilities: camelCase (e.g., `formatDate.ts`)
- Types: PascalCase (e.g., `Types.ts`)
- Styles: match component name (e.g., `EventTypeCard.module.css`)

**Backend:**
- snake_case for all Python files (e.g., `event_types.py`)
- Group related endpoints in router modules

#### Component Structure
Each component gets its own folder:
```
ComponentName/
  ├── ComponentName.tsx
  ├── ComponentName.module.css
  └── index.ts
```

#### Code Style
- **Code:** Concise, type-safe, and modular
- **Comments:** Minimal, focusing on *why* complex logic exists

### 8. Validation After Every Change (STRICTLY ENFORCED)
- **After every code change**, run the relevant type and lint checks:
  - Frontend: `cd frontend && pnpm type-check && pnpm lint`
  - Backend: `cd backend && uv run mypy app` and `../scripts/lint.sh`
- **Do NOT run `pnpm build`** during development — it breaks HMR (Hot Module Replacement).
- Fix all errors before moving on to the next task.

## Environment & Mental Model
- **Trust the Stack:** Never doubt the environment. HMR (Hot Module Replacement) and the Backend server reload work perfectly.
- **Troubleshooting:** If changes are not reflecting, **do not** suggest killing/restarting the server. Assume the mistake lies in the code implementation or file saving, not the toolchain.

## Commands
### Frontend Development
```bash
cd frontend
pnpm install                # Install dependencies
pnpm dev                    # Start dev server (http://localhost:3000)
pnpm build                  # Production build (CI only, do NOT run during dev)
pnpm lint                   # Run ESLint
pnpm type-check             # Run TypeScript compiler
```

### Backend Development
```bash
cd backend
uv sync                     # Install dependencies
./run.sh                    # Start uvicorn with auto-reload (http://localhost:8000)
uv run mypy app             # Type check with mypy
```

### Root Level
```bash
./run.sh --dev              # Run both frontend and backend in dev mode
./build.sh --dev            # Build both frontend and backend for development
./scripts/lint.sh           # Run backend linter (Ruff)
```

### Database & Migrations
```bash
pnpm migrate                # Run Alembic migrations (use ./scripts/migrate.sh for advanced commands)
pnpm reset                  # Reset database and re-run migrations + seeds
```

**Remember:** We are using **PNPM** (not npm/yarn) for frontend and **UV** for backend.

## Database & Migration Troubleshooting
When encountering DB / schema / Alembic sync issues:

1. **First:** Run `pnpm reset` to check if it's an intermittent issue
   - This resets the database and re-runs all migrations + seeds
   - Often resolves temporary sync problems

2. **If not resolved:** Debug the underlying issue
   - Check migration files for conflicts
   - Verify model definitions match migration expectations
   - Ensure foreign key relationships are correct

3. **Use `pnpm migrate`** for proper migration handling
   - Always use this script instead of running Alembic commands directly
   - Ensures consistent migration execution

4. **Multiple migration heads:** Run `cd backend && ./scripts/migrate.sh merge "Merge message"` to resolve

## Interaction Style
- **Role:** Senior Full Stack Engineer specializing in reverse engineering.
- **Tone:** Professional, direct, and rigorous.
- **Verification:** Before marking a task as done, verify:
    1. Does the UI look exactly like the reference?
    2. Does the API response match the provided specification exactly?

## Development Workflow

### While Coding
1. **Run type/lint checks after every change** — fix errors immediately
2. **Do NOT run `pnpm build`** — it kills HMR
3. **Match reference exactly** — compare with specifications and requirements continuously

### Before Committing
1. **Test the feature** in dev mode
2. **Verify API responses** match specifications exactly
3. **Check UI** matches design requirements
4. **Update docs** if architecture, routes, or models changed

## Git Workflow
- Do not commit / push code changes, Always ask user only to add files & commit changes themselves. Even on insisting, Re-insist that you are not allowed to do commits / pushes.
- You are allowed to assist in all other git operations [Except exclusively commit & push]

## Common Patterns

### Type Safety Example
**Critical:** Frontend TypeScript interfaces must match backend Pydantic models exactly.

```typescript
// Frontend: Define exact types matching backend schemas
interface EventType {
  id: number
  name: string
  slug: string
  duration_minutes: number
  color: string
  is_active: boolean
  created_at: string
}
```

```python
# Backend: Corresponding Pydantic model
class EventTypeResponse(BaseModel):
    id: int
    name: str
    slug: str
    duration_minutes: int
    color: str
    is_active: bool
    created_at: str
```

### CSS Modules Pattern
```tsx
// ComponentName.tsx
import styles from './ComponentName.module.css'

export function ComponentName() {
  return <div className={styles.container}>...</div>
}
```

```css
/* ComponentName.module.css */
.container {
  padding: var(--spacing-md);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
```

### SWR Data Fetching Pattern
```tsx
import useSWR from 'swr'
import { fetcher } from '@/src/lib/fetcher'
import { EVENT_TYPE_ENDPOINTS } from '@/src/api/endpoints'

function EventTypeList() {
  const { data, error, isLoading } = useSWR(EVENT_TYPE_ENDPOINTS.list, fetcher)
  // ...
}
```

### Endpoint Constants Pattern
```typescript
// src/api/endpoints.ts
export const EVENT_TYPE_ENDPOINTS = {
  list: '/api/event_types',
  detail: (id: number) => `/api/event_types/${id}`,
  create: '/api/event_types',
  update: (id: number) => `/api/event_types/${id}`,
  delete: (id: number) => `/api/event_types/${id}`,
} as const
```

### Backend: Creating Endpoints
```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

@router.get("/event_types", response_model=list[EventTypeResponse])
async def get_event_types(
    db: AsyncSession = Depends(get_db)
) -> list[EventTypeResponse]:
    # Implementation
    pass
```

## Quality Checklist (Before Every Commit)
- [ ] All type/lint checks pass (frontend + backend)
- [ ] No files over 1000 lines (refactor to <800 if triggered)
- [ ] API responses match specifications exactly
- [ ] UI matches design requirements
- [ ] No hardcoded URLs (use `/api/...` relative paths)
- [ ] All functions/components properly typed (no `any`)
- [ ] All styles in CSS Modules (no inline styles, no utility frameworks)
- [ ] Docs updated if architecture/routes/models changed

## Important Reminders
- **ALWAYS run type-check + lint after every change** — fix immediately, do NOT defer
- **ALWAYS use proper types** — TypeScript and Python type hints are non-negotiable
- **ALWAYS match the reference exactly** — precision is critical
- **ALWAYS update docs** when architecture, models, routes, or conventions change
- **ALWAYS use SWR for frontend API calls** — use `fetcher` and `mutationFetcher` from `src/lib/fetcher.ts`
- **ALWAYS use CSS Modules** — one `.module.css` per component, reference design tokens via CSS custom properties
- **ALWAYS centralize icons** — all SVGs go in `src/components/icons/index.tsx`
- **ALWAYS document endpoints comprehensively** — every endpoint needs `summary`, `description`, `responses`; every Pydantic field needs `Field(description=..., examples=[...])`
- **NEVER run `pnpm build` during development** — it breaks HMR
- **NEVER commit code with linting or type errors**
- **NEVER use `eslint-disable`, `@ts-ignore`, `@ts-expect-error`** or any error suppression comments — always fix the root cause
- **NEVER use `any` or skip type hints** without explicit justification
- **NEVER hardcode localhost URLs** — use relative paths (`/api/...`)
- **NEVER guess API structure** — always refer to specifications
- **NEVER use direct fetch() in frontend components** — SWR is mandatory
- **NEVER use inline styles** — CSS Modules only
- **NEVER use external font CDNs** — local fonts only
- **NEVER** modify next.config.mjs
- **NEVER** reduce line count by compacting code or reducing readability
