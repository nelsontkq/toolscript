# Repository Guidelines

## Project Structure & Module Organization
The root `main.ts` offers a minimal entrypoint and example usage of the DSL. Core compiler and runtime pieces live in `toolscript/`, where `tokenizer.ts`, `parser.ts`, and `interpreter.ts` collaborate, supported by shared helpers and the `grammar.lark` definition. Companion tests reside alongside their modules (`*_test.ts`), keeping behavior and validation close together. Use these existing patterns when adding new stages or utilities.

## Build, Test, and Development Commands
- `deno task dev` runs `main.ts` in watch mode; use it for quick manual checks while iterating on the DSL.
- `deno run main.ts` executes the compiled script once, which is useful for smoke-testing CLI changes.
- `deno test` discovers and runs all test files in the repo; append `--watch` while refactoring core parsing logic.

## Coding Style & Naming Conventions
This project uses Deno TypeScript with 2-space indentation and the default `deno fmt` formatting; run it before committing. Favor explicit `export` lists at the bottom of modules to keep the public surface clear. Name functions and variables in `camelCase`, types and classes in `PascalCase`, and constants in `UPPER_SNAKE_CASE`. Keep modules focused: tokenizer concerns stay in `tokenizer.ts`, parser rules in `parser.ts`, etc., so future contributors can reason about the pipeline.

## Testing Guidelines
Lean on the built-in Deno test runner; create new suites next to the implementation with filenames like `feature_test.ts`. Cover new parsing rules with round-trip tests that assert token streams, AST nodes, and interpreter outputs to guard against regressions. When altering `grammar.lark`, add tests that exercise both the parser and interpreter to ensure the DSL semantics remain synchronized. Aim to keep tests deterministic and fast so they can run on every PR.

## Commit & Pull Request Guidelines
Follow the existing history by writing concise, imperative commits such as `Add conditional block parser` or `Fix interpreter scope lookup`. Each commit should contain focused, reversible changes plus any required fixtures. PRs must describe the DSL behavior change, link related issues when available, and include before/after samples or screenshots for user-facing updates. Highlight new commands or tests in the PR body so reviewers can validate the workflow quickly.
