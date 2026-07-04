self.addEventListener('push', function(event) {
  try {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'WETT Notification';
    const options = {
      body: data.body || '',
      icon: data.icon || '/public/New_Wett_Logo_Pink-removebg-preview%20(1).png',
      data: { url: data.url || '/' }
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    console.error('Push event error', e);
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(clients.matchAll({ type: 'window' }).then( windowClients => {
    for (let i = 0; i < windowClients.length; i++) {
      const client = windowClients[i];
      if (client.url === url && 'focus' in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
