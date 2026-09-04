# Contributing to DiffuseCut

Thank you for contributing to DiffuseCut!

## Development setup

1. Node.js 20+
2. Clone the repo and run `npm install`
3. Run `npm run doctor` to verify your environment
4. Run `npm run dev` — app at http://localhost:3004

## Code style

- TypeScript strict mode
- Run `npm run typecheck` and `npm run lint` before opening a PR
- Match existing patterns in `src/lib/services/` and API routes

## Pull requests

- Keep PRs focused on one feature or fix
- Describe testing performed
- Do not commit secrets or `.env` files

## Reporting issues

Include output from `npm run doctor` and your OS/Node version.
