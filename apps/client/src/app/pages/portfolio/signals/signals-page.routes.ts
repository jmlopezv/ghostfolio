import { AuthGuard } from '@ghostfolio/client/core/auth.guard';

import { Routes } from '@angular/router';

import { GfSignalsPageComponent } from './signals-page.component';

export const routes: Routes = [
  {
    canActivate: [AuthGuard],
    component: GfSignalsPageComponent,
    path: '',
    title: $localize`Signals`
  }
];
