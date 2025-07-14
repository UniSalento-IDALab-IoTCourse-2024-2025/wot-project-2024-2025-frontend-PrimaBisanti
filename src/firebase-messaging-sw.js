// src/firebase-messaging-sw.js

// Importa gli script dell'SDK di Firebase per il Service Worker
// Sostituisci "10.X.X" con la versione di Firebase che stai usando nel tuo package.json (es. 10.12.2)
importScripts('https://www.gstatic.com/firebasejs/11.9.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.9.1/firebase-messaging-compat.js');

// Configurazione dell'app Firebase (usa la tua configurazione del progetto)
const firebaseConfig = {
    apiKey: "AIzaSyDko-faaC1i08nHNa9fldzonc69yE8HzF0",
    authDomain: "iot-scuoabus.firebaseapp.com",
    projectId: "iot-scuoabus",
    storageBucket: "iot-scuoabus.firebasestorage.app",
    messagingSenderId: "959146280907",
    appId: "1:959146280907:web:a87cee7b3ce85e33e7d84e"
};

// Inizializza l'app Firebase
firebase.initializeApp(firebaseConfig);

// Inizializza Firebase Messaging nel Service Worker
const messaging = firebase.messaging();

// Gestione dei messaggi in background (quando l'app non è in primo piano)
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Messaggio di background ricevuto:', payload);

  // Puoi personalizzare la notifica qui usando i dati del payload
  const notificationTitle = payload.notification?.title || 'Nuovo aggiornamento';
  const notificationOptions = {
    body: payload.notification?.body || 'Controlla la tua app per i dettagli.',
    icon: '/assets/campanellina_si.png', // <--- Assicurati che questo percorso e file esistano!
    // Altri campi opzionali per la notifica:
    // image: 'URL_immagine',
    // actions: [{ action: 'apri_app', title: 'Apri App' }],
    data: payload.data // Passa dati custom per gestirli al click
  };

  // Mostra la notifica
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Opzionale: Gestione del clic sulla notifica
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notifica cliccata', event);
  event.notification.close(); // Chiudi la notifica al clic

  const clickedNotificationData = event.notification.data; // Recupera i dati passati con la notifica

  console.log('[SW] Dati della notifica cliccata:', clickedNotificationData); // Log dei dati
  console.log('[SW] childId dai dati:', clickedNotificationData?.childId);

  // URL a cui reindirizzare l'utente quando clicca sulla notifica
  let targetUrl = '/dashboard/dash-genitore'; // URL di default

  if (clickedNotificationData && clickedNotificationData.childId) {
    targetUrl = `/dettagli-bimbo/${clickedNotificationData.childId}`;
    console.log('[SW] Costruito URL per dettagli bambino:', targetUrl);
  } else {
    console.log('[SW] childId non trovato nei dati della notifica. Reindirizzo a:', targetUrl);
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        // Se la tua app è già aperta e sulla stessa origine, la metti a fuoco e navighi
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus().then(() => client.navigate(targetUrl));
        }
      }
      // Altrimenti, apri una nuova finestra
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return null;
    })
  );
});