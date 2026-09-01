# Contributing to Jules Supervisor

We welcome contributions! Please follow these guidelines.

## How to Contribute

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/your-feature`).
3. Commit your changes (`git commit -m 'Add some feature'`).
4. Push to the branch (`git push origin feature/your-feature`).
5. Open a Pull Request.

## Development Workflow

- Run `pnpm install` to install dependencies.
- Use `pnpm run dev` to start the development server.
- Run `pnpm run test` to execute unit tests.
- Run `pnpm run test:integration` for integration tests.
- Run `pnpm run test:e2e` for end-to-end browser tests.
- Run `pnpm run test:load` for load testing (requires k6 installed).

## Code Style

- We use ESLint and Prettier. Run `pnpm run format` and `pnpm run lint` before committing.
- TypeScript strictly typed. Run `pnpm run typecheck` to verify.

## Adding New Features

1. Discuss the feature via an issue before implementing.
2. Keep changes focused and well-tested.
3. Update documentation accordingly.

## Commit Messages

Follow conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, etc.

## Testing

- All new features must include unit tests.
- Integration tests are required for changes that interact with external services (Jules API, database, Redis).
- E2E tests are appreciated for UI changes.

## Documentation

- Update `README.md` if necessary.
- Add or update relevant docs in the `docs/` folder.

Thank you for contributing!