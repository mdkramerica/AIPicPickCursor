# Refactoring Plan: AIPicPick

## 1. Cleanup & Dependency Management
**Goal**: Remove dead code and unused dependencies to reduce bundle size and confusion.

- [ ] **Remove Replit Auth & Passport**:
    - Delete `server/replitAuth.ts`.
    - Remove `passport`, `passport-local`, `openid-client`, `express-session`, `connect-pg-simple`, `memorystore` from `package.json`.
    - Remove `sessions` table from `shared/schema.ts` (if confirmed unused by Kinde).
- [ ] **Standardize Imports**:
    - Ensure all imports are consistent (ESM vs CommonJS).

## 2. Backend Architecture Refactoring
**Goal**: Decompose monolithic files into modular, maintainable components.

- [ ] **Split `server/routes.ts`**:
    - Create `server/routes/` directory.
    - Extract `auth.ts` (Auth routes).
    - Extract `sessions.ts` (Session management).
    - Extract `photos.ts` (Photo upload & management).
    - Extract `groups.ts` (Grouping logic).
    - Extract `webhooks.ts` (ConvertKit webhooks).
    - Create `server/routes/index.ts` to register all sub-routers.
- [ ] **Split `server/storage.ts`**:
    - Create `server/repositories/` directory.
    - Create `UserRepository.ts`.
    - Create `PhotoRepository.ts` (Session, Photo, Face operations).
    - Create `GroupRepository.ts` (Groups, Memberships).
    - Create `IntegrationRepository.ts` (ConvertKit, Campaigns).
    - Update `server/storage.ts` to aggregate these repositories or replace usage with direct repository injection.

## 3. Type Safety & Error Handling
**Goal**: Improve code reliability and developer experience.

- [ ] **Fix `req: any`**:
    - Define proper Request types extending `Express.Request` with `userId`.
    - Use Zod schemas to type-check request bodies in handlers.
- [ ] **Standardize Error Handling**:
    - Create a `catchAsync` wrapper (or use `express-async-handler` consistently) to remove repetitive `try/catch` blocks in routes.
    - Ensure all errors flow through the central `errorHandler`.

## 4. Frontend Consistency
**Goal**: Ensure consistent API usage.

- [ ] **Standardize API Calls**:
    - Audit `hooks/` to ensure all API calls use `apiRequest` from `lib/queryClient.ts` or a consistent `fetch` wrapper that handles auth headers automatically.
    - Refactor `useBulkSession.ts` to remove manual `fetch` calls where possible.

## 5. Database Optimization
- [ ] **Review Indexes**: Check `shared/schema.ts` for missing indexes on frequently queried columns (e.g., `sessionId`, `userId`).
- [ ] **Cleanup Schema**: Remove the `sessions` table if it's confirmed to be a leftover from `express-session`.

## Execution Strategy
1.  **Phase 1 (Cleanup)**: Delete dead code. Quick win.
2.  **Phase 2 (Routes)**: Split `routes.ts` one domain at a time. Test after each split.
3.  **Phase 3 (Storage)**: Split `storage.ts`.
4.  **Phase 4 (Typing)**: Iterative improvement of types.

