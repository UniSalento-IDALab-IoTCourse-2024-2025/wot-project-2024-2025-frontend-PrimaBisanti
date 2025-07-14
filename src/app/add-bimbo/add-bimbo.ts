// src/app/pages/add-bimbo/add-bimbo.ts

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { FirebaseService, Utente, Figlio, Fermata } from '../services/firebase.service';

@Component({
  selector: 'app-add-bimbo',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule
  ],
  templateUrl: './add-bimbo.html',
  styleUrl: './add-bimbo.scss'
})
export class AddBimbo implements OnInit, OnDestroy {
  addBimboForm!: FormGroup;
  currentUser: Utente | null = null;
  isLoading: boolean = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;
  fermate: Fermata[] = [];
  selectedFermata: Fermata | null = null;
  private userSubscription: Subscription | undefined;
  private subscriptions: Subscription = new Subscription();

  passwordBeaconVisible: boolean = false;

  constructor(
    private fb: FormBuilder,
    private firebaseService: FirebaseService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.addBimboForm = this.fb.group({
      nome: ['', Validators.required],
      cognome: ['', Validators.required],
      dataNascita: ['', Validators.required],
      codiceIdentificativoBeacon: ['', Validators.required],
      passwordBeacon: ['', Validators.required],
      fermataAssociataId: ['', Validators.required],
    });

    this.userSubscription = this.firebaseService.getCurrentUserData().subscribe(user => {
      if (user && user.ruolo === 'Genitore') {
        this.currentUser = user;
        this.caricaFermate();
      } else {
        // Se l'utente non è loggato o non è un genitore, reindirizzalo
        this.router.navigate(['/login']);
      }
    });

    this.subscriptions.add(
      this.addBimboForm.get('fermataAssociataId')?.valueChanges.subscribe(fermataId => {
        this.selectedFermata = this.fermate.find( f => f.id === fermataId) || null;
      })
    )
  }

  ngOnDestroy(): void {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
    if(this.subscriptions){
      this.subscriptions.unsubscribe();
    }
  }

  togglePasswordBeaconVisibility(): void {
    this.passwordBeaconVisible = !this.passwordBeaconVisible;
  }

  onCancel(): void {
    this.router.navigate(['/dashboards/dash-genitore']);
  }

  async caricaFermate(): Promise<void> {
    try {
      this.fermate = await this.firebaseService.getFermate();
      console.log('Fermate caricate:', this.fermate);
    } catch (error: any) {
      console.error('Errore durante il caricamento delle fermate:', error);
      this.errorMessage = 'Errore durante il caricamento delle fermate. Riprova.';
    }
  }

  async onSubmit() {
    this.isLoading = true;
    this.errorMessage = null;
    this.successMessage = null;

    if (!this.currentUser) {
      this.errorMessage = 'Errore: Utente non autenticato o ruolo non valido.';
      this.isLoading = false;
      return;
    }

    if (this.addBimboForm.invalid) {
      this.errorMessage = 'Per favore, compila tutti i campi obbligatori correttamente.';
      this.addBimboForm.markAllAsTouched(); // Mostra gli errori di validazione
      this.isLoading = false;
      return;
    }

    if(!this.selectedFermata){
      this.errorMessage = 'Seleziona una fermata valida';
      this.isLoading = false;
      return;
    }

    try {
      const formValue = this.addBimboForm.value;

      const dataNascitaDate = new Date(formValue.dataNascita);
      if (isNaN(dataNascitaDate.getTime())) {
        throw new Error('Data di nascita non valida.');
      }

      const childDataForCreation: Omit<Figlio, 'id' | 'statoPresenza' | 'beaconId' | 'genitoreId' | 'ultimaAttivita' | 'hasNewNotifications'> = {
        nome: formValue.nome,
        cognome: formValue.cognome,
        dataNascita: dataNascitaDate,
        fermataAssociataId: formValue.fermataAssociataId,
      };

      const newChildId = await this.firebaseService.addKidAndLinkBeacon(
        childDataForCreation,
        formValue.codiceIdentificativoBeacon,
        formValue.passwordBeacon,
        this.currentUser.uid,
        this.selectedFermata.id,
        this.selectedFermata.nome,
        this.selectedFermata.indirizzo
      );
      console.log('Bambino aggiunto e beacon collegato con successo, ID:', newChildId);

      this.successMessage = 'Bambino aggiunto e beacon collegato con successo!';
      this.addBimboForm.reset();
      this.isLoading = false;

      setTimeout(() => {
        this.router.navigate(['/dashboards/dash-genitore']);
      }, 2000);

    } catch (error: any) {
      this.isLoading = false;
      this.errorMessage = error.message || 'Si è verificato un errore sconosciuto durante l\'aggiunta del bambino.';
      console.error('Errore in onSubmit AddBimbo:', error);
    }
  }
}