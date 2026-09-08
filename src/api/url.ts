export function publicBasePath(): string {
  const base = import.meta.env.BASE_URL || '/';
  if (base === '/') return '';
  return base.replace(/\/$/, '');
}

export function withPublicBasePath(path: string): string {
  if (!path.startsWith('/')) return path;
  const base = publicBasePath();
  if (!base || path === base || path.startsWith(`${base}/`)) return path;
  return `${base}${path}`;
}

export function apiUrl(path: string): string {
  return withPublicBasePath(path);
}
