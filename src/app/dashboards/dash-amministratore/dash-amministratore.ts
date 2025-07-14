// src/app/dashboards/dashboard-amministratore/dash-amministratore.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FirebaseService, Utente, Figlio, Beacon, Fermata } from '../../services/firebase.service';
import { Observable, Subscription, combineLatest, BehaviorSubject } from 'rxjs';
import { switchMap, map, startWith, debounceTime, distinctUntilChanged, filter, take } from 'rxjs/operators'; // Aggiungi filter, take
import { FormsModule } from '@angular/forms';


@Component({
  selector: 'app-dash-amministratore',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './dash-amministratore.html',
  styleUrl: './dash-amministratore.scss'
})
export class DashAmministratore implements OnInit, OnDestroy {
  loggedInUserName: string | null = null;
  autisti$: Observable<Utente[]> | undefined;
  beacons$: Observable<Beacon[]> | undefined;
  bambini$: Observable<Figlio[]> | undefined;
  genitori$: Observable<Utente[]> | undefined;
  fermate$: Observable<Fermata[]> | undefined;

  filterAutisti = new BehaviorSubject<string>('');
  filterBeacons = new BehaviorSubject<string>('');
  filterBambini = new BehaviorSubject<string>('');
  filterGenitori = new BehaviorSubject<string>('');
  filterFermate = new BehaviorSubject<string>('');

  numAutisti: number = 0;
  numBeacons: number = 0;
  numBambini: number = 0;
  numGenitori: number = 0;
  numFermate: number = 0;

  passwordVisible: boolean = false;

  private subscriptions: Subscription = new Subscription();

  showAddDriverModal: boolean = false;
  newDriver = {
    nome: '',
    cognome: '',
    email: '',
    password: ''
  };
  addDriverMessage: string | null = null;
  addDriverError: boolean = false;

  showAddBeaconModal: boolean = false;
  newBeacon = {
    codiceIdentificativo: '',
    indirizzoMac: '',
    nomeBeacon: '',
    password: ''
  };
  addBeaconMessage: string | null = null;
  addBeaconSuccess: boolean = false;
  addBeaconError: boolean = false;

  showAddFermataModal: boolean = false;
  newFermata = {
    nome: '',
    indirizzo: ''
  };
  addFermataMessage: string | null = null;
  addFermataError: boolean = false;

  showChildDetailsModal: boolean = false;
  selectedChildDetails: Figlio | null = null;
  childDetailsLoading: boolean = false;
  childDetailsError: string | null = null;


  constructor(private firebaseService: FirebaseService, private router: Router) { }

  ngOnInit(): void {
    // Sottoscriviti a authAndUserDataResolved$ per attendere che lo stato sia stabile
    this.subscriptions.add(
      this.firebaseService.authAndUserDataResolved$.pipe(
        filter(resolved => resolved), // Continua solo quando lo stato è risolto (true)
        take(1), // Prendi solo il primo valore una volta risolto
        switchMap(() => this.firebaseService.getCurrentUserData()) // Una volta risolto, ottieni i dati dell'utente
      ).subscribe(user => {
        if (user && user.ruolo === 'Amministratore') {
          this.loggedInUserName = user.nome || user.email; // Popola il nome utente dal servizio
          console.log('DashAmministratore: Utente amministratore loggato:', this.loggedInUserName);
          this.initializeDataStreams(); // Carica i flussi di dati solo dopo che l'utente è stato confermato
        } else {
          this.loggedInUserName = null;
          console.warn('DashAmministratore: Utente non loggato o non è un amministratore. Reindirizzo al login (gestito dalle guardie).');
          // Le guardie di rotta in app.routes.ts dovrebbero gestire il reindirizzamento al login
          // se l'utente non ha il ruolo corretto o non è autenticato.
        }
      })
    );
  }

  private initializeDataStreams(): void {
    this.autisti$ = combineLatest([
      this.firebaseService.getUsersByRole('Autista'),
      this.filterAutisti.pipe(debounceTime(300), distinctUntilChanged(), startWith(''))
    ]).pipe(
      map(([autisti, filterText]) => {
        this.numAutisti = autisti.length;
        if (!filterText) {
          return autisti;
        }
        const lowerFilter = filterText.toLowerCase();
        return autisti.filter(autista =>
          (autista.nome && autista.nome.toLowerCase().includes(lowerFilter)) ||
          (autista.cognome && autista.cognome.toLowerCase().includes(lowerFilter)) ||
          (autista.email && autista.email.toLowerCase().includes(lowerFilter))
        );
      })
    );

    this.genitori$ = combineLatest([
      this.firebaseService.getUsersByRole('Genitore'),
      this.filterGenitori.pipe(debounceTime(300), distinctUntilChanged(), startWith(''))
    ]).pipe(
      map(([genitori, filterText]) => {
        this.numGenitori = genitori.length;
        if (!filterText) {
          return genitori;
        }
        const lowerFilter = filterText.toLowerCase();
        return genitori.filter(genitore =>
          (genitore.nome && genitore.nome.toLowerCase().includes(lowerFilter)) ||
          (genitore.cognome && genitore.cognome.toLowerCase().includes(lowerFilter)) ||
          (genitore.email && genitore.email.toLowerCase().includes(lowerFilter)) ||
          (genitore.uid && genitore.uid.toLowerCase().includes(lowerFilter)) 
        );
      })
    );

    this.fermate$ = combineLatest([
      this.firebaseService.getAllFermate(),
      this.filterFermate.pipe(debounceTime(300), distinctUntilChanged(), startWith(''))
    ]).pipe(
      map(([fermate, filterText]) => {
        this.numFermate = fermate.length;
        if (!filterText) {
          return fermate;
        }
        const lowerFilter = filterText.toLowerCase();
        return fermate.filter(fermata =>
          (fermata.nome && fermata.nome.toLowerCase().includes(lowerFilter)) ||
          (fermata.indirizzo && fermata.indirizzo.toLowerCase().includes(lowerFilter)) ||
          (fermata.id && fermata.id.toLowerCase().includes(lowerFilter))
        );
      })
    );

    this.beacons$ = combineLatest([
      this.firebaseService.getAllBeacons(),
      this.filterBeacons.pipe(debounceTime(300), distinctUntilChanged(), startWith(''))
    ]).pipe(
      map(([beacons, filterText]) => {
        this.numBeacons = beacons.length;
        if (!filterText) {
          return beacons;
        }
        const lowerFilter = filterText.toLowerCase();
        return beacons.filter(beacon =>
          (beacon.codiceIdentificativo && beacon.codiceIdentificativo.toLowerCase().includes(lowerFilter)) ||
          (beacon.indirizzoMac && beacon.indirizzoMac.toLowerCase().includes(lowerFilter)) ||
          (beacon.nomeBeacon && beacon.nomeBeacon.toLowerCase().includes(lowerFilter)) ||
          (beacon.assignedParentId && beacon.assignedParentId.toLowerCase().includes(lowerFilter))
        );
      })
    );

    this.bambini$ = combineLatest([
      this.firebaseService.getAllBambini(),
      this.filterBambini.pipe(debounceTime(300), distinctUntilChanged(), startWith(''))
    ]).pipe(
      map(([bambini, filterText]) => {
        this.numBambini = bambini.length;
        if (!filterText) {
          return bambini;
        }
        const lowerFilter = filterText.toLowerCase();
        return bambini.filter(bambino =>
          (bambino.nome && bambino.nome.toLowerCase().includes(lowerFilter)) ||
          (bambino.cognome && bambino.cognome.toLowerCase().includes(lowerFilter)) ||
          (bambino.genitoreId && bambino.genitoreId.toLowerCase().includes(lowerFilter))
        );
      })
    );
  }


  togglePasswordVisibility(): void {
    this.passwordVisible = !this.passwordVisible;
  }

  onSearchAutisti(event: Event): void {
    this.filterAutisti.next((event.target as HTMLInputElement).value);
  }

  onSearchBeacons(event: Event): void {
    this.filterBeacons.next((event.target as HTMLInputElement).value);
  }

  onSearchFermate(event: Event): void {
    this.filterFermate.next((event.target as HTMLInputElement).value);
  }

  onSearchBambini(event: Event): void {
    this.filterBambini.next((event.target as HTMLInputElement).value);
  }

  onSearchGenitori(event: Event): void {
    this.filterGenitori.next((event.target as HTMLInputElement).value);
  }


  async deleteUser(uid: string, ruolo: 'Genitore' | 'Autista' | 'Amministratore'): Promise<void> {
    if (confirm(`Sei sicuro di voler eliminare questo ${ruolo}? Questa operazione è irreversibile e rimuoverà l'account dall'autenticazione e il suo ruolo associato, oltre a tutti i dati correlati (es. figli per i genitori).`)) {
      try {
        // Passa il ruolo al servizio
        await this.firebaseService.deleteUserAccountAndRole(uid, ruolo);
        alert(`${ruolo} eliminato con successo!`);
      } catch (error: any) {
        console.error(`Errore durante l'eliminazione del ${ruolo}:`, error);
        alert(`Errore durante l'eliminazione del ${ruolo}: ` + error.message);
      }
    }
  }

  async deleteBeacon(beaconId: string): Promise<void> {
    if (confirm('Sei sicuro di voler eliminare questo beacon?')) {
      try {
        await this.firebaseService.deleteBeacon(beaconId);
        alert('Beacon eliminato con successo!');
      } catch (error: any) {
        console.error('Errore durante l\'eliminazione del beacon:', error);
        alert('Errore durante l\'eliminazione del beacon: ' + error.message);
      }
    }
  }

  async deleteFermata(fermataId: string): Promise<void> {
    if (confirm('Sei sicuro di voler eliminare questa fermata? Questa operazione è irreversibile e rimuoverà tutti i dati associati a questa fermata.')) {
      try {
        await this.firebaseService.deleteFermata(fermataId);
        alert('Fermata eliminata con successo!');
      } catch (error: any) {
        console.error('Errore durante l\'eliminazione della fermata:', error);
        alert('Errore durante l\'eliminazione della fermata: ' + error.message);
      }
    }
  }

  async deleteChild(childId: string): Promise<void> {
    if (confirm('Sei sicuro di voler eliminare questo bambino? Questo rimuoverà anche eventuali notifiche e messaggi associati.')) {
      try {
        await this.firebaseService.deleteChildAndAssociatedData(childId);
        alert('Bambino eliminato con successo!');
      } catch (error: any) {
        console.error('Errore durante l\'eliminazione del bambino:', error);
        alert('Errore durante l\'eliminazione del bambino: ' + error.message);
      }
      }
  }

  openAddDriverModal(): void {
    this.showAddDriverModal = true;
    this.addDriverMessage = null;
    this.addDriverError = false;
    this.newDriver = {
      nome: '',
      cognome: '',
      email: '',
      password: ''
    };
  }

  closeAddDriverModal(): void {
    this.showAddDriverModal = false;
    this.addDriverMessage = null;
    this.addDriverError = false;
  }

  async onAddDriverSubmit(): Promise<void> {
    this.addDriverMessage = null;
    this.addDriverError = false;

    if (!this.newDriver.nome || !this.newDriver.cognome || !this.newDriver.email || !this.newDriver.password) {
      this.addDriverMessage = 'Tutti i campi sono obbligatori.';
      this.addDriverError = true;
      return;
    }

    if (!this.newDriver.email.includes('@') || !this.newDriver.email.includes('.')) {
      this.addDriverMessage = 'Formato email non valido.';
      this.addDriverError = true;
      return;
    }

    if (this.newDriver.password.length < 6) {
      this.addDriverMessage = 'La password deve essere di almeno 6 caratteri.';
      this.addDriverError = true;
      return;
    }

    try {
      // Chiama il metodo registerDriver del servizio (che ora usa la Cloud Function)
      const driverUid = await this.firebaseService.registerDriver(
        this.newDriver.email,
        this.newDriver.password,
        this.newDriver.nome,
        this.newDriver.cognome
      );

      if (driverUid) {
        this.addDriverMessage = 'Autista aggiunto con successo!';
        this.addDriverError = false;
        setTimeout(() => {
          this.closeAddDriverModal();
        }, 2000);
      } else {
        this.addDriverMessage = 'Registrazione autista fallita: UID non ricevuto.';
        this.addDriverError = true;
      }
    } catch (error: any) {
      console.error('Errore durante l\'aggiunta dell\'autista:', error);
      this.addDriverError = true;
      // Il messaggio di errore dovrebbe già venire dalla Cloud Function
      this.addDriverMessage = error.message || 'Errore sconosciuto durante la registrazione dell\'autista.';
    }
  }

  openAddFermataModal(): void {
    this.showAddFermataModal = true;
    this.addFermataMessage = null;
    this.addFermataError = false;
    this.newFermata = {
      nome: '',
      indirizzo: ''
    };
  }

  closeAddFermataModal(): void {
    this.showAddFermataModal = false;
    this.addFermataMessage = null;
    this.addFermataError = false;
  } 

  async onAddFermataSubmit(): Promise<void> {
    this.addFermataMessage = null;
    this.addFermataError = false;

    if (!this.newFermata.nome || !this.newFermata.indirizzo) {
      this.addFermataMessage = 'Tutti i campi sono obbligatori.';
      this.addFermataError = true;
      return;
    }

    try {
      await this.firebaseService.addFermata({
        nome: this.newFermata.nome,
        indirizzo: this.newFermata.indirizzo
      });

      this.addFermataMessage = 'Fermata aggiunta con successo!';
      this.addFermataError = false;
      setTimeout(() => {
        this.closeAddFermataModal();
      }, 2000);
    } catch (error: any) {
      console.error('Errore durante l\'aggiunta della fermata:', error);
      this.addFermataError = true;
      this.addFermataMessage = `Errore durante l'aggiunta della fermata: ${error.message}. Riprova.`;
    }
  }

  openAddBeaconModal(): void {
    this.showAddBeaconModal = true;
    this.addBeaconMessage = null;
    this.addBeaconError = false;
    this.newBeacon = {
      codiceIdentificativo: '',
      indirizzoMac: '',
      nomeBeacon: '',
      password: ''
    };
  }

  closeAddBeaconModal(): void {
    this.showAddBeaconModal = false;
    this.addBeaconMessage = null;
    this.addBeaconError = false;
  }

  async onAddBeaconSubmit(): Promise<void> {
    this.addBeaconMessage = null;
    this.addBeaconError = false;

    if (!this.newBeacon.codiceIdentificativo || !this.newBeacon.indirizzoMac || !this.newBeacon.nomeBeacon || !this.newBeacon.password) {
      this.addBeaconMessage = 'Tutti i campi sono obbligatori.';
      this.addBeaconError = true;
      return;
    }

    try {
      await this.firebaseService.addBeacon({
        codiceIdentificativo: this.newBeacon.codiceIdentificativo,
        indirizzoMac: this.newBeacon.indirizzoMac,
        nomeBeacon: this.newBeacon.nomeBeacon,
        password: this.newBeacon.password
      });

      this.addBeaconMessage = 'Beacon aggiunto con successo!';
      this.addBeaconError = false;
    } catch (error: any) {
      console.error('Errore durante l\'aggiunta del beacon:', error);
      this.addBeaconError = true;
      this.addBeaconMessage = `Errore durante l'aggiunta del beacon: ${error.message}. Riprova.`;
    }
  }

  openChildDetailsModal(childId: string): void {
    this.showChildDetailsModal = true;
    this.selectedChildDetails = null;
    this.childDetailsLoading = true;
    this.childDetailsError = null;

    this.subscriptions.add(
      this.firebaseService.getFiglioById(childId).subscribe({
        next: (child) => {
          this.selectedChildDetails = child;
          this.childDetailsLoading = false;
          if (!child) {
            this.childDetailsError = 'Dettagli bambino non trovati.';
          }
        },
        error: (err) => {
          console.error('Errore durante il recupero dei dettagli del bambino:', err);
          this.childDetailsLoading = false;
          this.childDetailsError = 'Errore durante il caricamento dei dettagli del bambino.';
        }
      })
    );
  }

  closeChildDetailsModal(): void {
    this.showChildDetailsModal = false;
    this.selectedChildDetails = null;
    this.childDetailsLoading = false;
    this.childDetailsError = null;
  }

  resetAddBeaconForm(): void {
    this.newBeacon = {
      codiceIdentificativo: '',
      indirizzoMac: '',
      nomeBeacon: '',
      password: ''
    };
    this.passwordVisible = false;
    const passwordInput = document.getElementById('password') as HTMLInputElement;
    if (passwordInput) {
      passwordInput.type = 'password';
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}