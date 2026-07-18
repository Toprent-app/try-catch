# Contributing to @power-rent/try-catch

Thank you for your interest in contributing to the try-catch library! This guide will help you understand the development workflow, including how to make changes, manage versions, and create changelogs.

## Table of Contents

- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Changelog Creation Process](#changelog-creation-process)
- [Release Process](#release-process)
- [Version Management](#version-management)
- [Testing](#testing)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)

## Development Setup

### Prerequisites

- Node.js >= 20
- npm (comes with Node.js)
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/Toprent-app/try-catch.git
cd try-catch

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

### Available Scripts

```bash
npm run build          # Build both CommonJS and ESM versions
npm run build:cjs      # Build CommonJS version only
npm run build:esm      # Build ESM version only
npm run test           # Run tests once
npm run test:watch     # Run tests in watch mode
npm run format         # Format code with Prettier
npm run format:check   # Check code formatting
npm run typecheck      # Run TypeScript type checking
npm run clean          # Clean build artifacts
```

## Making Changes

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Your Changes

- Write your code following the existing patterns
- Add tests for new functionality
- Update documentation if needed
- Ensure all tests pass: `npm test`

### 3. Create a Changeset

This project uses [Changesets](https://github.com/changesets/changesets) for version management and changelog generation.

#### What is a Changeset?

A changeset is a file that describes what changes you've made and what type of version bump they require. This information is used to:
- Automatically generate changelogs
- Determine version bumps (major, minor, patch)
- Create release pull requests

#### Creating a Changeset

1. **Run the changeset command:**
   ```bash
   npx changeset
   ```

2. **Follow the interactive prompts:**
   - Select which packages to include (this project has one package: `@power-rent/try-catch`)
   - Choose the version bump type:
     - **Major**: Breaking changes that require users to update their code
     - **Minor**: New features that are backward compatible
     - **Patch**: Bug fixes that are backward compatible
   - Write a description of your changes

3. **The command will create a file** in the `.changeset/` directory with a random name like `cool-cats-sing.md`

#### Manual Changeset Creation

You can also create changeset files manually:

1. **Create a new file** in the `.changeset/` directory with a descriptive name:
   ```bash
   touch .changeset/your-descriptive-name.md
   ```

2. **Add the changeset content:**
   ```markdown
   ---
   '@power-rent/try-catch': minor
   ---

   Add new breadcrumb extraction feature for better Sentry integration
   ```

#### Changeset File Format

```markdown
---
'@power-rent/try-catch': major|minor|patch
---

Description of your changes. This will appear in the changelog.
```

**Examples:**

```markdown
---
'@power-rent/try-catch': major
---

BREAKING: Remove deprecated error reporter class and update API
```

```markdown
---
'@power-rent/try-catch': minor
---

Add support for custom breadcrumb transformers
```

```markdown
---
'@power-rent/try-catch': patch
---

Fix memory leak in error reporting
```

### 4. Commit Your Changes

```bash
git add .
git commit -m "feat: add new breadcrumb extraction feature

- Add support for custom transformers
- Improve TypeScript types
- Add comprehensive tests"
```

**Commit Message Format:**
- Use conventional commits format: `type(scope): description`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- Include the changeset file in your commit

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a pull request on GitHub.

## Changelog Creation Process

The changelog is automatically generated using Changesets. Here's how it works:

### Automatic Process

1. **Changeset Creation**: When you create a changeset file, it describes your changes
2. **Release PR Generation**: GitHub Actions automatically creates a "Version Packages" PR when changesets exist
3. **Changelog Generation**: When the release PR is merged, the changelog is automatically updated
4. **Package Publishing**: The package is automatically published to npm

### Manual Changelog Preview

You can preview what the changelog will look like:

```bash
# See what changesets exist
npx changeset status

# Preview the release plan
npx changeset version --dry-run
```

### Changelog Structure

The generated `CHANGELOG.md` follows this format:

```markdown
# @power-rent/try-catch

## 1.1.0

### Minor Changes

- a1b2c3d: Add support for custom breadcrumb transformers

## 1.0.0

### Major Changes

- e4f5g6h: BREAKING: Remove deprecated error reporter class

### Minor Changes

- i7j8k9l: Improved developer experience and documentation
```

## Release Process

### Automated Release via GitHub Actions

The project uses GitHub Actions for automated releases:

1. **Trigger**: Push to `main` branch
2. **Workflow**: `.github/workflows/release.yml`
3. **Action**: `changesets/action@v1`

#### What Happens:

1. **Build**: Installs dependencies and builds the project
2. **Check for Changesets**: Looks for changeset files
3. **Create Release PR**: If changesets exist, creates a "Version Packages" PR
4. **Publish**: If release PR is merged, publishes to npm and updates changelog

#### Release PR Process:

1. GitHub Actions creates a PR titled "Version Packages"
2. The PR includes:
   - Updated `package.json` version
   - Updated `CHANGELOG.md`
   - Removed changeset files
3. Review and merge the PR
4. The package is automatically published to npm

### Manual Release (if needed)

```bash
# Create release PR manually
npx changeset version

# Publish (requires npm login)
npx changeset publish
```

## Version Management

### Semantic Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0 → 2.0.0): Breaking changes
- **MINOR** (1.0.0 → 1.1.0): New features, backward compatible
- **PATCH** (1.0.0 → 1.0.1): Bug fixes, backward compatible

### Version Bump Guidelines

**Major (Breaking Changes):**
- Removing public APIs
- Changing function signatures
- Changing behavior in a way that breaks existing code
- Removing deprecated features

**Minor (New Features):**
- Adding new methods or properties
- Adding new functionality
- Improving existing features without breaking changes

**Patch (Bug Fixes):**
- Fixing bugs
- Improving performance
- Updating documentation
- Internal refactoring

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test -- --coverage
```

### Writing Tests

- Tests are located in `src/__tests__/`
- Use Vitest as the testing framework
- Follow the existing test patterns
- Test both success and error cases
- Include edge cases and type safety tests

### Test Structure

```typescript
import { describe, it, expect } from 'vitest';
import { Try } from '../Try';

describe('Try class', () => {
  it('should handle successful operations', async () => {
    const result = await new Try(() => 'success').value();
    expect(result).toBe('success');
  });

  it('should handle errors gracefully', async () => {
    const error = await new Try(() => {
      throw new Error('test error');
    }).error();

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe('test error');
  });
});
```

## Code Style

### Formatting

This project uses Prettier for code formatting:

```bash
# Format all files
npm run format

# Check formatting
npm run format:check
```

### TypeScript

- Use strict TypeScript settings
- Provide proper type annotations
- Use generic types where appropriate
- Follow the existing type patterns

### Code Organization

- Keep functions small and focused
- Use descriptive names
- Add JSDoc comments for public APIs
- Follow the existing file structure

## Pull Request Process

### Before Submitting

1. **Ensure tests pass**: `npm test`
2. **Check formatting**: `npm run format:check`
3. **Type check**: `npm run typecheck`
4. **Build successfully**: `npm run build`
5. **Include changeset**: Make sure you've created a changeset file

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Changeset
- [ ] I have created a changeset for this PR

## Testing
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] All tests pass locally

## Checklist
- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
```

### Review Process

1. **Automated Checks**: CI will run tests, type checking, and formatting
2. **Code Review**: Maintainers will review your code
3. **Changeset Review**: Ensure the changeset accurately describes your changes
4. **Merge**: Once approved, the PR will be merged
5. **Release**: GitHub Actions will create a release PR if changesets exist

## Getting Help

- **Issues**: Create an issue for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions
- **Documentation**: Check the README and examples for usage patterns

## Development Tips

### Local Development

```bash
# Watch mode for development
npm run test:watch

# Build in watch mode (if using a build tool that supports it)
npm run build -- --watch
```

### Debugging

```bash
# Enable debug logging in your code
const result = await new Try(riskyFunction, params)
  .debug(true)  // Enable debug logging
  .report('Function failed')
  .value();
```

### Performance Testing

```bash
# Run performance tests
npm test -- --reporter=verbose
```

## Release History

The project uses automated releases. Check the [CHANGELOG.md](./CHANGELOG.md) for a complete history of changes.

---

Thank you for contributing to @power-rent/try-catch! 🚀
