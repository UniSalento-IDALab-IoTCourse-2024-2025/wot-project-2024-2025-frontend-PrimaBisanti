// src/app/dashboards/dash-autista/dash-autista.component.ts

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FirebaseService, Figlio, Fermata, Utente } from '../../services/firebase.service'; // Importa Utente
import { Subscription } from 'rxjs';
import { filter, take, switchMap } from 'rxjs/operators'; // Importa filter, take, switchMap

export interface aBordo {
  id: string;
  nome: string;
  cognome: string;
  statusPresenza: 'A bordo' | 'Sceso' | 'Sconosciuto';
  confermato: boolean;
  statoSelezionato: boolean;
  fermataAssociataId: string | null;
  fermataAssociataNome: string | null;
  fermataAssociataIndirizzo: string | null;
}

@Component({
  selector: 'app-dash-autista',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dash-autista.html',
  styleUrl: './dash-autista.scss'
})
export class DashAutista implements OnInit, OnDestroy {
  userName: string | null = null;
  aBordoList: aBordo[] = [];
  private figliSubscription: Subscription | undefined;
  private authSubscription: Subscription = new Subscription(); // Per gestire la sottoscrizione all'autenticazione

  constructor(private firebaseService: FirebaseService) { }

  ngOnInit(): void {
    // Sottoscriviti a authAndUserDataResolved$ per attendere che lo stato sia stabile
    this.authSubscription.add(
      this.firebaseService.authAndUserDataResolved$.pipe(
        filter(resolved => resolved), // Continua solo quando lo stato è risolto (true)
        take(1), // Prendi solo il primo valore una volta risolto
        switchMap(() => this.firebaseService.getCurrentUserData()) // Una volta risolto, ottieni i dati dell'utente
      ).subscribe(user => {
        if (user && user.ruolo === 'Autista') {
          this.userName = user.nome || user.email; // Popola il nome utente dal servizio
          console.log('DashAutista: Utente autista loggato:', this.userName);
          this.loadAbordoList(); // Carica la lista solo dopo che l'utente è stato confermato
        } else {
          this.userName = null;
          console.warn('DashAutista: Utente non loggato o non è un autista. Reindirizzo al login (gestito dalle guardie).');
          // Le guardie di rotta in app.routes.ts dovrebbero gestire il reindirizzamento al login
          // se l'utente non ha il ruolo corretto o non è autenticato.
        }
      })
    );
  }

  ngOnDestroy(): void {
    if (this.figliSubscription) {
      this.figliSubscription.unsubscribe();
    }
    this.authSubscription.unsubscribe(); // Disiscriviti anche dalla sottoscrizione all'autenticazione
  }

  loadAbordoList(): void {
    this.figliSubscription = this.firebaseService.getAllBambini().subscribe(
      async (figliFirestore: Figlio[]) => {
        const newAbordoList: aBordo[] = [];
        for (const bimboFS of figliFirestore) {
          let fermataNome: string | null = null;
          let fermataIndirizzo: string | null = null;

          if (bimboFS.fermataAssociataId) {
            try {
              const fermata = await this.firebaseService.getFermataById(bimboFS.fermataAssociataId);
              if (fermata) {
                fermataNome = fermata.nome;
                fermataIndirizzo = fermata.indirizzo;
              }
            } catch (error) {
              console.error(`Errore nel recupero della fermata per il bambino ${bimboFS.nome}:`, error);
            }
          }

          newAbordoList.push({
            id: bimboFS.id!,
            nome: bimboFS.nome,
            cognome: bimboFS.cognome,
            statusPresenza: this.mapFirestoreStatusToAppStatus(bimboFS.statoPresenza),
            confermato: false,
            statoSelezionato: false,
            fermataAssociataId: bimboFS.fermataAssociataId || null,
            fermataAssociataNome: fermataNome,
            fermataAssociataIndirizzo: fermataIndirizzo
          });
        }
        this.aBordoList = newAbordoList;
        console.log('Bambini caricati e mappati da Firestore con dettagli fermata:', this.aBordoList);
      },
      error => {
        console.error('Errore durante il caricamento dei bambini da Firestore:', error);
      }
    );
  }

  private mapFirestoreStatusToAppStatus(status: 'A bordo' | 'Sceso' | 'Sconosciuto'): 'A bordo' | 'Sceso' | 'Sconosciuto'{
    switch (status) {
      case 'A bordo':
        return 'A bordo';
      case 'Sceso':
        return 'Sceso';
      default:
        console.warn(`Stato di Firestore non riconosciuto: ${status}`);
        return 'Sconosciuto';
    }
  }

  private mapAppStatusToFirestoreStatus(status: 'A bordo' | 'Sceso' | 'Sconosciuto'): 'A bordo' | 'Sceso' | 'Sconosciuto' {
    switch (status) {
      case 'A bordo':
        return 'A bordo';
      case 'Sceso':
        return 'Sceso';
      default:
        console.warn(`Stato app non riconosciuto per Firestore: ${status}`);
        return 'Sconosciuto';
    }
  }

  selectA_Bordo(bimbo: aBordo): void {
    bimbo.statusPresenza = 'A bordo';
    bimbo.statoSelezionato = true;
    bimbo.confermato = false;
  }

  selectSceso(bimbo: aBordo): void {
    bimbo.statusPresenza = 'Sceso';
    bimbo.statoSelezionato = true;
    bimbo.confermato = false;
  }

  async confermaStato(bimbo: aBordo): Promise<void> {
    const index = this.aBordoList.findIndex(b => b.id === bimbo.id);
    if (index === -1) {
      console.error('Bambino non trovato nella lista:', bimbo);
      return;
    }

    const newFirestoreStatus = this.mapAppStatusToFirestoreStatus(bimbo.statusPresenza);

    try {
      await this.firebaseService.updateChildStatus(
        bimbo.id,
        newFirestoreStatus,
        bimbo.fermataAssociataId,
        bimbo.fermataAssociataNome,
        bimbo.fermataAssociataIndirizzo
      );

      this.aBordoList[index].confermato = true;
      this.aBordoList[index].statoSelezionato = false;

      console.log(`Stato di ${bimbo.nome} ${bimbo.cognome} confermato e aggiornato in Firestore come: ${newFirestoreStatus}`);

    } catch (error) {
      console.error(`Impossibile confermare lo stato di ${bimbo.nome} ${bimbo.cognome} in Firestore:`, error);
      alert('Errore durante l\'aggiornamento dello stato del bambino. Riprova.');
    }
  }

  async endRun(): Promise<void> {
    if (confirm('Sei sicuro di voler terminare la corsa e resettare lo stato di tutti i bambini a "Sceso"?')) {
      try {
        const updatePromises: Promise<void>[] = [];

        for (const bimbo of this.aBordoList) {
            if (bimbo.statusPresenza !== 'Sceso') {
                bimbo.statusPresenza = 'Sceso';
                bimbo.confermato = false;
                bimbo.statoSelezionato = false;
                updatePromises.push(this.firebaseService.updateChildStatus(bimbo.id, 'Sceso'));
            }
        }

        await Promise.all(updatePromises);

        console.log('Stato di tutti i bambini resettato a "Sceso" in Firestore.');
        alert('Corsa terminata! Lo stato di tutti i bambini è stato resettato e le notifiche sono state inviate.');

      } catch (error) {
        console.error('Errore durante il reset dello stato dei bambini:', error);
        alert('Si è verificato un errore durante il termine della corsa. Riprova.');
      }
    }
  }
}