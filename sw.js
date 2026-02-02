import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

cleanupOutdatedCaches();

// This replaces the manual URLS_TO_CACHE list with the build artifacts
precacheAndRoute(self.__WB_MANIFEST);

self.skipWaiting();
clientsClaim();

// Retain the network-only logic for Google Apps Script calls
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('script.google.com')) {
    // Let browser handle normally (Network Only)
    return;
  }
});
