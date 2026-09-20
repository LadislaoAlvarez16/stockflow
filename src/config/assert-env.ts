export function assertRequiredEnv() {
  const isProduction = process.env.NODE_ENV?.trim().toLowerCase() === 'production';
  const jwtSecret = process.env.JWT_SECRET;
  if (isProduction) {
    if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.toLowerCase().startsWith('change-this') || jwtSecret.toLowerCase().startsWith('reemplazar')) {
      throw new Error('FATAL ERROR: JWT_SECRET must be securely defined in production.');
    }
  }
}
