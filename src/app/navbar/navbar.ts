import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router, RouterLinkActive, NavigationEnd } from '@angular/router'; 
import { Auth, onAuthStateChanged, signOut, Unsubscribe, User } from 'firebase/auth'; 
import { Firebase } from '../core/firebase'; 
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { filter, map, switchMap, take } from 'rxjs/operators';
import type { Firestore } from '@angular/fire/firestore';
import { FirebaseService, Utente } from '../services/firebase.service';
import { Subscription, of } from 'rxjs';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
  ],
  templateUrl: './navbar.html', // Assicurati sia .html e non .component.html
  styleUrl: './navbar.scss' // Assicurati sia .scss e non .component.scss
})
export class Navbar implements OnInit, OnDestroy { // O 'export class Navbar' se non hai rinominato
  isAuthenticated: boolean = false;
  ruoliUser: 'Genitore' | 'Autista' | 'Amministratore' | null = null;
  isMenuOpen: boolean = false;
  isLandingPage: boolean = false;
  isAuthRoute: boolean = false;
  userNameAndSurname: string | null = null;

  // VARIABILE FONDAMENTALE: Controlla se la sezione dei link (Home, Menu) deve essere visibile
  showLinksSection: boolean = false; 

  private authStateUnsubscribe: Unsubscribe | undefined;
  private db!: Firestore;
  private userRoleSubscription: Subscription | undefined;
  private routerEventsSubscription: Subscription | undefined;

  constructor(
    private firebaseService: FirebaseService, 
    private router: Router
  ) { }

  ngOnInit(): void {
    // Sottoscrizione combinata per gestire lo stato di autenticazione e i dati del ruolo utente
    this.userRoleSubscription = this.firebaseService.authAndUserDataResolved$.pipe(
      filter(resolved => resolved), // Aspetta che lo stato di auth e userData sia risolto
      take(1), // Prendi solo il primo valore una volta risolto all'avvio
      switchMap(() => this.firebaseService.currentUser$), // Poi prendi l'utente Firebase (User | null | undefined)
      switchMap(user => {
        this.isAuthenticated = !!user; // Aggiorna lo stato di autenticazione
        if (user) {
          // Se l'utente Firebase è presente, sottoscriviti ai dati del ruolo
          return this.firebaseService.getCurrentUserData().pipe(
            map(userData => {
              if (userData) {
                this.ruoliUser = userData.ruolo;
                this.userNameAndSurname = this.firebaseService.getUserNameAndSurname(); // Usa il metodo del servizio
              } else {
                this.ruoliUser = null;
                this.userNameAndSurname = null;
              }
              return userData; // Restituisci userData per completare lo switchMap
            })
          );
        } else {
          // Se nessun utente Firebase, resetta i dati del ruolo
          this.ruoliUser = null;
          this.userNameAndSurname = null;
          return of(null); // Restituisci un Observable di null per completare lo switchMap
        }
      })
    ).subscribe(() => {
      // Questo blocco viene eseguito ogni volta che i dati dell'utente o il ruolo cambiano
      this.updateNavbarLayout(this.router.url);
      console.log(`Navbar: Ruolo utente aggiornato: ${this.ruoliUser}`);
    });


    // Sottoscrizione agli eventi del router per aggiornare il layout
    this.routerEventsSubscription = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.updateNavbarLayout(event.urlAfterRedirects);
    });

    // Chiamata iniziale per aggiornare il layout in caso di caricamento diretto
    this.updateNavbarLayout(this.router.url);
  }

  ngOnDestroy(): void {
    if (this.authStateUnsubscribe) {
      this.authStateUnsubscribe();
    }
  }

  private updateNavbarLayout(url: string): void {
    this.isLandingPage = url === '/'; 
    this.isAuthRoute = url.includes('/login') || url.includes('/register'); 

    this.showLinksSection = (!this.isLandingPage || this.isAuthenticated);

    if (this.isAuthRoute) {
        this.showLinksSection = true;
    }

    console.log('--- Aggiornamento Layout Navbar ---');
    console.log('URL corrente:', url);
    console.log('isLandingPage:', this.isLandingPage);
    console.log('isAuthRoute:', this.isAuthRoute);
    console.log('isAuthenticated:', this.isAuthenticated);
    console.log('showLinksSection:', this.showLinksSection);
    console.log('Ruolo Utente:', this.ruoliUser);
    console.log('Nome Utente (Navbar):', this.userNameAndSurname);
    console.log('----------------------------------');
  }

  async logout(): Promise<void> {
    try {
      await this.firebaseService.signOut();
      console.log('Logout effettuato con successo!');
      this.router.navigate(['/login']); 
      this.isMenuOpen = false; 
      this.ruoliUser = null;
      this.userNameAndSurname = null; 
    } catch (error) {
      console.error('Errore durante il logout:', error);
    }
  }

  async deleteAccount(): Promise<void> {
    if (confirm('Sei sicuro di voler eliminare definitivamente il tuo account? Questa operazione è irreversibile ed eliminerà tutti i tuoi dati e i dati dei tuoi figli associati.')) {
      try {
        // Chiama il nuovo metodo specifico per l'auto-eliminazione
        await this.firebaseService.deleteCurrentUserAccount();
        // Il reindirizzamento e l'alert sono già gestiti all'interno di deleteCurrentUserAccount()
        this.isMenuOpen = false; // Chiudi il menu dopo l'operazione
      } catch (error: any) {
        console.error('Errore durante l\'eliminazione dell\'account:', error);
        alert(`Errore: ${error.message}.`);
        // Se l'errore è auth/requires-recent-login, l'utente dovrà rifare il login.
        if (error.message.includes('devi effettuare nuovamente il login')) {
           this.router.navigate(['/login']);
        }
      }
    }
  }
  
toggleMenu(): void {
  this.isMenuOpen = !this.isMenuOpen; // Questo deve cambiare lo stato
  //console.log('Menu is open:', this.isMenuOpen); // Aggiungi questo per debug
}
closeMenu(): void {
  this.isMenuOpen = false;
  //console.log('Menu is closed:', this.isMenuOpen); // Aggiungi questo per debug
}
}