// Minimal Prisma config without external helpers to avoid import resolution issues.
export default {
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://localhost:5432/jarvis',
    },
  },
};
