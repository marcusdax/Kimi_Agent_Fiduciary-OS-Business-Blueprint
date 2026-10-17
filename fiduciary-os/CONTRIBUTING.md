# Contributing to Fiduciary OS™

Thank you for your interest in contributing to Fiduciary OS™! This document provides guidelines and instructions for contributing.

## Code of Conduct

This project adheres to a code of conduct. By participating, you are expected to uphold this code:

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Respect different viewpoints and experiences

## How to Contribute

### Reporting Bugs

Before creating a bug report, please:

1. Check if the issue already exists
2. Use the latest version to verify the bug
3. Collect information about the bug (steps to reproduce, expected vs actual behavior)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

1. Use a clear and descriptive title
2. Provide a step-by-step description of the suggested enhancement
3. Explain why this enhancement would be useful

### Pull Requests

1. Fork the repository
2. Create a new branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and ensure they pass
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Development Setup

See [docs/development/setup.md](docs/development/setup.md) for detailed setup instructions.

Quick start:

```bash
# Clone the repo
git clone https://github.com/your-org/fiduciary-os.git
cd fiduciary-os

# Install dependencies
make install

# Start development environment
make dev
```

## Code Style

### Frontend (TypeScript/React)

- Use functional components with hooks
- Follow the existing component structure
- Use TypeScript strict mode
- Run `npm run lint` before committing
- Run `npm run format` to auto-format

### Backend (TypeScript/Node.js)

- Use async/await for asynchronous operations
- Follow RESTful API conventions
- Use proper error handling with AppError
- Run `npm run lint` before committing
- Run `npm run format` to auto-format

### Commit Messages

Use conventional commits format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Build process or auxiliary tool changes

Examples:
```
feat(navigators): add crypto portfolio tracking
fix(auth): resolve token refresh issue
docs(api): update authentication documentation
```

## Testing

### Frontend Tests

```bash
cd frontend
npm test
npm run test:coverage
```

### Backend Tests

```bash
cd backend
npm test
npm run test:coverage
```

### E2E Tests

```bash
cd frontend
npm run test:e2e
```

## Documentation

- Update README.md if you change functionality
- Update API documentation for new endpoints
- Add JSDoc comments for complex functions
- Update architecture docs for structural changes

## Review Process

1. All PRs require at least one review
2. CI checks must pass
3. Code coverage should not decrease
4. Documentation should be updated if needed

## Questions?

If you have questions, feel free to:
- Open a GitHub issue
- Join our Discord community
- Email: support@fiduciaryos.com

Thank you for contributing to Fiduciary OS™!
