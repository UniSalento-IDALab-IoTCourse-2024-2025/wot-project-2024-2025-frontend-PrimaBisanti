// src/app/services/firebase.service.ts

import { Injectable, OnDestroy } from '@angular/core'; // Aggiungi OnDestroy
import { Auth, browserLocalPersistence, User as FirebaseUser, onAuthStateChanged, setPersistence,
         createUserWithEmailAndPassword, updateProfile,
         signInWithEmailAndPassword, sendPasswordResetEmail,
         GoogleAuthProvider, signInWithPopup, sendEmailVerification,
         deleteUser
       } from 'firebase/auth'; 

import {
  Firestore,
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  getDocs,
  updateDoc,
  arrayUnion,
  writeBatch,
  onSnapshot,
  Timestamp,
  arrayRemove,
  orderBy,
  deleteDoc
} from 'firebase/firestore'; 

import { Firebase } from '../core/firebase'; 
import { Router } from '@angular/router';
import { Observable, BehaviorSubject } from 'rxjs';
import { take } from 'rxjs/operators';

import { Messaging, getMessaging, getToken, onMessage, deleteToken } from 'firebase/messaging'; 
import { environment } from '../../environment/environment';
import { HttpClient } from '@angular/common/http';

import { getFunctions, httpsCallable, HttpsCallableResult } from '@firebase/functions'; // Assicurati di avere @firebase/functions installato

export interface Utente { 
  uid: string;
  email: string | null;
  ruolo: 'Autista' | 'Genitore' | 'Amministratore' | null; // Cambiato per permettere null se non ancora assegnato
  nome?: string; 
  cognome?: string; 
  refFigli?: string[];
  fcmTokens?: string[];
}

export interface Figlio {
  id?: string; 
  genitoreId: string; 
  nome: string;
  cognome: string;
  dataNascita: Date; 
  beaconId: string | null;
  fermataAssociataId?: string;
  statoPresenza: 'A bordo' | 'Sceso' | 'Sconosciuto';
  ultimaAttivita?: Date;
  hasNewNotifications?: boolean;
}

export interface Beacon {
  id?: string; 
  codiceIdentificativo: string; 
  password?: string;
  indirizzoMac: string;
  isAssegnato: boolean; 
  assignedChildId: string | null;
  assignedParentId: string | null;
  nomeBeacon?: string;
}

export interface NotificaFiglio {
  id?: string;
  timestamp: Date;
  tipo: string; 
  messaggio: string; 
  statoPrecedente?: string;
  nuovoStato?: string;
  letto?: boolean; 
  fermataId?: string;
  nomeFermata?: string;
  indrizzoFermata?: string;
}

export interface Fermata {
  id?: string;
  nome: string;
  indirizzo: string;
}

export interface ChatMessage {
  sender: 'Genitore' | 'Chatbot';
  text: string;
  timestamp: Date;
  id?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FirebaseService implements OnDestroy {
  private auth: Auth;
  private firestore: Firestore;
  public firebaseInitializer: Firebase;
  private userDataSubject = new BehaviorSubject<Utente | null>(null);
  private currentUserSubject = new BehaviorSubject<FirebaseUser | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  private authAndUserDataResolvedSubject = new BehaviorSubject<boolean>(false);
  public authAndUserDataResolved$ = this.authAndUserDataResolvedSubject.asObservable();

  private messaging: Messaging | undefined;
  private userDataUnsubscribe: (() => void) | undefined;
  private functions: any;

  constructor(
    firebaseInitializer: Firebase, 
    private router: Router,
    private http: HttpClient
  ) {
    this.firebaseInitializer = firebaseInitializer;
    this.auth = firebaseInitializer.auth;
    this.firestore = firebaseInitializer.firestore;
    
    this.messaging = getMessaging(firebaseInitializer.app);
    this.setupFcmMessageListener();

    if (firebaseInitializer.app) {
      try {
        // Tenta di inizializzare Messaging
        this.messaging = getMessaging(firebaseInitializer.app);
        this.setupFcmMessageListener();
        console.log('Firebase Messaging inizializzato con successo.');
      } catch (e: any) {
        // Cattura l'errore se il browser non supporta Messaging
        if (e.code === 'messaging/unsupported-browser') {
          console.warn('Firebase Messaging: Questo browser non supporta le API necessarie per le notifiche push.', e.message);
          this.messaging = undefined; // Assicurati che sia undefined se non supportato
        } else {
          console.error('Errore sconosciuto durante l\'inizializzazione di Firebase Messaging:', e);
          this.messaging = undefined;
        }
      }
      this.functions = getFunctions(firebaseInitializer.app);
    } else {
      console.warn('Firebase app non è stato inizializzato. Messaging e Functions non disponibili.');
    }

    setPersistence(this.auth, browserLocalPersistence)
      .then(() => {
        console.log("Firebase Auth Persistence set to LOCAL.");
        onAuthStateChanged(this.auth, user => {
          this.currentUserSubject.next(user);

          // Se c'è un utente autenticato, iniziamo a monitorare i suoi dati di ruolo
          if (user) {
            console.log('FirebaseService: Utente autenticato (onAuthStateChanged):', user.uid);
            // Se c'è già una sottoscrizione precedente, la annulliamo
            if (this.userDataUnsubscribe) {
              this.userDataUnsubscribe(); 
            }

            const userDocRef = doc(this.firestore, 'ruoliUser', user.uid);
            // *** CAMBIAMENTO CHIAVE: USA onSnapshot INVECE DI getDoc ***
            this.userDataUnsubscribe = onSnapshot(userDocRef, snapshot => { 
              if (snapshot.exists()) {
                const data = snapshot.data();
                const refFigli = Array.isArray(data['refFigli']) ? data['refFigli'] : [];
                const fcmTokens = Array.isArray(data['fcmTokens']) ? data['fcmTokens'] : [];
                const userData: Utente = {
                  uid: snapshot.id,
                  email: user.email, 
                  ruolo: data['ruolo'] || null,
                  nome: data['nome'] || null,
                  cognome: data['cognome'] || null,
                  refFigli: refFigli,
                  fcmTokens: fcmTokens
                };
                this.userDataSubject.next(userData);
                console.log('FirebaseService: Dati utente (ruolo) aggiornati da Firestore.');

                if (userData.ruolo === 'Genitore') {
                  console.log(`[${user.uid}] Ruolo Genitore rilevato dal listener dati utente. Tentando di ottenere/salvare FCM Token.`);
                  this.requestNotificationPermissionAndSaveToken();
                } else {
                  console.log(`[${user.uid}] Ruolo ${userData.ruolo} rilevato. Nessun FCM Token richiesto/salvato.`);
                }

              } else {
                console.warn("FirebaseService: Dati utente non trovati in Firestore per UID:", user.uid);
                this.userDataSubject.next(null); // Segnala che i dati del ruolo non ci sono
              }
              this.authAndUserDataResolvedSubject.next(true); 
            }, error => {
              console.error("FirebaseService: Errore nel listening dei dati utente:", error);
              this.userDataSubject.next(null);
              this.authAndUserDataResolvedSubject.next(true);
            });

          } else {
            // Nessun utente autenticato
            console.log('FirebaseService: Nessun utente autenticato (onAuthStateChanged).');
            if (this.userDataUnsubscribe) {
              this.userDataUnsubscribe(); // Annulla qualsiasi listener precedente
              this.userDataUnsubscribe = undefined;
            }
            this.userDataSubject.next(null);
            this.authAndUserDataResolvedSubject.next(true);
          }
        });
      })
      .catch((error) => {
        console.error("Error setting Firebase Auth persistence:", error);
        this.authAndUserDataResolvedSubject.next(true); // Segnala comunque risolto
      });

    // Rimuovi o commenta questo blocco duplicato che usa Observable/switchMap/getDoc
    // La logica di onAuthStateChanged sopra lo sostituisce in modo più efficiente.
    /*
    new Observable<FirebaseUser | null>(subscriber => {
      const unsubscribe = this.auth.onAuthStateChanged(user => {
        subscriber.next(user);
      });
      return () => unsubscribe();
    }).pipe(
      switchMap(user => {
        if (user) {
          const userDocRef = doc(this.firestore, 'ruoliUser', user.uid);
          return from(getDoc(userDocRef)).pipe(
            map(snapshot => {
              if (snapshot.exists()) {
                const data = snapshot.data();
                const refFigli = Array.isArray(data['refFigli']) ? data['refFigli'] : [];
                const fcmTokens = Array.isArray(data['fcmTokens']) ? data['fcmTokens'] : [];
                const userData: Utente = {
                  uid: snapshot.id,
                  email: user.email, 
                  ruolo: data['ruolo'] || null,
                  nome: data['nome'] || null,
                  cognome: data['cognome'] || null,
                  refFigli: refFigli,
                  fcmTokens: fcmTokens
                };
                return userData;
              } else {
                console.warn("Dati utente non trovati in Firestore per UID:", user.uid);
                return null;
              }
            }),
            catchError(error => {
              console.error("Errore nel recupero dati utente:", error);
              return of(null);
            })
          );
        } else {
          return of(null);
        }
      })
    ).subscribe(user => {
      this.userDataSubject.next(user);
      this.authAndUserDataResolvedSubject.next(true); 
    });
    */
  }

  // Metodo per pulire il listener di onSnapshot quando il servizio viene distrutto
  ngOnDestroy(): void {
    if (this.userDataUnsubscribe) {
        this.userDataUnsubscribe();
    }
  }

  // --- NUOVI METODI PUBBLICI PER AUTENTICAZIONE E DATO UTENTE ---

  async loginUser(email: string, password: string): Promise<any> { // Usare UserCredential qui, ma per semplicità any
    return await signInWithEmailAndPassword(this.auth, email, password);
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    return await sendPasswordResetEmail(this.auth, email);
  }

  async registerGenitore(email: string, password: string, firstName: string, lastName: string): Promise<FirebaseUser | null> {
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      const user = userCredential.user;

      if (user) {
        await updateProfile(user, {
          displayName: `${firstName} ${lastName}`
        });

        // Salva il ruolo 'Genitore' e altri dati in Firestore
        await this.saveUserRoleAndData(user.uid, user.email, firstName, lastName, 'Genitore');
        console.log(`Genitore ${firstName} ${lastName} (${email}) registrato e loggato con successo.`);

        return user;
      }
      return null;
    } catch (error: any) {
      console.error('Errore durante la registrazione del genitore:', error.code, error.message);
      throw error; // Rilancia l'errore per gestirlo nel componente Register
    }
  }

  async registerDriver(email: string, password: string, firstName: string, lastName: string): Promise<string | null> {
    if (!this.functions) {
      console.error('Firebase Functions non inizializzato.');
      throw new Error('Servizio di registrazione autista non disponibile.');
    }

    const registerDriverCallable = httpsCallable<{
      email: string;
      password: string;
      firstName: string;
      lastName: string;
    }, { success: boolean; message: string; uid: string }>(this.functions, 'registerDriver'); // 'registerDriver' è il nome della tua Cloud Function

    try {
      const result = await registerDriverCallable({ email, password, firstName, lastName });
      const data = result.data;

      if (data.success) {
        console.log(`Autista registrato tramite Cloud Function: ${data.uid}`);
        return data.uid; // Restituisce l'UID dell'autista creato
      } else {
        console.error('La Cloud Function ha riportato un errore:', data.message);
        throw new Error(data.message);
      }
    } catch (error: any) {
      console.error('Errore durante la chiamata alla Cloud Function registerDriver:', error);
      // HttpsError ha una proprietà code e message
      if (error.code && error.message) {
        throw new Error(`Errore Cloud Function: ${error.message} (${error.code})`);
      } else {
        throw new Error('Errore sconosciuto durante la registrazione dell\'autista.');
      }
    }
  }

  async sendEmailVerification(user: FirebaseUser): Promise<void> {
    if (user) {
      try {
        await sendEmailVerification(user);
        console.log('Email di verifica inviata con successo all\'utente:', user.email);
      } catch (error) {
        console.error('Errore durante l\'invio dell\'email di verifica:', error);
        throw error; // Rilancia l'errore per gestirlo nel componente
      }
    } else {
      throw new Error('Utente non valido per l\'invio dell\'email di verifica.');
    }
  }

  async saveUserRoleAndData(uid: string, email: string | null, firstName: string, lastName: string, role: 'Genitore' | 'Autista' | 'Amministratore'): Promise<void> {
    const userDocRef = doc(this.firestore, 'ruoliUser', uid);
    const userDataToSave: any = {
      uid: uid,
      ruolo: role,
      email: email,
      nome: firstName,
      cognome: lastName,
      fcmTokens: []
    };
    await setDoc(userDocRef, userDataToSave);
  }
   
  // Restituisce il nome e cognome dell'utente corrente, se disponibili.
  getUserNameAndSurname(): string | null {
    const userData = this.userDataSubject.getValue();
    if (userData && userData.nome && userData.cognome) {
      return `${userData.nome} ${userData.cognome}`;
    } else if (userData && userData.nome) {
      return userData.nome;
    }
    return null;
  }


  // --- Metodi esistenti ---

  getBatch() {
    return writeBatch(this.firestore);
  }

  getFiglioDocRef(childId: string) {
    return doc(this.firestore, 'figli', childId);
  }

  getCurrentUserData(): Observable<Utente | null> { 
    return this.userDataSubject.asObservable();
  }

  private convertFirestoreTimestampToDate(data: any): any { 
    if (data && data['dataNascita'] instanceof Timestamp) {
      data['dataNascita'] = data['dataNascita'].toDate();
    }
    if (data && data['ultimaAttivita'] instanceof Timestamp) {
      data['ultimaAttivita'] = data['ultimaAttivita'].toDate();
    }
    if (data && data['timestamp'] instanceof Timestamp) { 
        data['timestamp'] = data['timestamp'].toDate();
    }
    return data;
  }

  getChildrenOfParent(genitoreId: string): Observable<Figlio[]> {
    const childrenCollectionRef = collection(this.firestore, 'figli'); 
    const q = query(childrenCollectionRef, where('genitoreId', '==', genitoreId));

    return new Observable<Figlio[]>(observer => {
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const children: Figlio[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          children.push({
            id: doc.id,
            genitoreId: data['genitoreId'],
            nome: data['nome'],
            cognome: data['cognome'],
            dataNascita: data['dataNascita'] ? data['dataNascita'].toDate() : new Date(),
            beaconId: data['beaconId'] || null,
            fermataAssociataId: data['fermataAssociataId'] || undefined,
            statoPresenza: data['statoPresenza'] || 'Sconosciuto',
            ultimaAttivita: data['ultimaAttivita'] ? data['ultimaAttivita'].toDate() : undefined,
            hasNewNotifications: data['hasNewNotifications'] || false
          });
        });
        observer.next(children);
      }, (error) => {
        console.error("Errore nel listening dei figli del genitore:", error);
        observer.error(error);
      });
      return () => unsubscribe();
    });
  }

  getFiglioById(childId: string): Observable<Figlio | null> {
    const childDocRef = doc(this.firestore, 'figli', childId);

    return new Observable<Figlio | null>(observer => {
      const unsubscribe = onSnapshot(childDocRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          observer.next({
            id: docSnapshot.id,
            genitoreId: data['genitoreId'],
            nome: data['nome'],
            cognome: data['cognome'],
            dataNascita: data['dataNascita'] ? data['dataNascita'].toDate() : new Date(),
            beaconId: data['beaconId'] || null,
            fermataAssociataId: data['fermataAssociataId'] || undefined,
            statoPresenza: data['statoPresenza'] || 'Sconosciuto',
            ultimaAttivita: data['ultimaAttivita'] ? data['ultimaAttivita'].toDate() : undefined,
            hasNewNotifications: data['hasNewNotifications'] || false
          } as Figlio);
        } else {
          observer.next(null);
        }
      }, (error) => {
        console.error("Errore nel listening del singolo figlio:", error);
        observer.error(error);
      });
      return () => unsubscribe();
    });
  }

  getAllBambini(): Observable<Figlio[]> {
    const figliCollectionRef = collection(this.firestore, 'figli');
    return new Observable<Figlio[]>(subscriber => {
      const unsubscribe = onSnapshot(figliCollectionRef, 
        (snapshot) => {
          const figli = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              genitoreId: data['genitoreId'],
              nome: data['nome'],
              cognome: data['cognome'],
              dataNascita: this.convertFirestoreTimestampToDate(data)['dataNascita'],
              beaconId: data['beaconId'] || null,
              fermataAssociataId: data['fermataAssociataId'] || undefined,
              statoPresenza: data['statoPresenza'] || 'Sconosciuto',
              ultimaAttivita: this.convertFirestoreTimestampToDate(data)['ultimaAttivita'],
              hasNewNotifications: data['hasNewNotifications'] || false
            } as Figlio;
          });
          subscriber.next(figli);
        },
        (error) => {
          console.error("Errore nel recupero in tempo reale di tutti i figli:", error);
          subscriber.error(error);
        }
      );
      return () => unsubscribe();
    });
  }

  getAllFermate(): Observable<Fermata[]> {
    const fermateCollectionRef = collection(this.firestore, 'fermate');
    return new Observable<Fermata[]>(subscriber => {
      const unsubscribe = onSnapshot(fermateCollectionRef, 
        (snapshot) => {
          const fermate = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              nome: data['nome'] ?? '',
              indirizzo: data['indirizzo'] ?? ''
            } as Fermata;
          });
          subscriber.next(fermate);
        },
        (error) => {
          console.error("Errore nel recupero in tempo reale delle fermate:", error);
          subscriber.error(error);
        }
      );
      return () => unsubscribe();
    });
  }

  getAllBeacons(): Observable<Beacon[]> {
    const beaconsCollectionRef = collection(this.firestore, 'beacon');
    // Non usiamo orderBy qui per evitare errori di indice se non strettamente necessario
    // const q = query(beaconsCollectionRef, orderBy('codiceIdentificativo', 'asc')); // Esempio se volessi ordinare

    return new Observable<Beacon[]>(observer => {
      const unsubscribe = onSnapshot(beaconsCollectionRef, (querySnapshot) => { // Ascolta tutti i beacon
        const beacons: Beacon[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          beacons.push({
            id: doc.id,
            codiceIdentificativo: data['codiceIdentificativo'],
            password: data['password'], // Attenzione: non è buona pratica esporre password
            indirizzoMac: data['indirizzoMac'],
            isAssegnato: data['isAssegnato'] || false,
            assignedChildId: data['assignedChildId'] || null,
            assignedParentId: data['assignedParentId'] || null,
            nomeBeacon: data['nomeBeacon'] || ''
          });
        });
        observer.next(beacons);
      }, (error) => {
        console.error("Errore nel listening di tutti i beacon:", error);
        observer.error(error);
      });
      return () => unsubscribe();
    });
  }

  async deleteUserAccountAndRole(uid: string, ruolo: 'Genitore' | 'Autista' | 'Amministratore'): Promise<void> {
    const userDocRef = doc(this.firestore, 'ruoliUser', uid);

    try {
      // 1. Recupera i dati del ruolo utente per la logica di eliminazione dei dati correlati
      const userDocSnap = await getDoc(userDocRef);
      if (!userDocSnap.exists()) {
        console.warn(`Documento ruolo utente ${uid} non trovato. Procedo solo con eliminazione Auth se esiste.`);
        // Non lanciare errore qui, potrebbe essere già stato eliminato il documento Firestore
        // ma l'account Auth è ancora presente.
      }
      const userData = userDocSnap.exists() ? userDocSnap.data() as Utente : null;

      // Inizia un batch per le operazioni Firestore
      const batch = writeBatch(this.firestore);

      // 2. Elimina il documento del ruolo utente da Firestore
      if (userDocSnap.exists()) {
        batch.delete(userDocRef);
        console.log(`Documento ruolo utente ${uid} preparato per l'eliminazione da Firestore.`);
      }

      // 3. Logica per eliminare i dati correlati (figli, notifiche, chat, beacon assegnati)
      if (userData && userData.ruolo === 'Genitore' && userData.refFigli && userData.refFigli.length > 0) {
        for (const figlioId of userData.refFigli) {
          const childRef = doc(this.firestore, 'figli', figlioId);
          batch.delete(childRef);
          console.log(`Figlio ${figlioId} preparato per l'eliminazione.`);

          // Elimina notifiche del figlio
          const notificationsQuery = query(collection(this.firestore, `figli/${figlioId}/notifiche`));
          const notificationsSnapshot = await getDocs(notificationsQuery);
          notificationsSnapshot.docs.forEach(notifDoc => {
            batch.delete(notifDoc.ref);
          });
          console.log(`Notifiche per figlio ${figlioId} preparate per l'eliminazione.`);

          // Elimina messaggi chat del figlio
          const chatMessagesQuery = query(collection(this.firestore, `figli/${figlioId}/chatMessages`));
          const chatMessagesSnapshot = await getDocs(chatMessagesQuery);
          chatMessagesSnapshot.docs.forEach(msgDoc => {
            batch.delete(msgDoc.ref);
          });
          console.log(`Messaggi chat per figlio ${figlioId} preparati per l'eliminazione.`);

          // Disassocia beacon se assegnato a questo figlio
          const childDocAfterBatchSnap = await getDoc(childRef); // Ottieni lo stato attuale del figlio per il beaconId
          if (childDocAfterBatchSnap.exists() && childDocAfterBatchSnap.data()['beaconId']) {
            const beaconRef = doc(this.firestore, 'beacon', childDocAfterBatchSnap.data()['beaconId']);
            batch.update(beaconRef, {
              isAssegnato: false,
              assignedChildId: null,
              assignedParentId: null
            });
            console.log(`Beacon ${childDocAfterBatchSnap.data()['beaconId']} disassociato.`);
          }
        }
      }

      // 4. Esegui le operazioni in batch su Firestore
      await batch.commit();
      console.log(`Operazioni batch su Firestore per eliminazione utente ${uid} completate.`);

      // 5. Chiama la Cloud Function per eliminare l'account da Firebase Authentication
      if (!this.functions) {
        console.error('Firebase Functions non inizializzato. Impossibile eliminare account Auth.');
        throw new Error('Servizio di eliminazione utente non disponibile.');
      }

      const deleteUserCallable = httpsCallable<{ uidToDelete: string }, { success: boolean; message: string }>(this.functions, 'deleteUserAccount');
      const result = await deleteUserCallable({ uidToDelete: uid });

      if (result.data.success) {
        console.log(`Account utente ${uid} eliminato con successo da Firebase Authentication tramite Cloud Function.`);
      } else {
        console.error('La Cloud Function ha riportato un errore durante l\'eliminazione dell\'account Auth:', result.data.message);
        throw new Error(result.data.message);
      }

    } catch (error: any) {
      console.error(`Errore durante l'eliminazione dell'utente ${uid} (Auth o Firestore):`, error);
      throw error; // Rilancia l'errore per gestirlo nel componente chiamante
    }
  }

  async deleteCurrentUserAccount(): Promise<void> {
    const currentUser = this.auth.currentUser;

    if (!currentUser) {
      throw new Error('Nessun utente autenticato per eliminare l\'account.');
    }

    const userId = currentUser.uid;
    const userRoleDocRef = doc(this.firestore, 'ruoliUser', userId);

    try {
      // 1. Recupera il ruolo dell'utente corrente per la logica di eliminazione dei dati
      const userData = await this.getCurrentUserData().pipe(take(1)).toPromise();
      if (!userData || userData.ruolo !== 'Genitore') {
        throw new Error('Solo gli utenti con ruolo "Genitore" possono eliminare il proprio account tramite questa funzione.');
      }

      // Inizia un batch per le operazioni Firestore
      const batch = writeBatch(this.firestore);

      // 2. Elimina i documenti dei figli associati e le loro sottocollezioni
      const figliQuery = query(collection(this.firestore, 'figli'), where('genitoreId', '==', userId));
      const figliSnapshot = await getDocs(figliQuery);

      for (const figlioDoc of figliSnapshot.docs) {
        const figlioId = figlioDoc.id;
        // Elimina i messaggi della chat del figlio
        const chatMessagesQuery = collection(this.firestore, `figli/${figlioId}/chatMessages`);
        const chatMessagesSnapshot = await getDocs(chatMessagesQuery);
        chatMessagesSnapshot.forEach(chatMsgDoc => {
          batch.delete(chatMsgDoc.ref);
        });
        // Elimina le notifiche del figlio
        const notificationsQuery = collection(this.firestore, `figli/${figlioId}/notifiche`);
        const notificationsSnapshot = await getDocs(notificationsQuery);
        notificationsSnapshot.forEach(notifDoc => {
          batch.delete(notifDoc.ref);
        });
        // Aggiungi l'eliminazione del documento figlio al batch
        batch.delete(figlioDoc.ref);
        console.log(`Figlio ${figlioId} e le sue sottocollezioni preparati per l'eliminazione.`);
      }

      // 3. Rimuovi i legami dai beacon (se presenti)
      const beaconsQuery = query(collection(this.firestore, 'beacon'), where('assignedParentId', '==', userId));
      const beaconsSnapshot = await getDocs(beaconsQuery);
      beaconsSnapshot.forEach(beaconDoc => {
        batch.update(beaconDoc.ref, {
          assignedParentId: null,
          assignedChildId: null,
          isAssegnato: false
        });
        console.log(`Beacon ${beaconDoc.id} disassociato dall'utente ${userId}.`);
      });

      // 4. Elimina il documento dell'utente da 'ruoliUser'
      batch.delete(userRoleDocRef);
      console.log(`Documento ruoliUser/${userId} preparato per l'eliminazione.`);

      // Esegui tutte le operazioni Firestore in batch
      await batch.commit();
      console.log(`Operazioni Firestore per eliminazione account ${userId} completate.`);

      // 5. Elimina l'account Firebase Authentication
      // Questo richiede che l'utente sia stato autenticato di recente.
      await deleteUser(currentUser);
      console.log(`Account Firebase Authentication ${userId} eliminato con successo.`);

      // 6. Effettua il logout forzato dopo l'eliminazione dell'account
      await this.auth.signOut();
      this.router.navigate(['/login']);
      console.log('Reindirizzamento alla pagina di login dopo auto-eliminazione account.');

    } catch (error: any) {
      console.error(`Errore durante l'eliminazione dell'account ${userId}:`, error);
      if (error.code === 'auth/requires-recent-login') {
        throw new Error('Per eliminare l\'account, devi effettuare nuovamente il login. Per favore, esegui il logout e poi rientra per procedere con l\'eliminazione.');
      }
      throw error; // Rilancia l'errore per gestirlo nel componente chiamante
    }
  }

  async deleteFermata(fermataId: string): Promise<void> {
    const fermataDocRef = doc(this.firestore, 'fermate', fermataId);
    try {
      const fermataDocSnap = await getDoc(fermataDocRef);

      if (fermataDocSnap.exists()) {
        console.log(`Tentativo di eliminare la fermata ${fermataId}.`);

        let batch = writeBatch(this.firestore);
        let operationsCount = 0;
        const BATCH_LIMIT = 490; // Limite del batch Firestore è 500. Usiamo 490 per sicurezza.

        // 1. Trova tutti i documenti 'figli' che hanno questa fermataAssociataId
        console.log(`Ricerca figli con fermataAssociataId = ${fermataId}...`);
        const figliToUpdateSnapshot = await getDocs(query(
          collection(this.firestore, 'figli'),
          where('fermataAssociataId', '==', fermataId)
        ));

        if (figliToUpdateSnapshot.empty) {
            console.log(`Nessun figlio trovato con fermataAssociataId = ${fermataId}.`);
        } else {
            console.log(`Trovati ${figliToUpdateSnapshot.size} figli da aggiornare.`);
            
            figliToUpdateSnapshot.docs.forEach(async childDoc => {
                // Rimuovi il campo 'fermataAssociataId' dal documento figlio
                // Usiamo FieldValue.delete() per rimuovere il campo interamente,
                // dato che è opzionale (?) nella tua interfaccia Figlio.
                batch.update(childDoc.ref, {
                    fermataAssociataId: ''
                });
                operationsCount++;

                // Se il batch è quasi pieno, commetti e inizia un nuovo batch
                if (operationsCount >= BATCH_LIMIT) {
                    console.log(`Commit di un batch parziale (${operationsCount} operazioni) per i figli.`);
                    await batch.commit();
                    batch = writeBatch(this.firestore); // Inizia un nuovo batch
                    operationsCount = 0;
                }
            });

            // Commit del batch finale delle operazioni sui figli (se ce ne sono)
            if (operationsCount > 0) {
                console.log(`Commit del batch finale (${operationsCount} operazioni) per i figli.`);
                await batch.commit();
            }
        }
        
        // 2. Elimina il documento della fermata principale
        await deleteDoc(fermataDocRef);
        console.log(`Fermata ${fermataId} eliminata con successo e riferimenti nei figli puliti.`);

      } else {
        console.warn(`Fermata ${fermataId} non trovata.`);
        throw new Error('Fermata non trovata.');
      }
    } catch (error: any) {
      console.error(`Errore durante l'eliminazione della fermata ${fermataId} o la pulizia dei riferimenti nei figli:`, error);
      throw error;
    }
  }


  async deleteBeacon(beaconId: string): Promise<void> {
    const beaconDocRef = doc(this.firestore, 'beacon', beaconId);
    try {
      const beaconDocSnap = await getDoc(beaconDocRef);
      if (beaconDocSnap.exists()) {
        const beaconData = beaconDocSnap.data() as Beacon;

        const batch = writeBatch(this.firestore);
        batch.delete(beaconDocRef); // Elimina il beacon

        // Se il beacon era assegnato a un bambino, disassocialo dal bambino
        if (beaconData.isAssegnato && beaconData.assignedChildId) {
          const childDocRef = doc(this.firestore, 'figli', beaconData.assignedChildId);
          batch.update(childDocRef, {
            beaconId: null,
            statoPresenza: 'Sconosciuto' // Reset dello stato del bambino
          });
          console.log(`Beacon ${beaconId} disassociato dal figlio ${beaconData.assignedChildId}.`);
        }

        await batch.commit();
        console.log(`Beacon ${beaconId} e riferimenti correlati eliminati con successo.`);
      } else {
        console.warn(`Beacon ${beaconId} non trovato.`);
        throw new Error('Beacon non trovato.');
      }
    } catch (error: any) {
      console.error(`Errore durante l'eliminazione del beacon ${beaconId}:`, error);
      throw error;
    }
  }

  async deleteChildAndAssociatedData(childId: string): Promise<void> {
    const childDocRef = doc(this.firestore, 'figli', childId);
    const notificationsCollectionRef = collection(this.firestore, 'figli', childId, 'notifiche');

    try {
      const childDocSnap = await getDoc(childDocRef);
      if (!childDocSnap.exists()) {
        console.warn(`Bambino ${childId} non trovato.`);
        throw new Error('Bambino non trovato.');
      }

      const childData = childDocSnap.data() as Figlio;
      const batch = writeBatch(this.firestore);

      // 1. Elimina il documento del bambino
      batch.delete(childDocRef);
      console.log(`Documento figlio ${childId} eliminato da Firestore.`);

      // 2. Elimina tutte le notifiche associate al bambino
      const notificationsSnapshot = await getDocs(notificationsCollectionRef);
      notificationsSnapshot.docs.forEach(notifDoc => {
        batch.delete(notifDoc.ref);
      });
      console.log(`Notifiche per figlio ${childId} eliminate.`);

      // 3. Disassocia il beacon, se assegnato
      if (childData.beaconId) {
        const beaconRef = doc(this.firestore, 'beacon', childData.beaconId);
        batch.update(beaconRef, {
          isAssegnato: false,
          assignedChildId: null,
          assignedParentId: null // Rimuovi anche il riferimento al genitore se presente
        });
        console.log(`Beacon ${childData.beaconId} disassociato dal figlio ${childId}.`);
      }

      // 4. Rimuovi il riferimento del figlio dal documento del genitore
      if (childData.genitoreId) {
        const parentDocRef = doc(this.firestore, 'ruoliUser', childData.genitoreId);
        batch.update(parentDocRef, {
          refFigli: arrayRemove(childId)
        });
        console.log(`Riferimento al figlio ${childId} rimosso dal genitore ${childData.genitoreId}.`);
      }

      await batch.commit();
      console.log(`Bambino ${childId} e tutti i dati associati eliminati con successo.`);

    } catch (error: any) {
      console.error(`Errore durante l'eliminazione del bambino ${childId} e dei dati associati:`, error);
      throw error;
    }
  }

  async addFermata(fermataData: { nome: string; indirizzo: string }): Promise<string> {
    try {
      const fermateCollectionRef = collection(this.firestore, 'fermate');
      const newFermataRef = doc(fermateCollectionRef); // Firestore genererà un ID unico

      // Prepara i dati della fermata
      const fermataToSave: Fermata = {
        nome: fermataData.nome,
        indirizzo: fermataData.indirizzo
      };

      await setDoc(newFermataRef, fermataToSave);
      console.log(`Fermata aggiunta con successo con ID: ${newFermataRef.id}`);
      return newFermataRef.id; // Restituisce l'ID della fermata appena creata
    } catch (error) {
      console.error('Errore durante l\'aggiunta della fermata:', error);
      throw error; // Rilancia l'errore per gestirlo nel componente chiamante
    }
  }

  async addBeacon(beaconData: { codiceIdentificativo: string; indirizzoMac: string; nomeBeacon: string; password?: string }): Promise<string> {
    try {
      const beaconsCollectionRef = collection(this.firestore, 'beacon');
      const newBeaconRef = doc(beaconsCollectionRef); // Firestore genererà un ID unico

      // Prepara i dati del beacon, inclusi i campi iniziali
      const beaconToSave: Beacon = {
        codiceIdentificativo: beaconData.codiceIdentificativo,
        indirizzoMac: beaconData.indirizzoMac,
        nomeBeacon: beaconData.nomeBeacon, // Corrisponde a 'nomeBeacon' nel form
        password: beaconData.password || undefined, // La password è opzionale
        isAssegnato: false,
        assignedChildId: null,
        assignedParentId: null
      };

      await setDoc(newBeaconRef, beaconToSave);
      console.log(`Beacon aggiunto con successo con ID: ${newBeaconRef.id}`);
      return newBeaconRef.id; // Restituisce l'ID del beacon appena creato
    } catch (error) {
      console.error('Errore durante l\'aggiunta del beacon:', error);
      throw error; // Rilancia l'errore per gestirlo nel componente chiamante
    }
  }

  getUsersByRole(role: 'Autista' | 'Genitore' | 'Amministratore'): Observable<Utente[]> {
    const usersCollectionRef = collection(this.firestore, 'ruoliUser');
    const q = query(usersCollectionRef, where('ruolo', '==', role));

    return new Observable<Utente[]>(observer => {
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const users: Utente[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          users.push({
            uid: doc.id,
            email: data['email'] || null,
            ruolo: data['ruolo'] || null,
            nome: data['nome'] || null,
            cognome: data['cognome'] || null,
            refFigli: Array.isArray(data['refFigli']) ? data['refFigli'] : [],
            fcmTokens: Array.isArray(data['fcmTokens']) ? data['fcmTokens'] : []
          });
        });
        observer.next(users);
      }, (error) => {
        console.error(`Errore nel listening degli utenti con ruolo ${role}:`, error);
        observer.error(error);
      });
      return () => unsubscribe();
    });
  }

  // AGGIUNTA: Metodo per aggiungere una notifica per un figlio specifico
  async addNotificationForChild(childId: string, notification: Omit<NotificaFiglio, 'id'>): Promise<void> {
    if (!childId) {
        console.error("Tentativo di aggiungere notifica senza Child ID.");
        return;
    }
    const notificationsCollectionRef = collection(this.firestore, 'figli', childId, 'notifiche');
    try {
        await setDoc(doc(notificationsCollectionRef), notification); // setDoc con doc() genera un ID automatico
        console.log(`Notifica aggiunta per il figlio ${childId}:`, notification.messaggio);
    } catch (error) {
        console.error(`Errore durante l'aggiunta della notifica per il figlio ${childId}:`, error);
        throw error;
    }
  }

  async updateChildStatus(
    childId: string,
    newStatus: 'A bordo' | 'Sceso' | 'Sconosciuto',
    fermataId: string | null = null,
    nomeFermata: string | null = null,
    indirizzoFermata: string | null = null
  ): Promise<void> {
    if (!childId) {
      console.error("Tentativo di aggiornare lo stato di un figlio senza un ID valido.");
      throw new Error("Child ID non valido.");
    }
    const childDocRef = doc(this.firestore, 'figli', childId);
    try {
      const childDocSnap = await getDoc(childDocRef);
      const oldStatus = childDocSnap.exists() ? childDocSnap.data()['statoPresenza'] : 'Sconosciuto';

      console.log(`[FirebaseService Debug] updateChildStatus chiamato per ID: ${childId}, Nuovo stato desiderato: ${newStatus}, Fermata ID: ${fermataId}, Nome Fermata: ${nomeFermata}`);
      console.log(`[FirebaseService Debug] Stato precedente rilevato da Firestore: ${oldStatus}`);


      await updateDoc(childDocRef, {
        statoPresenza: newStatus,
        ultimaAttivita: Timestamp.now()
      });
      console.log(`Stato figlio ${childId} aggiornato a ${newStatus} in Firestore.`);

    } catch (error) {
      console.error(`Errore durante l'aggiornamento dello stato del figlio ${childId}:`, error);
      throw error;
    }
  }

  async getFermate(): Promise<Fermata[]> {
    const fermateCollectionRef = collection(this.firestore, 'fermate');
    const querySnapshot = await getDocs(fermateCollectionRef);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Fermata));
  }

  async getFermataById(fermataId: string): Promise<Fermata | null> {
    const fermataDocRef = doc(this.firestore, `fermate/${fermataId}`);
    const fermataDocSnap = await getDoc(fermataDocRef);
    if (fermataDocSnap.exists()) {
      return { id: fermataDocSnap.id, ...fermataDocSnap.data() as Fermata };
    }
    return null;
  }

  async getKidDetails(kidId: string): Promise<Figlio | null> {
    const kidDocRef = doc(this.firestore, `figli/${kidId}`);
    const kidDocSnap = await getDoc(kidDocRef);

    if (kidDocSnap.exists()) {
      const data = kidDocSnap.data();
      return {
        id: kidDocSnap.id,
        genitoreId: data['genitoreId'],
        nome: data['nome'],
        cognome: data['cognome'],
        
        dataNascita: (data['dataNascita'] instanceof Timestamp) ? data['dataNascita'].toDate() : new Date(data['dataNascita']),
        fermataAssociataId: data['fermataAssociataId'],
        beaconId: data['beaconId'],
        statoPresenza: data['statoPresenza'],
        
        ultimaAttivita: (data['ultimaAttivita'] instanceof Timestamp) ? data['ultimaAttivita'].toDate() : undefined,
        hasNewNotifications: data['hasNewNotifications']
      } as Figlio;
    } else {
      return null;
    }
  }

  async addKidAndLinkBeacon(
    childDataOmit: Omit<Figlio, 'id' | 'statoPresenza' | 'beaconId' | 'genitoreId' | 'ultimaAttivita' | 'hasNewNotifications'>,
    codiceIdentificativoBeacon: string,
    passwordBeacon: string,
    parentId: string,
    fermataId: string | null = null,
    nomeFermata: string | null = null,
    indirizzoFermata: string | null = null
  ): Promise<string> {
    console.log("Tentativo di aggiungere bambino e collegare beacon...");

    const beaconsCollectionRef = collection(this.firestore, 'beacon'); 
    const childrenCollectionRef = collection(this.firestore, 'figli');
    const parentDocRef = doc(this.firestore, 'ruoliUser', parentId);

    const q = query(beaconsCollectionRef,
      where('codiceIdentificativo', '==', codiceIdentificativoBeacon),
      where('password', '==', passwordBeacon),
      where('isAssegnato', '==', false)
    );

    const beaconDocs = await getDocs(q);

    if (beaconDocs.empty) {
      console.log("Beacon non trovato, password errata o già assegnato.");
      throw new Error('Codice identificativo o password non validi, o beacon già in uso.');
    }

    const beaconDoc = beaconDocs.docs[0];
    const beaconRef = doc(this.firestore, 'beacon', beaconDoc.id);

    const batch = writeBatch(this.firestore);

    const newChildRef = doc(childrenCollectionRef);
    const childToSave: Figlio = {
      ...childDataOmit,
      genitoreId: parentId,
      beaconId: beaconDoc.id,
      statoPresenza: 'Sconosciuto',
      ultimaAttivita: new Date(),
      hasNewNotifications: false
    };
    batch.set(newChildRef, childToSave);

    batch.update(beaconRef, {
      isAssegnato: true,
      assignedChildId: newChildRef.id,
      assignedParentId: parentId
    });

    batch.update(parentDocRef, {
      refFigli: arrayUnion(newChildRef.id)
    });

    try {
      await batch.commit();
      console.log("Bambino aggiunto, beacon collegato e genitore aggiornato con successo in un batch.");

      // AGGIUNTA: Notifica iniziale alla creazione del bambino
      await this.addNotificationForChild(newChildRef.id, {
        timestamp: new Date(),
        tipo: 'creazioneBambino',
        messaggio: `${childToSave.nome} ${childToSave.cognome} è stato aggiunto al sistema.`,
        letto: false,
        statoPrecedente: 'Sconosciuto',
        nuovoStato: 'Sconosciuto',
        fermataId: fermataId || undefined,
        nomeFermata: nomeFermata || undefined,
        indrizzoFermata: indirizzoFermata || undefined,
      });
      console.log(`Notifica iniziale aggiunta per il nuovo bambino ${newChildRef.id}: "${childToSave.nome} ${childToSave.cognome} è stato aggiunto al sistema."`);

      return newChildRef.id;
    } catch (error) {
      console.error("Errore durante il commit del batch o l'aggiunta della notifica iniziale:", error);
      throw new Error('Si è verificato un errore durante l\'operazione. Riprova.');
    }
  }

  async signOut(): Promise<void> {
    await this.deleteFcmToken();
    await this.auth.signOut();
  }

  async requestNotificationPermissionAndSaveToken(): Promise<string | null> { // Ho cambiato il nome per chiarezza
    if (!('Notification' in window)) {
      console.warn('Questo browser non supporta le notifiche desktop.');
      return null;
    }

    if (!this.messaging) {
      console.warn('Firebase Messaging non è stato inizializzato. Le notifiche push potrebbero non funzionare.');
      return null;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        console.log('Permesso di notifica garantito.');

        const currentToken = await getToken(this.messaging, { // <-- MODIFICA QUI: Aggiunto vapidKey
          vapidKey: environment.firebaseConfig.vapidKey
        });

        if (currentToken) {
          console.log('FCM Registration Token:', currentToken);
          // La logica per salvare il token è ora direttamente qui, usando un metodo robusto per l'utente.
          await this.saveFcmTokenToCurrentUser(currentToken); // <-- CHIAMATA ALLA FUNZIONE AUSILIARIA AGGIORNATA
          return currentToken;
        } else {
          console.warn('Nessun token di registrazione FCM disponibile. Richiedere il permesso non ha prodotto un token.');
          return null;
        }
      } else {
        console.warn('Permesso di notifica negato o non supportato.');
        return null;
      }
    } catch (error) {
      console.error('Si è verificato un errore durante il recupero del token FCM:', error);
      return null;
    }
  }

  private async saveFcmTokenToCurrentUser(token: string): Promise<void> { // <-- NOME CAMBIATO E RESO PRIVATO
    const user = await new Promise<FirebaseUser | null>((resolve) => { // <-- MODIFICA QUI: Recupera utente robusto
      const unsubscribe = onAuthStateChanged(this.auth, (u) => {
        unsubscribe(); // Si disiscrive dopo il primo stato
        resolve(u);
      });
    });

    if (user) {
      const userDocRef = doc(this.firestore, 'ruoliUser', user.uid); // Usa this.firestore
      try {
        await updateDoc(userDocRef, {
          fcmTokens: arrayUnion(token) 
        });
        console.log('FCM token salvato/aggiornato per utente:', user.uid);
      } catch (error) {
        console.error('Errore durante il salvataggio del token FCM:', error);
      }
    } else {
      console.warn('Nessun utente autenticato (ancora) per salvare il token FCM.');
    }
  }

  async deleteFcmToken(): Promise<void> {
    if (!this.messaging) {
      console.warn('Firebase Messaging non è stato inizializzato.');
      return;
    }

    let currentToken: string | null = null;
    try {
      // Prima ottieni il token dal browser
      currentToken = await getToken(this.messaging, { vapidKey: environment.firebaseConfig.vapidKey });

      if (currentToken) {
        // 1. Tenta di rimuovere il token dal browser (avvolto in un suo try-catch)
        try {
          await deleteToken(this.messaging);
          console.log('FCM token rimosso dal browser.');
        } catch (browserError: any) {
          // Cattura specificamente l'errore dal browser
          if (browserError instanceof DOMException && browserError.name === 'AbortError' && browserError.message === 'Push service unreachable.') {
            console.warn('Impossibile raggiungere il servizio di push del browser per rimuovere il token. (Rete/Servizio irraggiungibile)', browserError);
            // Non bloccare il flusso: continua a rimuovere da Firestore
          } else {
            // Altri errori durante la rimozione dal browser
            console.error('Errore generico durante la rimozione del token FCM dal browser:', browserError);
          }
        }

        // 2. Recupera l'utente corrente per rimuovere il token dal suo documento Firestore
        const user = await new Promise<FirebaseUser | null>((resolve) => {
          const unsubscribe = onAuthStateChanged(this.auth, (u) => {
            unsubscribe();
            resolve(u);
          });
        });

        if (user) {
          const userDocRef = doc(this.firestore, 'ruoliUser', user.uid);
          await updateDoc(userDocRef, {
            fcmTokens: arrayRemove(currentToken)
          });
          console.log(`FCM token '${currentToken}' rimosso dal database per utente:`, user.uid);
        } else {
          console.warn('Nessun utente autenticato (ancora) per rimuovere il token FCM da Firestore.');
        }
      } else {
        console.log('Nessun token FCM trovato da rimuovere per questo dispositivo.');
      }
    } catch (overallError) {
      // Questo catch esterno cattura errori che non sono stati gestiti dal try-catch interno
      // o errori che si verificano prima del try-catch interno (es. getToken fallisce).
      console.error('Errore critico durante la rimozione del token FCM (o recupero iniziale):', overallError);
    }
}

  private setupFcmMessageListener(): void {
    if (this.messaging) {
      onMessage(this.messaging, (payload) => {
        console.log('Messaggio FCM ricevuto in foreground:', payload);
        // Qui puoi gestire come mostrare la notifica all'utente quando l'app è aperta.
        // Ad esempio, puoi mostrare un toast, un popup, o aggiornare un badge di notifiche.
        //alert(`Nuova Notifica: ${payload.notification?.title || ''} - ${payload.notification?.body || ''}`);
      });
    }
  }  

  getNotificationsForChild(childId: string): Observable<NotificaFiglio[]> {
    const notificationsCollectionRef = collection(this.firestore, 'figli', childId, 'notifiche');
    const q = query(notificationsCollectionRef, orderBy('timestamp', 'desc'));

    return new Observable<NotificaFiglio[]>(observer => {
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const notifications: NotificaFiglio[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          notifications.push({
            id: doc.id,
            timestamp: this.convertFirestoreTimestampToDate(data)['timestamp'],
            tipo: data['tipo'] || 'sconosciuto',
            messaggio: data['messaggio'] || 'Nessun messaggio',
            statoPrecedente: data['statoPrecedente'],
            nuovoStato: data['nuovoStato'],
            letto: data['letto'] || false ,
            fermataId: data['fermataId'] || undefined,
            nomeFermata: data['nomeFermata'] || undefined,
            indrizzoFermata: data['indirizzoFermata'] || undefined,
          });
        });
        observer.next(notifications);
      }, (error) => {
        console.error("Errore nel listening delle notifiche del figlio:", error);
        observer.error(error);
      });
      return () => unsubscribe();
    });
  }

  async markNotificationAsRead(childId: string, notificationId: string): Promise<void> {
    const notificationDocRef = doc(this.firestore, 'figli', childId, 'notifiche', notificationId);
    try {
      await updateDoc(notificationDocRef, {
        letto: true
      });
      console.log(`Notifica ${notificationId} del figlio ${childId} marcata come letta.`);
    } catch (error) {
      console.error(`Errore nel marcare la notifica ${notificationId} come letta:`, error);
    }
  }

  async signInWithGoogle(): Promise<FirebaseUser | null> {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(this.auth, provider);
      const user = result.user;

      // Gestione post-login Google: controlla o crea il documento del ruolo
      // Questo è cruciale per associare il ruolo ai nuovi utenti Google o recuperarlo per quelli esistenti.
      const userDocRef = doc(this.firestore, 'ruoliUser', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        // L'utente si sta registrando per la prima volta con Google
        const firstName = user.displayName?.split(' ')[0] || '';
        const lastName = user.displayName?.split(' ').slice(1).join(' ') || '';
        const userRole = 'Genitore'; // Assegna "Genitore" come ruolo di default per le nuove registrazioni Google

        await this.saveUserRoleAndData(user.uid, user.email, firstName, lastName, userRole);
        console.log('Nuovo utente Google registrato con ruolo Genitore:', user.uid);
      } else {
        console.log('Utente Google esistente loggato:', user.uid);
      }

      return user;

    } catch (error: any) {
      console.error('Errore durante il login con Google:', error.code, error.message);
      // Puoi gestire errori specifici di Google (es. auth/popup-closed-by-user, auth/cancelled-popup-request)
      throw error; // Rilancia l'errore per gestirlo nel componente
    }
  }

  /**
   * Invia un messaggio al chatbot Cloud Function e riceve una risposta.
   * Usa le Firebase HTTPS Callable Functions.
   * @param childId L'ID del bambino a cui si riferisce il messaggio.
   * @param userMessage Il messaggio dell'utente.
   * @returns Una Promise che risolve con la risposta del chatbot.
   */
  
  async getChatbotResponse(childId: string, userMessage: string): Promise<ChatMessage> {
    try {
      const functions = getFunctions(this.firebaseInitializer.app);

      const callChatbot = httpsCallable<
        { childId: string; userMessage: string },
        { sender: string; text: string; timestamp: string }
      >(functions, 'getChatbotResponse'); // 'getChatbotResponse' è il nome della Cloud Function HTTPS Callable

      const result: HttpsCallableResult<{ sender: string; text: string; timestamp: string }> = await callChatbot({ childId, userMessage });

      const chatbotResponse = result.data;
      const responseDate = new Date(chatbotResponse.timestamp); // Assicurati che il timestamp sia in un formato parsabile

      return {
        sender: chatbotResponse.sender as 'Chatbot',
        text: chatbotResponse.text,
        timestamp: responseDate,
      };

    } catch (error: any) {
      console.error('Errore durante la chiamata alla funzione chatbot:', error);
      throw new Error(`Errore chatbot: ${error.message || 'Errore sconosciuto'}`);
    }
  }

  /**
   * Salva un messaggio della chat in Firestore.
   * @param childId L'ID del bambino a cui la chat è associata.
   * @param message Il messaggio da salvare.
   */
  async saveChatMessage(childId: string, message: ChatMessage): Promise<void> {
    const chatCollectionRef = collection(this.firestore, 'figli', childId, 'chatMessages');
    try {
      // Usiamo setDoc con doc() per generare un ID automatico e salvare il messaggio
      await setDoc(doc(chatCollectionRef), {
        sender: message.sender,
        text: message.text,
        timestamp: Timestamp.fromDate(message.timestamp) // Converti Date in Timestamp per Firestore
      });
      console.log('Messaggio chat salvato per il figlio:', childId);
    } catch (error) {
      console.error('Errore durante il salvataggio del messaggio chat:', error);
      throw error;
    }
  }

  /**
   * Recupera i messaggi della chat in tempo reale per un bambino specifico.
   * @param childId L'ID del bambino.
   * @returns Un Observable di un array di ChatMessage.
   */
  getChatMessages(childId: string): Observable<ChatMessage[]> {
    const chatCollectionRef = collection(this.firestore, 'figli', childId, 'chatMessages');
    const q = query(chatCollectionRef, orderBy('timestamp', 'asc')); // Ordina per timestamp ascendente

    return new Observable<ChatMessage[]>(observer => {
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const messages: ChatMessage[] = [];
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          messages.push({
            id: docSnap.id, // Aggiungi l'ID del documento se ti serve
            sender: data['sender'],
            text: data['text'],
            timestamp: (data['timestamp'] instanceof Timestamp) ? data['timestamp'].toDate() : new Date(data['timestamp'])
          });
        });
        observer.next(messages);
      }, (error) => {
        console.error("Errore nel listening dei messaggi della chat:", error);
        observer.error(error);
      });
      return () => unsubscribe();
    });
  }

}