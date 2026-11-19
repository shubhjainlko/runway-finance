import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Runway — Personal Finance',
    short_name: 'Runway',
    description: 'Your local cash-flow workspace',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f7f5',
    theme_color: '#115b48',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
