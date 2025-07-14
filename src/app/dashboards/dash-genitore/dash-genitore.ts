import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { FirebaseService, Figlio, Utente } from '../../services/firebase.service';
import { Observable, BehaviorSubject, combineLatest, of } from 'rxjs';
import { catchError, filter, map, startWith, switchMap, take, tap } from 'rxjs/operators';

@Component({
  selector: 'app-dash-genitore',
  standalone: true,
  imports: [
    CommonModule
  ],
  templateUrl: './dash-genitore.html',
  styleUrl: './dash-genitore.scss'
})
export class DashGenitore implements OnInit {
  userName: string | null = null;
  currentUser: Utente | null = null;
  children$: Observable<Figlio[]> | undefined;
  recentActivities: { firstName: string; lastName: string; tripStatus: string; }[] = [];

  // Aggiunti per gestire lo stato di caricamento e gli errori
  isLoading: boolean = true; // Inizia come true perché stiamo caricando i dati all'inizio
  errorMessage: string | null = null;

  constructor(
    private router: Router,
    private firebaseService: FirebaseService
  ) { }

  ngOnInit(): void {
    this.isLoading = true;
    this.errorMessage = null;

    // *** MODIFICA QUESTO BLOCCO ***
    this.firebaseService.authAndUserDataResolved$.pipe(
      filter(resolved => resolved === true), // Aspetta che lo stato sia risolto
      take(1), // Prendi il primo valore dopo che è risolto
      switchMap(() => this.firebaseService.getCurrentUserData()), // Una volta risolto, ottieni i dati utente
      tap(user => {
        if (user) {
          this.currentUser = user;
          this.userName = user.nome || user.email;

          if (user.ruolo === 'Genitore' && user.uid) {
            // Seleziona children$ solo dopo aver caricato l'utente
            this.children$ = this.firebaseService.getChildrenOfParent(user.uid).pipe( // Usa getChildrenOfParent
              tap(children => {
                if (children && children.length > 0) {
                  console.log('Figli caricati per genitore:', children);
                } else {
                  console.log('Nessun figlio trovato o caricato per genitore.');
                }
                this.isLoading = false;
              }),
              catchError(error => {
                console.error("Errore nel caricamento dei figli del genitore:", error);
                this.errorMessage = 'Errore nel caricamento dei figli. Riprova più tardi.';
                this.isLoading = false;
                return of([]);
              })
            );
          } else {
            console.warn('Ruolo utente non genitore o UID non disponibile.');
            this.userName = null;
            this.children$ = of([]);
            this.errorMessage = 'Impossibile recuperare l\'ID utente.';
            this.isLoading = false;
          }
        } else {
          // Utente non loggato o dati non disponibili
          this.userName = null;
          this.currentUser = null;
          this.children$ = of([]);
          this.errorMessage = 'Utente non autenticato o dati non disponibili.';
          this.isLoading = false;
          console.warn('Utente non loggato o dati non disponibili. Reindirizzo al login se necessario.');
          // NON reindirizzare direttamente qui, la guardia di rotta dovrebbe farlo
          this.router.navigate(['/login']); // <- Questa riga dovrebbe essere nella AuthGuard
        }
      }),
      catchError(error => {
        console.error("Errore nel recupero dati utente corrente:", error);
        this.errorMessage = 'Errore nel recupero dei dati dell\'utente. Riprova più tardi.';
        this.isLoading = false;
        return of(null);
      })
    ).subscribe();
  }


  onImageClick() {
    console.log('Immagine "Aggiungi Bambino" cliccata! Navigo a /add-bimbo');
    this.router.navigate(['/add-bimbo']);
  }

  onViewChildDetails(child: Figlio) {
    console.log('Visualizza dettagli bambino:', child);
    if (child.id) {
      this.router.navigate(['/dettagli-bimbo', child.id]);
    } else {
      console.error('ID del bambino non disponibile per la navigazione.');
      this.errorMessage = 'Impossibile visualizzare i dettagli: ID del bambino mancante.';
    }
  }
}