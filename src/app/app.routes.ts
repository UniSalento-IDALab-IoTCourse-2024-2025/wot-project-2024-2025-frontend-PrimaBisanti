// src/app/app.routes.ts

import { Routes, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { map, catchError, take, filter, switchMap } from 'rxjs/operators'; // <--- AGGIUNGI 'filter' e 'switchMap'

import { Home } from './home/home';
import { Login } from './auth/login/login';
import { Register } from './auth/register/register';
import { DashAutista } from './dashboards/dash-autista/dash-autista';
import { DashGenitore } from './dashboards/dash-genitore/dash-genitore';
import { DashAmministratore } from './dashboards/dash-amministratore/dash-amministratore';
import { AddBimbo } from './add-bimbo/add-bimbo';
import { DettagliBimbo } from './dettagli-bimbo/dettagli-bimbo';

// Importa FirebaseService e Utente direttamente da qui
import { FirebaseService, Utente } from './services/firebase.service';


// --- Auth Guard (Guardia di Autenticazione) MODIFICATA ---
export const authGuard = () => {
  const firebaseService = inject(FirebaseService); // Inietta il tuo servizio Firebase
  const router = inject(Router);

  return firebaseService.authAndUserDataResolved$.pipe( // <--- Aspetta che lo stato sia risolto
    filter(resolved => resolved === true), // Continua solo quando lo stato è risolto
    take(1), // Prendi il primo valore dopo che è risolto
    switchMap(() => firebaseService.currentUser$), // Poi controlla l'utente autenticato Firebase
    map(user => {
      if (user) {
        console.log("AuthGuard: Utente autenticato. Permetto accesso.");
        return true;
      } else {
        console.log("AuthGuard: Utente NON autenticato. Reindirizzo al login.");
        router.navigate(['/login']);
        return false;
      }
    }),
    catchError(error => {
      console.error("AuthGuard: Errore nel recupero stato autenticazione. Reindirizzo:", error);
      router.navigate(['/login']);
      return of(false);
    })
  );
};

// --- Role Guard (Guardia di Ruolo) MODIFICATA ---
export const roleGuard = (expectedRoles: string[]) => {
  const firebaseService = inject(FirebaseService);
  const router = inject(Router);

  return firebaseService.authAndUserDataResolved$.pipe( // <--- Aspetta che lo stato sia risolto
    filter(resolved => resolved === true), // Continua solo quando lo stato è risolto
    take(1), // Prendi il primo valore dopo che è risolto
    switchMap(() => firebaseService.getCurrentUserData()), // Poi ottieni i dati utente
    map(user => {
      if (user && user.ruolo && expectedRoles.includes(user.ruolo)) {
        console.log(`RoleGuard: Ruolo '${user.ruolo}' consentito per la rotta.`);
        return true;
      } else {
        console.log(`RoleGuard: Ruolo '${user?.ruolo}' NON consentito o utente non trovato. Reindirizzo.`);
        router.navigate(['/login']);
        return false;
      }
    }),
    catchError(error => {
      console.error("RoleGuard: Errore nel recupero dati utente o ruolo. Reindirizzo:", error);
      router.navigate(['/login']);
      return of(false);
    })
  );
};


export const routes: Routes = [
  { path: '', component: Home },
  { path: 'login', component: Login },
  { path: 'register', component: Register },

  {
    path: 'dashboards/dash-genitore',
    component: DashGenitore,
    // Le guardie sono già applicate correttamente qui, con l'ordine corretto
    canActivate: [authGuard, () => roleGuard(['Genitore'])]
  },
  {
    path: 'dashboards/dash-autista',
    component: DashAutista,
    canActivate: [authGuard, () => roleGuard(['Autista'])]
  },
  {
    path: 'dashboards/dash-amministratore',
    component: DashAmministratore,
    canActivate: [authGuard, () => roleGuard(['Amministratore'])]
  },
  {
    path: 'add-bimbo',
    component: AddBimbo,
    canActivate: [authGuard, () => roleGuard(['Genitore'])]
  },
  {
    path: 'dettagli-bimbo/:id',
    component: DettagliBimbo,
    canActivate: [authGuard, () => roleGuard(['Genitore'])]
  },

  { path: '**', redirectTo: '/login' }
];