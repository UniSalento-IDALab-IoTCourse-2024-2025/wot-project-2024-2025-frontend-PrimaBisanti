import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DashGenitore } from './dash-genitore';

describe('DashGenitore', () => {
  let component: DashGenitore;
  let fixture: ComponentFixture<DashGenitore>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashGenitore]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DashGenitore);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
