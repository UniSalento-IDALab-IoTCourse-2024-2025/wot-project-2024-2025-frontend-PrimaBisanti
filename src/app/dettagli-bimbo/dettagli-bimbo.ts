import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common'; // Importa TitleCasePipe
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms'; 
import { FirebaseService, Figlio, NotificaFiglio, Fermata, ChatMessage } from '../services/firebase.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-dettagli-bimbo',
  standalone: true,
  imports: [
    CommonModule,
    TitleCasePipe,
    RouterLink,
    DatePipe,
    FormsModule 
  ],
  templateUrl: './dettagli-bimbo.html',
  styleUrl: './dettagli-bimbo.scss'
})
export class DettagliBimbo implements OnInit, OnDestroy {
  @ViewChild('chatMessagesContainer') private chatMessagesContainer!: ElementRef;
  @ViewChild('chatbotMessagesPanel') private chatbotMessagesPanel!: ElementRef;

  childId: string | null = null;
  childDetails: Figlio | null = null;
  statusMessages: NotificaFiglio[] = []; 
  fermataAssociata: Fermata | null = null;
  private subscription: Subscription = new Subscription();
  private statusSubscription: Subscription | null = null;
  private chatSubscription: Subscription | null = null;

  isChatbotOpen: boolean = false;
  chatMessages: ChatMessage[] = [];
  currentChatMessage: string = '';
  isSendingMessage: boolean = false;
  chatErrorMessage: string | null = null;
  isChatbotTyping: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private firebaseService: FirebaseService
  ) { }

  ngOnInit(): void {
    this.subscription.add(
      this.route.paramMap.subscribe(params => {
        this.childId = params.get('id');
        if (this.childId) {
          this.loadChildDetails();
          this.loadStatusMessages(this.childId);
          this.loadChatMessages(this.childId);
        } else {
          console.error('ID bambino non trovato nell\'URL.');
        }
      })
    );
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    if (this.statusSubscription) {
        this.statusSubscription.unsubscribe();
    }
    if (this.chatSubscription) {
      this.chatSubscription.unsubscribe();
    }
  }

  loadChildDetails(): void {
    if (this.childId) { 
      this.subscription.add(this.firebaseService.getFiglioById(this.childId).subscribe(child => {
        this.childDetails = child;
        console.log('Dettagli bambino aggiornati ricevuti:', this.childDetails?.statoPresenza);
        if (child && child.fermataAssociataId) {
          this.firebaseService.getFermataById(child.fermataAssociataId).then(fermata => {
            this.fermataAssociata = fermata;
          }).catch(error => {
            console.error('Errore durante il caricamento della fermata associata:', error);
            this.fermataAssociata = null;
          });
        } else {
          this.fermataAssociata = null;
        }
        console.log('Dettagli bambino caricati/aggiornati:', this.childDetails);
      }, error => {
        console.error('Errore durante il caricamento dei dettagli del bambino:', error);
        this.childDetails = null;
        this.fermataAssociata = null;
      }));
    } else {
      console.warn('Child ID non disponibile per caricare i dettagli del bambino.');
      this.childDetails = null;
      this.fermataAssociata = null;
    }
  }

  loadStatusMessages(childId: string): void {
    if (this.statusSubscription) {
      this.statusSubscription.unsubscribe();
    }

    this.statusSubscription = this.firebaseService.getNotificationsForChild(childId).subscribe(
      (notifications: NotificaFiglio[]) => {
        this.statusMessages = notifications;
        console.log('Messaggi di stato caricati:', this.statusMessages);
      },
      error => {
        console.error('Errore durante il caricamento dei messaggi di stato:', error);
      }
    );
    this.subscription.add(this.statusSubscription);
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

  formatDate(date: Date | undefined): string {
    if (!date) return 'N/D';
    return new Date(date).toLocaleDateString('it-IT'); // Formato italiano
  }

  toggleChatbot(): void {
    this.isChatbotOpen = !this.isChatbotOpen;
    if (this.isChatbotOpen) {
      setTimeout(() => this.scrollToBottom(), 0);
    }
  }

  loadChatMessages(childId: string): void {
    if (this.chatSubscription) {
      this.chatSubscription.unsubscribe();
    }

    this.chatSubscription = this.firebaseService.getChatMessages(childId).subscribe(
      (messages: ChatMessage[]) => {
        this.chatMessages = messages;
        console.log('Messaggi chat caricati:', this.chatMessages);
        
        setTimeout(() => this.scrollToBottom(), 0);
      },
      error => {
        console.error('Errore durante il caricamento dei messaggi della chat:', error);
        this.chatErrorMessage = 'Impossibile caricare i messaggi della chat.';
      }
    );
    this.subscription.add(this.chatSubscription);
  }

  async sendMessage(): Promise<void> {
    if (!this.currentChatMessage.trim() || !this.childId) {
      return; // Non inviare messaggi vuoti o se l'ID del bambino non è disponibile
    }

    this.isSendingMessage = true;

    this.isSendingMessage = true; // Attiva lo stato di caricamento
    this.chatErrorMessage = null; // Resetta eventuali errori precedenti

    // Crea il messaggio dell'utente per salvarlo e visualizzarlo
    const userMessageText = this.currentChatMessage.trim();
    const userMessage: ChatMessage = {
      sender: 'Genitore',
      text: userMessageText,
      timestamp: new Date()
    };

    // Aggiungi subito il messaggio dell'utente all'array locale per aggiornare la UI in tempo reale
    // (Questo verrà poi duplicato dall'onSnapshot, ma è per feedback immediato)
    this.chatMessages.push(userMessage);
    this.currentChatMessage = ''; // Pulisci subito l'input per dare feedback visivo
    const textarea = document.querySelector('.chatbot-input textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.style.height = '40px'; // o l'altezza minima che hai impostato nel CSS
    }

    // Scrolla subito dopo l'aggiunta del messaggio utente
    setTimeout(() => this.scrollToBottom(), 0);

    try {
      // Salva il messaggio dell'utente su Firestore
      await this.firebaseService.saveChatMessage(this.childId, userMessage);
      console.log('Messaggio utente salvato in Firestore.');

      this.isChatbotTyping = true;
      setTimeout(() => this.scrollToBottom(), 0);
      // Chiama la Cloud Function per ottenere la risposta del chatbot
      // La Cloud Function dovrebbe salvare la sua risposta in Firestore.
      // Se la Cloud Function non salvasse la sua risposta in Firestore,
      // dovresti farlo qui: await this.firebaseService.saveChatMessage(this.childId, chatbotResponse);
      const chatbotResponse = await this.firebaseService.getChatbotResponse(this.childId, userMessageText);
      console.log('Risposta chatbot ricevuta (verrà visualizzata tramite onSnapshot):', chatbotResponse);

    } catch (error: any) {
      console.error('Errore durante l\'invio del messaggio o la ricezione della risposta:', error);
      this.chatErrorMessage = 'Errore durante l\'invio del messaggio. Riprova.';
      // Puoi decidere se rimuovere il messaggio utente che è stato aggiunto localmente
      // se l'invio fallisce definitivamente:
      // this.chatMessages = this.chatMessages.filter(msg => msg !== userMessage);
      this.chatMessages = this.chatMessages.filter(msg => msg !== userMessage);
      setTimeout(() => this.scrollToBottom(), 0);
    } finally {
      this.isSendingMessage = false;
      this.isChatbotTyping = false;
    }
  }

  // Funzione per scrollare la chat alla fine
  scrollToBottom(): void {
    try {
      if (this.chatbotMessagesPanel && this.chatbotMessagesPanel.nativeElement) {
        this.chatbotMessagesPanel.nativeElement.scrollTop = this.chatbotMessagesPanel.nativeElement.scrollHeight;
      }
    } catch (err) {
      console.error('Errore nello scroll della chat:', err);
    }
  }

  autoGrowTextarea(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    textarea.style.height = 'auto'; // Reset per calcolare l'altezza corretta
    textarea.style.height = textarea.scrollHeight + 'px'; // Imposta l'altezza sullo scrollHeight
  }
}