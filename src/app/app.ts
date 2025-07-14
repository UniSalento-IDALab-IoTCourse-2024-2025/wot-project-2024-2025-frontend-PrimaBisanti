import { ApplicationConfig, Component, OnInit } from '@angular/core';
import { Firebase } from './core/firebase';
import { provideRouter, RouterOutlet, RouterLink } from '@angular/router'; // <-- AGGIUNGI RouterOutlet e RouterLink
import { routes } from './app.routes';
import { Navbar } from './navbar/navbar';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    Navbar,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  standalone: true
})
export class App implements OnInit{
  protected title = 'iot-scuolabus';

  constructor(private firebaseService: Firebase) { }

  ngOnInit(): void {
    console.log('Firebase Auth istanza disponibile:', this.firebaseService.auth);
  }
}