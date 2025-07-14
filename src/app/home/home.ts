import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Firebase } from '../core/firebase';
import { onAuthStateChanged, Unsubscribe } from 'firebase/auth';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.html',
  styleUrls: ['./home.scss']
})
export class Home implements OnInit, OnDestroy {
  isAuthenticated: boolean = false;
  private authStateUnsubscribe: Unsubscribe | undefined;

  constructor(private firebaseService: Firebase) { }

  ngOnInit(): void {
    // Ascolta lo stato di autenticazione di Firebase
    this.authStateUnsubscribe = onAuthStateChanged(this.firebaseService.auth, (user) => {
      this.isAuthenticated = !!user;
      console.log('Home Component: isAuthenticated =', this.isAuthenticated);
    });
  }

  ngOnDestroy(): void {
    if (this.authStateUnsubscribe) {
      this.authStateUnsubscribe();
    }
  }
}