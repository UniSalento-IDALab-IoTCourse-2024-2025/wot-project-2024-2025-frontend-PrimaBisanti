// src/app/core/firebase.ts

import { Injectable } from '@angular/core';
import { FirebaseApp } from '@angular/fire/app'; // Usa il tipo da @angular/fire
import { Auth } from '@angular/fire/auth'; // Usa il tipo da @angular/fire
import { Firestore } from '@angular/fire/firestore'; // Usa il tipo da @angular/fire
import { Functions } from '@angular/fire/functions'; // Usa il tipo da @angular/fire

@Injectable({
  providedIn: 'root'
})
export class Firebase {
  // Le proprietà saranno assegnate dal costruttore tramite iniezione
  public app: FirebaseApp;
  public auth: Auth;
  public firestore: Firestore;
  public functions: Functions;

  // Angular inietterà queste istanze dopo che app.config.ts le avrà fornite
  constructor(
    private _app: FirebaseApp, // Inietta l'app Firebase
    private _auth: Auth,       // Inietta il servizio Auth
    private _firestore: Firestore, // Inietta il servizio Firestore
    private _functions: Functions  // Inietta il servizio Functions
  ) {
    this.app = _app;
    this.auth = _auth;
    this.firestore = _firestore;
    this.functions = _functions;

    console.log('Firebase App iniettata:', this.app.name);
    console.log('Firebase Auth istanza disponibile:', this.auth);
    console.log('Firebase Firestore istanza disponibile:', this.firestore);
    console.log('Firebase Functions istanza disponibile:', this.functions);
  }
}