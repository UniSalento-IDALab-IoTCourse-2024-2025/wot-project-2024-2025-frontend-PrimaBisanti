import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DettagliBimbo } from './dettagli-bimbo';

describe('DettagliBimbo', () => {
  let component: DettagliBimbo;
  let fixture: ComponentFixture<DettagliBimbo>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DettagliBimbo]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DettagliBimbo);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
