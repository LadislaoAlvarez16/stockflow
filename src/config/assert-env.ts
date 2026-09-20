export function assertRequiredEnv() {
  const isProduction = process.env.NODE_ENV?.trim().toLowerCase() === 'production';
  const jwtSecret = process.env.JWT_SECRET;
  if (isProduction) {
    if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.toLowerCase().startsWith('change-this') || jwtSecret.toLowerCase().startsWith('reemplazar')) {
      throw new Error('FATAL ERROR: JWT_SECRET must be securely defined in production.');
    }

    const missing: string[] = [];
    if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
    if (!process.env.REDIS_URL) missing.push('REDIS_URL');
    if (!process.env.FRONTEND_URL) missing.push('FRONTEND_URL');

    if (missing.length > 0) {
      throw new Error(`FATAL ERROR: Missing required environment variables in production: ${missing.join(', ')}`);
    }
  }
}
