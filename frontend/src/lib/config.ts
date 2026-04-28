/** Public environment variables exposed to the browser (NEXT_PUBLIC_ prefix). */

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Loka Espresso';
export const LOGO_URL = process.env.NEXT_PUBLIC_LOGO_URL || '/logo.png';
export const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || 'app.loyaltysystem.uk';
export const ADMIN_DOMAIN = process.env.NEXT_PUBLIC_ADMIN_DOMAIN || 'admin.loyaltysystem.uk';
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
