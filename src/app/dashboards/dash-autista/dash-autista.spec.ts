import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DashAutista } from './dash-autista';

describe('DashAutista', () => {
  let component: DashAutista;
  let fixture: ComponentFixture<DashAutista>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashAutista]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DashAutista);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
