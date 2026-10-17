# Fiduciary OS™ Backend API

Node.js/Express + TypeScript API for the Fiduciary OS™ platform.

## Features

- **RESTful API**: Clean, well-documented endpoints
- **Authentication**: JWT access/refresh tokens (Auth0 is planned, not wired)
- **Database**: SQLite via Prisma today; PostgreSQL is the production target
- **Caching**: Redis for sessions and performance
- **Real-time**: WebSocket support for live updates
- **Security**: Helmet, CORS, rate limiting
- **AI Integration**: Claude API for personalized insights

## Tech Stack

- Node.js 20+
- Express.js
- TypeScript
- Prisma ORM
- PostgreSQL
- Redis
- Socket.io
- Winston (logging)

## Getting Started

### Prerequisites

- Node.js 20+
- Redis 7+ (optional; the API runs without it)

### Installation

```bash
npm install
```

### Database Setup

```bash
# Set up database URL in .env
# DATABASE_URL=file:./dev.db

# Run migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate

# Seed database
npx prisma db seed
```

### Development

```bash
npm run dev
```

The API server will start at http://localhost:3001

### Build

```bash
npm run build
npm start
```

### Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Linting & Formatting

```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

## Project Structure

```
src/
├── config/          # Configuration files
│   ├── database.ts  # Prisma client setup
│   └── redis.ts     # Redis client setup
├── controllers/     # Route controllers
├── middleware/      # Express middleware
│   ├── auth.ts      # Authentication middleware
│   ├── errorHandler.ts
│   └── validateRequest.ts
├── routes/          # API routes
│   ├── auth.ts
│   ├── users.ts
│   ├── profile.ts
│   └── ...
├── services/        # Business logic
│   ├── aiService.ts
│   └── websocketService.ts
├── utils/           # Utility functions
│   └── logger.ts
└── types/           # TypeScript types
```

## API Documentation

See [docs/api/README.md](../docs/api/README.md) for detailed API documentation.

## Environment Variables

Create a `.env` file:

```env
# Server
NODE_ENV=development
PORT=3001

# Database
DATABASE_URL=file:./dev.db

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=7d

# Auth0 (planned; not read by the current code)
AUTH0_DOMAIN=your-auth0-domain.auth0.com
AUTH0_AUDIENCE=your-api-identifier

# AI
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## Database Schema

See `prisma/schema.prisma` for the complete database schema.

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.
