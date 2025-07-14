// src/app/auth/login/login.ts

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { FirebaseService, Utente } from '../../services/firebase.service';
import { filter, Subscription, switchMap, take } from 'rxjs';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login implements OnInit, OnDestroy {
  loginCredentials = {
    email: '',
    password: ''
  };
  errorMessage: string | null = null;
  passwordVisible: boolean = false;

  showForgotPasswordForm: boolean = false;
  resetEmail: string = '';

  private userDataSubscription: Subscription | undefined;
  private authResolvedSubscription: Subscription | undefined; // Sottoscrizione per authAndUserDataResolved$
  private isRedirecting: boolean = false; // Flag per prevenire reindirizzamenti multipli

  constructor(private firebaseService: FirebaseService, private router: Router) { }

  ngOnInit(): void {
    console.log('Login Component: ngOnInit chiamato.');

    // Questo listener serve a gestire il caso in cui l'utente sia già loggato
    // e navighi alla pagina di login, o per catturare aggiornamenti del ruolo.
    this.userDataSubscription = this.firebaseService.getCurrentUserData().subscribe(user => {
      console.log('Login Component: userDataSubscription - Utente ricevuto:', user);
      if (user && user.ruolo && !this.isRedirecting) { // Aggiungi controllo isRedirecting
        console.log('Login Component: userDataSubscription - Ruolo rilevato:', user.ruolo);
        this.redirectToDashboard(user.ruolo);
      } else if (user === null) {
        console.log('Login Component: userDataSubscription - Utente non autenticato o senza ruolo.');
      }
    });

    // Questo listener è pensato per garantire che il reindirizzamento avvenga una volta che
    // sia l'autenticazione che il recupero dei dati utente sono stati risolti inizialmente.
    // È particolarmente utile per il flusso di login fresco.
    this.authResolvedSubscription = this.firebaseService.authAndUserDataResolved$.pipe(
      filter(resolved => resolved), // Attendi che lo stato sia risolto (true)
      take(1), // Prendi il primo valore dopo che è risolto e poi completa l'Observable
      switchMap(() => this.firebaseService.getCurrentUserData().pipe(take(1))) // Poi ottieni i dati utente una volta
    ).subscribe(user => {
      console.log('Login Component: authResolvedSubscription - Stato auth/dati risolto. Utente:', user);
      if (user && user.ruolo && !this.isRedirecting) { // Aggiungi controllo isRedirecting
        console.log('Login Component: authResolvedSubscription - Ruolo rilevato:', user.ruolo);
        this.redirectToDashboard(user.ruolo);
      } else if (user === null) {
        console.warn('Login Component: authResolvedSubscription - Utente autenticato ma senza ruolo o disconnesso. Reindirizzamento a default o completamento profilo.');
        // Questo caso può accadere se l'utente si autentica ma il documento ruoliUser non esiste ancora
        // (es. nuova registrazione con Google prima che il ruolo sia salvato).
        // Puoi reindirizzare a una pagina di completamento profilo o a un login di fallback.
        // this.router.navigate(['/completamento-profilo']);
      }
    });
  }

  ngOnDestroy(): void {
    console.log('Login Component: ngOnDestroy chiamato. Annullamento sottoscrizioni.');
    if (this.userDataSubscription) {
      this.userDataSubscription.unsubscribe();
    }
    if (this.authResolvedSubscription) {
      this.authResolvedSubscription.unsubscribe();
    }
  }

  togglePasswordVisibility(): void {
    this.passwordVisible = !this.passwordVisible;
  }

  // --- FUNZIONE PER GESTIRE IL REINDIRIZZAMENTO CENTRALIZZATO ---
  private redirectToDashboard(role: 'Autista' | 'Genitore' | 'Amministratore' | null): void {
    if (this.isRedirecting) { // Se un reindirizzamento è già in corso, esci
      console.log('redirectToDashboard: Reindirizzamento già in corso, ignoro.');
      return;
    }

    console.log(`redirectToDashboard chiamato con ruolo: ${role}`);
    if (!role) {
      console.warn('redirectToDashboard: Ruolo utente non definito, impossibile reindirizzare.');
      this.router.navigate(['/login']); // Fallback al login
      return;
    }

    this.isRedirecting = true; // Imposta il flag per prevenire reindirizzamenti multipli

    let path: string;
    switch (role) {
      case 'Genitore':
        path = '/dashboards/dash-genitore';
        console.log(`redirectToDashboard: Navigazione a ${path}`);
        this.router.navigate([path]);
        break;
      case 'Autista':
        path = '/dashboards/dash-autista';
        console.log(`redirectToDashboard: Navigazione a ${path}`);
        this.router.navigate([path]);
        break;
      case 'Amministratore':
        path = '/dashboards/dash-amministratore'; // <--- ASSICURATI CHE QUESTO SIA IL PERCORSO CORRETTO
        console.log(`redirectToDashboard: Navigazione a ${path}`);
        this.router.navigate([path]);
        break;
      default:
        console.warn('redirectToDashboard: Ruolo sconosciuto o non gestito:', role);
        path = '/login'; // Fallback al login
        this.router.navigate([path]);
        break;
    }

    // Reset del flag dopo un breve ritardo per dare tempo alla navigazione di avviarsi.
    // Questo è un approccio euristico per evitare race condition.
    setTimeout(() => {
      this.isRedirecting = false;
    }, 1000); // Puoi aggiustare il tempo se necessario
  }


  async onSubmit() {
    this.errorMessage = null;

    try {
      console.log('Login Component: Tentativo di login con email/password...');
      // Esegui il login. Il reindirizzamento avverrà tramite la sottoscrizione in ngOnInit
      await this.firebaseService.loginUser(this.loginCredentials.email, this.loginCredentials.password);

      console.log('Login effettuato con successo! Attendendo risoluzione dati utente...');

      // Rimosso il blocco await ... .toPromise() e la logica di reindirizzamento duplicata.
      // Ora ci affidiamo completamente ai listener in ngOnInit.

      // La gestione di localStorage.setItem('userName') dovrebbe idealmente avvenire
      // nel componente della dashboard di destinazione, una volta che i dati dell'utente
      // sono disponibili e il reindirizzamento è completato.
      // Per ora, lo rimuovo da qui per evitare potenziali problemi di tempistica.
      // if (currentUserData.nome) { ... } else { ... }
    } catch (error: any) {
      console.error('Login Component: Errore durante il login:', error.code, error.message);

      if (error.name === "AuthGoogleRegistered") {
        this.errorMessage = error.message;
      } else {
        switch (error.code) {
          case 'auth/invalid-email':
            this.errorMessage = 'Email non valida.';
            break;
          case 'auth/user-disabled':
            this.errorMessage = 'Utente disabilitato.';
            break;
          case 'auth/user-not-found':
            this.errorMessage = 'Nessun utente trovato con questa email.';
            break;
          case 'auth/wrong-password':
            this.errorMessage = 'Password errata.';
            break;
          case 'auth/invalid-credential':
            this.errorMessage = 'Credenziali non valide. Controlla email e password.';
            break;
          default:
            this.errorMessage = `Errore di login: ${error.message}. Riprova.`;
            break;
        }
      }
      localStorage.removeItem('userName');
    }
  }

  async onLoginWithGoogle(): Promise<void> {
    this.errorMessage = null;
    try {
      console.log('Login Component: Tentativo di login con Google...');
      // Esegui il login con Google. Il reindirizzamento avverrà tramite la sottoscrizione in ngOnInit
      await this.firebaseService.signInWithGoogle();

      console.log('Login con Google effettuato con successo! Attendendo risoluzione dati utente...');

      // Rimosso il blocco await ... .toPromise() e la logica di reindirizzamento duplicata.
      // Ora ci affidiamo completamente ai listener in ngOnInit.

    } catch (error: any) {
      console.error('Login Component: Errore durante il login con Google:', error);
      switch (error.code) {
        case 'auth/popup-closed-by-user':
          this.errorMessage = 'Il popup di login è stato chiuso.';
          break;
        case 'auth/cancelled-popup-request':
          this.errorMessage = 'Richiesta di login annullata.';
          break;
        case 'auth/credential-already-in-use':
          this.errorMessage = 'Questa email è già in uso con un altro metodo di accesso. Prova a loggarti con la tua password o collega il tuo account Google.';
          break;
        default:
          this.errorMessage = `Errore di login con Google: ${error.message}. Riprova.`;
          break;
      }
      localStorage.removeItem('userName');
    }
  }

  toggleForgotPasswordForm(event: Event): void {
    event.preventDefault();
    this.showForgotPasswordForm = !this.showForgotPasswordForm;
    this.errorMessage = null;
    this.resetEmail = '';
  }

  async sendPasswordResetEmailPlaceholder(): Promise<void> {
    this.errorMessage = null;
    if (!this.resetEmail) {
      this.errorMessage = 'Inserisci la tua email per il reset della password.';
      return;
    }
    try {
      await this.firebaseService.sendPasswordResetEmail(this.resetEmail);
      // Sostituisci alert con un messaggio visualizzato nel DOM
      this.errorMessage = 'Se l\'email è registrata, riceverai un link per il reset della password.';
      this.showForgotPasswordForm = false;
      this.resetEmail = '';
    } catch (error: any) {
      console.error('Errore nell\'invio email di reset:', error);
      this.errorMessage = 'Errore nell\'invio dell\'email di reset. Riprova.';
    }
  }
}