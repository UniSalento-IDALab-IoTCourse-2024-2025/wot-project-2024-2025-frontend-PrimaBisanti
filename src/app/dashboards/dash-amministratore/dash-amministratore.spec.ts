import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DashAmministratore } from './dash-amministratore';

describe('DashAmministratore', () => {
  let component: DashAmministratore;
  let fixture: ComponentFixture<DashAmministratore>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashAmministratore]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DashAmministratore);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
