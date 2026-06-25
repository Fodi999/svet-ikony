const fallbackPublicApiUrl = 'https://ministerial-yetta-fodi999-c58d8823.koyeb.app';

export const publicApiUrl = (process.env.NEXT_PUBLIC_API_URL || fallbackPublicApiUrl).replace(/\/+$/, '');
export const publicApiPrefix = publicApiUrl.endsWith('/public') ? '' : '/public';
