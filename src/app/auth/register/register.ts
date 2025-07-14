// src/app/auth/register/register.ts

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { FirebaseService } from '../../services/firebase.service';


@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './register.html',
  styleUrl: './register.scss'
})
export class Register {
  firstName: string = '';
  lastName: string = '';
  email: string = '';
  password: string = '';
  repeatPassword: string = '';

  errorMessage: string | null = null;

  passwordVisible1: boolean = false;
  passwordVisible2: boolean = false;

  constructor(private firebaseService: FirebaseService, private router: Router) { } 

  togglePasswordVisibility1(): void{
    this.passwordVisible1 = !this.passwordVisible1
  }

  togglePasswordVisibility2(): void{
    this.passwordVisible2 = !this.passwordVisible2
  }

  async onSubmit() {
    this.errorMessage = null;

    if (!this.firstName || !this.lastName || !this.email || !this.password || !this.repeatPassword) {
      this.errorMessage = 'Tutti i campi obbligatori devono essere compilati.';
      return;
    }

    if (this.password !== this.repeatPassword) {
      this.errorMessage = 'Le password non corrispondono.';
      return;
    }

    if (this.password.length < 6) {
      this.errorMessage = 'La password deve essere di almeno 6 caratteri.';
      return;
    }

    try {
      // 1. Registra l'utente usando il metodo del FirebaseService
      const user = await this.firebaseService.registerGenitore(this.email, this.password, this.firstName, this.lastName);

      if (user) {
        await this.firebaseService.sendEmailVerification(user);

        // 2. Determina il ruolo dell'utente
        const userRole = 'Genitore'; // Ruolo fisso per la registrazione

        // 3. Salva il documento del ruolo in Firestore usando il metodo del FirebaseService
        // Questo metodo è stato aggiunto in firebase.service.ts per centralizzare questa logica
        await this.firebaseService.saveUserRoleAndData(user.uid, user.email, this.firstName, this.lastName, userRole);

        console.log('Registrazione utente e ruolo completata con successo!', user);

        // 4. Reindirizza l'utente alla dashboard appropriata dopo la registrazione
        this.router.navigate(['/dashboards/dash-genitore']);

        this.firebaseService.requestNotificationPermissionAndSaveToken();

      } else {
        throw new Error("Utente non disponibile dopo la registrazione.");
      }

    } catch (error: any) {
      console.error('Errore durante la registrazione:', error.code, error.message);
      switch (error.code) {
        case 'auth/email-already-in-use':
          this.errorMessage = 'Questa email è già in uso. Prova a fare il login.';
          break;
        case 'auth/invalid-email':
          this.errorMessage = 'Formato email non valido.';
          break;
        case 'auth/weak-password':
          this.errorMessage = 'La password è troppo debole.';
          break;
        default:
          this.errorMessage = `Errore di registrazione: ${error.message}. Riprova.`;
          break;
      }
    }
  }

  async onRegisterWithGoogle(): Promise<void> {
    this.errorMessage = null;
    try {
      // Per Google, signInWithGoogle nel servizio gestisce sia il login che la registrazione
      const user = await this.firebaseService.signInWithGoogle();

      if (user) {
        console.log('Registrazione/Login con Google completata con successo!', user);

        // A questo punto, il FirebaseService ha già gestito la creazione/recupero del ruolo utente in Firestore.
        // Possiamo navigare direttamente alla dashboard del genitore.
        this.router.navigate(['/dashboards/dash-genitore']);
      } else {
        throw new Error("Utente non disponibile dopo il tentativo con Google.");
      }

    } catch (error: any) {
      console.error('Errore durante la registrazione/login con Google:', error.code, error.message);
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
          this.errorMessage = `Errore di registrazione/login con Google: ${error.message}. Riprova.`;
          break;
      }
    }
  }
}